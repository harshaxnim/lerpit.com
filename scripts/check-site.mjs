#!/usr/bin/env node
/*
 * check-site: drive the real site in Chrome and record what a reader would meet.
 *
 * Unit tests cover the parts that can run without a page. This covers the rest: the
 * player activating chapters as the page scrolls, panels and tabs appearing, canvases
 * drawing and moving, the readings and controls corners, live code building, the
 * mobile drawer, and nothing overflowing at phone width. It is written to be run
 * before and after a change and compared, so a refactor that moves nothing a reader
 * can see comes back clean, and one that does says exactly where.
 *
 *   node scripts/check-site.mjs --name baseline            # record
 *   node scripts/check-site.mjs --name after --against baseline
 *
 * Options:
 *   --base URL        the running site (default http://localhost:4321)
 *   --name NAME       output folder under test-results/visual/ (default "run")
 *   --against NAME    a previous run to compare facts and screenshots with
 *   --sizes LIST      viewports as WxH, comma separated (default 1400x900,390x844)
 *   --only TEXT       only routes whose path contains TEXT
 *   --compile-ms N    how long to wait for an in-browser C++ build (default 120000)
 *   --headed          show the browser
 *
 * No dependencies beyond Node 22 and a local Chrome. Chrome talks over its DevTools
 * protocol through Node's own WebSocket, and every PNG is decoded and compared inside
 * a blank Chrome tab, so there is no image library to install.
 *
 * Two kinds of screenshot are taken per chapter. "masked" hides everything that moves
 * on its own (canvases, live numbers, graphs, build timings) and turns animation off,
 * so two runs of unchanged code produce the same pixels; those are what is diffed.
 * "live" is the page as a reader sees it, kept for looking at, never diffed.
 *
 * Exit code is 1 when an invariant fails (a console error, a blank canvas, horizontal
 * overflow, a chapter with no tabs). Differences from the comparison run are reported
 * but do not fail: some changes are the point, and a person decides which.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const BASE = (args.base ?? 'http://localhost:4321').replace(/\/$/, '');
const NAME = args.name ?? 'run';
const ROOT = path.resolve('test-results/visual');
const OUT = path.join(ROOT, NAME);
const AGAINST = args.against ? path.join(ROOT, args.against) : null;
const SIZES = (args.sizes ?? '1400x900,390x844').split(',').map((s) => s.split('x').map(Number));
const COMPILE_MS = Number(args['compile-ms'] ?? 120000);
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9300 + Math.floor(Math.random() * 400);

/** The drawer breakpoint, from playerClient.ts. Below it the stage is a drawer. */
const DRAWER_MAX = 1180;
/** A pixel is different when its channels differ by more than this, summed. */
const PIXEL_TOLERANCE = 40;
/** A masked screenshot that differs on more than this share of pixels is reported. */
const DIFF_REPORT = 0.0015;

/** Everything that moves on its own, hidden so masked screenshots are repeatable. */
const MASK_CSS = `
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
  canvas, .lerpette-reading__value, .lerpette-reading__graph, .lerpette-readout, .lerpette-table,
  .live-code__status, .live-code__log, .cm-cursor, .cm-cursorLayer, .tp-grlv, .tp-fpsv { visibility: hidden !important; }
`;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'live'), { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...parts) => console.log(...parts);

// ------------------------------------------------------------------ chrome + cdp

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lerpit-check-'));
const chrome = spawn(
  CHROME,
  [
    ...(args.headed ? [] : ['--headless=new']),
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--mute-audio',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--enable-unsafe-swiftshader',
    '--window-size=1400,900',
    'about:blank'
  ],
  { stdio: 'ignore' }
);

let browserWs = null;
for (let i = 0; i < 100 && !browserWs; i += 1) {
  try {
    browserWs = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl;
  } catch {
    await sleep(150);
  }
}
if (!browserWs) {
  console.error(`Chrome did not start (looked for it at ${CHROME}).`);
  process.exit(2);
}

const cdp = await connect(browserWs);

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message} ${message.error.data ?? ''}`));
      else resolve(message.result);
      return;
    }
    for (const listener of listeners) listener(message);
  });

  return {
    send(method, params = {}, sessionId) {
      const id = ++nextId;
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    listen(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    close() {
      ws.close();
    }
  };
}

async function openTab() {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => cdp.send(method, params, sessionId);
  const tab = { send, sessionId, targetId, errors: [], warnings: [], events: new Map() };

  cdp.listen((message) => {
    if (message.sessionId !== sessionId) return;
    const { method, params } = message;
    if (method === 'Runtime.exceptionThrown') {
      const d = params.exceptionDetails;
      tab.errors.push(`exception: ${(d.exception?.description ?? d.text ?? '').split('\n')[0]}`);
    } else if (method === 'Runtime.consoleAPICalled') {
      const text = params.args.map((a) => a.value ?? a.description ?? '').join(' ').split('\n')[0];
      if (params.type === 'error' || params.type === 'assert') tab.errors.push(`console: ${text}`);
      else if (params.type === 'warning') tab.warnings.push(text);
    } else if (method === 'Log.entryAdded' && params.entry.level === 'error') {
      tab.errors.push(`${params.entry.source}: ${params.entry.text}${params.entry.url ? ` (${params.entry.url})` : ''}`);
    }
    const waiters = tab.events.get(method);
    if (waiters) {
      tab.events.delete(method);
      waiters.forEach((fn) => fn(params));
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  return tab;
}

function once(tab, method, timeout = 30000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeout);
    const list = tab.events.get(method) ?? [];
    list.push((params) => {
      clearTimeout(timer);
      resolve(params);
    });
    tab.events.set(method, list);
  });
}

async function evaluate(tab, expression) {
  const result = await tab.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(`evaluate failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
  }
  return result.result?.value;
}

async function screenshot(tab, clip) {
  const params = { format: 'png' };
  if (clip) params.clip = { ...clip, scale: 1 };
  return (await tab.send('Page.captureScreenshot', params)).data;
}

// ------------------------------------------------------------------ pixel lab
// A blank tab that decodes and compares PNGs with a canvas, so Node needs no codec.

const lab = await openTab();
await evaluate(
  lab,
  `(() => {
    const decode = (b64) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = new OffscreenCanvas(img.width, img.height);
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        resolve({ w: img.width, h: img.height, d: g.getImageData(0, 0, img.width, img.height).data });
      };
      img.onerror = reject;
      img.src = 'data:image/png;base64,' + b64;
    });
    window.labDiff = async (a, b, tolerance, wantImage) => {
      const [A, B] = await Promise.all([decode(a), decode(b)]);
      if (A.w !== B.w || A.h !== B.h) return { sizeChanged: true, from: [A.w, A.h], to: [B.w, B.h], fraction: 1 };
      let changed = 0;
      const out = wantImage ? new ImageData(A.w, A.h) : null;
      for (let i = 0; i < A.d.length; i += 4) {
        const delta = Math.abs(A.d[i] - B.d[i]) + Math.abs(A.d[i + 1] - B.d[i + 1]) + Math.abs(A.d[i + 2] - B.d[i + 2]);
        const differs = delta > tolerance;
        if (differs) changed += 1;
        if (out) {
          const grey = (B.d[i] + B.d[i + 1] + B.d[i + 2]) / 3;
          out.data[i] = differs ? 230 : 255 - (255 - grey) * 0.25;
          out.data[i + 1] = differs ? 30 : 255 - (255 - grey) * 0.25;
          out.data[i + 2] = differs ? 30 : 255 - (255 - grey) * 0.25;
          out.data[i + 3] = 255;
        }
      }
      const result = { fraction: changed / (A.w * A.h), pixels: changed };
      if (out && changed > 0) {
        const c = new OffscreenCanvas(A.w, A.h);
        c.getContext('2d').putImageData(out, 0, 0);
        const blob = await c.convertToBlob({ type: 'image/png' });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        result.image = btoa(s);
      }
      return result;
    };
    return true;
  })()`
);

async function diff(a, b, wantImage = false) {
  return evaluate(lab, `labDiff(${JSON.stringify(a)}, ${JSON.stringify(b)}, ${PIXEL_TOLERANCE}, ${wantImage})`);
}

// ------------------------------------------------------------------ routes

async function discoverRoutes() {
  const html = await (await fetch(`${BASE}/library/`)).text();
  const found = new Set(['/', '/library/']);
  for (const match of html.matchAll(/href="(\/[a-z0-9-]+\/(?:[a-z0-9-]+\/)?)"/gi)) {
    if (!match[1].startsWith('/assets/')) found.add(match[1]);
  }
  return [...found].filter((route) => !args.only || route.includes(args.only));
}

// ------------------------------------------------------------------ page probes (run in the page)

const PAGE_FACTS = `(() => {
  const q = (s) => document.querySelector(s);
  const qa = (s) => [...document.querySelectorAll(s)];
  const text = (el) => (el?.textContent ?? '').replace(/\\s+/g, ' ').trim();
  return {
    title: document.title,
    heading: text(q('.lerpette-player__heading h1')),
    isLesson: !!q('[data-lerpette-player] [data-section-id]'),
    hasStage: !!q('.lerpette-stage'),
    sections: qa('[data-section-id]').map((s) => ({ id: s.dataset.sectionId, title: text(s.querySelector('h2')) })),
    problems: qa('.content-problems__item').map((li) => text(li)),
    problemsTitle: text(q('.content-problems__title')),
    cards: qa('.cassette-card').map((c) => text(c.querySelector('.cassette-card__title, h3, h4')) || text(c).slice(0, 60)),
    cardTags: qa('[data-status]').map((el) => el.dataset.status),
    spines: qa('.brand-spine').length,
    footer: text(q('.site-footer')),
    devToggle: q('#lerpit-view-toggle')?.textContent ?? null,
    editors: qa('.lerpette-code').length,
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    docHeight: document.documentElement.scrollHeight,
    missingRuntimeMarks: qa('.lerpette-step__missing-runtime').length
  };
})()`;

const STAGE_FACTS = `(() => {
  const q = (s) => document.querySelector(s);
  const qa = (s) => [...document.querySelectorAll(s)];
  const text = (el) => (el?.textContent ?? '').replace(/\\s+/g, ' ').trim();
  const host = q('[data-panel-host]');
  const stage = q('.lerpette-stage');
  const toggle = q('[data-stage-toggle]');
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const activeBox = host?.querySelector('.lerpette-panel__box.is-active') ?? host;
  return {
    activeSection: q('[data-section-id].is-active')?.dataset.sectionId ?? null,
    bylineNow: q('[data-byline-section]')?.hidden ? '' : text(q('[data-byline-now]')),
    tabs: qa('[data-panel-tabs] button').map((b) => ({ label: text(b), selected: b.getAttribute('aria-selected') === 'true', disabled: b.disabled })),
    caption: text(q('[data-stage-status]')),
    captionShown: visible(q('[data-stage-status]')) && !host?.classList.contains('is-uncaptioned'),
    hostClass: host?.className ?? null,
    hostChildren: host?.children.length ?? 0,
    canvases: host ? [...host.querySelectorAll('canvas')].filter(visible).length : 0,
    activeCanvas: !!activeBox?.querySelector('canvas'),
    controlsCard: qa('.lerpette-stage__card').some((c) => c.querySelector('.lerpette-stage__controls') || c.querySelector('[aria-label="Restart"]')),
    controlsTitle: qa('.lerpette-stage__card-title').map(text),
    controlsCollapsed: qa('.lerpette-stage__card').filter((c) => c.querySelector('.lerpette-stage__controls')).map((c) => c.classList.contains('is-collapsed')),
    restart: !!q('[aria-label="Restart"]'),
    readings: qa('.lerpette-reading').map((r) => text(r.querySelector('.lerpette-reading__label'))),
    readingsMode: (() => {
      const card = qa('.lerpette-stage__card').find((c) => c.querySelector('.lerpette-reading'));
      if (!card) return null;
      return card.classList.contains('is-collapsed') ? 'collapsed' : card.classList.contains('is-mini') ? 'mini' : 'expanded';
    })(),
    panelText: (() => {
      const pre = host?.querySelector('.lerpette-panel__box.is-active .lerpette-readout, .lerpette-panel__box.is-active .lerpette-table');
      return pre ? text(pre).slice(0, 200) : null;
    })(),
    drawer: toggle ? { open: stage.classList.contains('is-open'), expanded: toggle.getAttribute('aria-expanded'), label: toggle.getAttribute('aria-label'), text: text(toggle.querySelector('[data-panel-label]')) } : null
  };
})()`;

const EDITOR_FACTS = (id) => `(() => {
  const section = document.querySelector('[data-section-id="${id}"]');
  return [...(section?.querySelectorAll('.lerpette-code') ?? [])].map((box) => ({
    built: !!box.querySelector('.live-code'),
    broken: box.classList.contains('lerpette-code--broken'),
    tabs: [...box.querySelectorAll('.live-code__tab')].map((t) => t.textContent.trim()),
    status: box.querySelector('.live-code__status')?.textContent.trim() ?? null,
    statusKind: box.querySelector('.live-code__status')?.dataset.kind ?? null
  }));
})()`;

// ------------------------------------------------------------------ helpers

function slug(route) {
  return route === '/' ? 'home' : route.replace(/^\/|\/$/g, '').replace(/\//g, '__');
}

async function setSize(tab, [width, height]) {
  await tab.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
  await tab.send('Emulation.setTouchEmulationEnabled', { enabled: width < 700 });
}

async function load(tab, url) {
  const loaded = once(tab, 'Page.loadEventFired', 45000);
  await tab.send('Page.navigate', { url });
  await loaded;
  await evaluate(tab, 'document.fonts.ready.then(() => true)');
  await sleep(600);
}

async function rectOf(tab, selector) {
  return evaluate(
    tab,
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
      const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return null;
      const x = Math.max(0, r.left), y = Math.max(0, r.top);
      // Screenshot clips are in document coordinates, not the window's.
      return { x: x + scrollX, y: y + scrollY, width: Math.min(r.right, innerWidth) - x, height: Math.min(r.bottom, innerHeight) - y }; })()`
  );
}

/** Whether the panel's canvases add pixels, and whether those pixels move. */
async function probeCanvas(tab) {
  const clip = await rectOf(tab, '[data-panel-host]');
  if (!clip || clip.width < 4 || clip.height < 4) return { drawn: null, moving: null };
  const first = await screenshot(tab, clip);
  // Long enough for a slow sketch to move a pixel: some lessons breathe at 0.03 rad a frame.
  await sleep(1000);
  const second = await screenshot(tab, clip);
  await evaluate(tab, `document.querySelectorAll('[data-panel-host] canvas').forEach((c) => c.style.setProperty('visibility', 'hidden', 'important')); true`);
  await sleep(60);
  const bare = await screenshot(tab, clip);
  await evaluate(tab, `document.querySelectorAll('[data-panel-host] canvas').forEach((c) => c.style.removeProperty('visibility')); true`);
  const drawn = await diff(bare, second);
  const moving = await diff(first, second);
  return { drawn: drawn.fraction > 0.0005, drawnFraction: +drawn.fraction.toFixed(5), moving: moving.fraction > 0.00003, movingFraction: +moving.fraction.toFixed(5) };
}

async function maskedShot(tab, file) {
  await evaluate(tab, `(() => { const s = document.createElement('style'); s.id = '__mask'; s.textContent = ${JSON.stringify(MASK_CSS)}; document.head.append(s); return true; })()`);
  await sleep(80);
  const data = await screenshot(tab);
  await evaluate(tab, `document.getElementById('__mask')?.remove(); true`);
  fs.writeFileSync(path.join(OUT, 'shots', file), Buffer.from(data, 'base64'));
}

async function liveShot(tab, file) {
  const data = await screenshot(tab);
  fs.writeFileSync(path.join(OUT, 'live', file), Buffer.from(data, 'base64'));
}

/**
 * Press the drawer toggle and wait for the drawer to reach `open`. One press, polled for
 * up to a second and a half; if it has not moved by then, one more press. A second press
 * is recorded (`presses: 2`), so a toggle that needs two is visible in the facts rather
 * than hidden by the retry.
 */
async function toggleDrawer(tab, open) {
  for (let press = 1; press <= 2; press += 1) {
    await evaluate(tab, `document.querySelector('[data-stage-toggle]')?.click(); true`);
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline) {
      await sleep(100);
      const drawer = (await evaluate(tab, STAGE_FACTS)).drawer;
      if (drawer?.open === open) {
        await sleep(350);
        return { ...drawer, ...(press > 1 ? { presses: press } : {}) };
      }
    }
  }
  return (await evaluate(tab, STAGE_FACTS)).drawer;
}

/** Scroll until the player says this section is the active one. */
async function scrollToSection(tab, id) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await evaluate(
      tab,
      `(() => {
        const s = document.querySelector('[data-section-id="${id}"]');
        if (!s) return false;
        if ('${id}' === 'intro' || s === document.querySelector('[data-section-id]')) { window.scrollTo(0, 0); return true; }
        const byline = document.querySelector('.lerpette-brow--pinned');
        const pinned = byline ? byline.getBoundingClientRect().height : 0;
        window.scrollTo(0, s.getBoundingClientRect().top + scrollY - pinned + ${8 + attempt * 20});
        return true;
      })()`
    );
    await sleep(250);
    const active = await evaluate(tab, `document.querySelector('[data-section-id].is-active')?.dataset.sectionId ?? null`);
    if (active === id) return true;
  }
  return false;
}

/** Wait until the stage has settled on a chapter: tabs drawn and, for live code, a build finished. */
async function settle(tab, id, hasEditors) {
  const deadline = Date.now() + (hasEditors ? COMPILE_MS : 8000);
  await sleep(900);
  while (Date.now() < deadline) {
    const state = await evaluate(
      tab,
      `(() => {
        const tabs = document.querySelectorAll('[data-panel-tabs] button').length;
        const busy = [...document.querySelectorAll('[data-section-id="${id}"] .live-code__status')].some((s) => s.dataset.kind === 'busy');
        return { tabs, busy };
      })()`
    );
    if (state.tabs > 0 && !state.busy) break;
    await sleep(400);
  }
  await sleep(700);
}

// ------------------------------------------------------------------ interactions (wide only)

async function exerciseStage(tab, facts) {
  const out = {};

  // Every tab, each shown in turn, then back to the first.
  if (facts.tabs.length > 1) {
    out.tabs = [];
    for (let i = 0; i < facts.tabs.length; i += 1) {
      await evaluate(tab, `document.querySelectorAll('[data-panel-tabs] button')[${i}]?.click(); true`);
      await sleep(350);
      const shown = await evaluate(tab, STAGE_FACTS);
      out.tabs.push({
        label: facts.tabs[i].label,
        selected: shown.tabs[i]?.selected ?? false,
        captionShown: shown.captionShown,
        panelText: shown.panelText,
        activeCanvas: shown.activeCanvas
      });
    }
    await evaluate(tab, `document.querySelectorAll('[data-panel-tabs] button')[0]?.click(); true`);
    await sleep(250);
  }

  // The readings card folds on its title, and a reading shrinks the card to itself.
  if (facts.readings.length > 0) {
    const fold = async () => {
      await evaluate(tab, `[...document.querySelectorAll('.lerpette-stage__card')].find((c) => c.querySelector('.lerpette-reading'))?.querySelector('.lerpette-stage__card-title')?.click(); true`);
      await sleep(150);
      return (await evaluate(tab, STAGE_FACTS)).readingsMode;
    };
    out.readingsFold = [await fold(), await fold()];
  }

  // Controls fold on their title.
  if (facts.controlsCollapsed.length > 0) {
    const fold = async () => {
      await evaluate(tab, `[...document.querySelectorAll('.lerpette-stage__card')].find((c) => c.querySelector('.lerpette-stage__controls'))?.querySelector('.lerpette-stage__card-title')?.click(); true`);
      await sleep(150);
      return (await evaluate(tab, STAGE_FACTS)).controlsCollapsed[0];
    };
    out.controlsFold = [await fold(), await fold()];
  }

  // Leaving the tab and coming back must not rebuild the chapter. The cards are marked
  // and the page is told it was hidden and shown; a rebuild replaces the marked nodes.
  out.survivesTabReturn = await evaluate(
    tab,
    `(async () => {
      const marked = [...document.querySelectorAll('.lerpette-stage__card, [data-panel-host] canvas')];
      marked.forEach((el) => (el.dataset.probe = '1'));
      const set = (hidden) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
        document.dispatchEvent(new Event('visibilitychange'));
      };
      set(true);
      await new Promise((r) => setTimeout(r, 200));
      set(false);
      delete document.hidden;
      delete document.visibilityState;
      await new Promise((r) => setTimeout(r, 900));
      return marked.length === 0 ? null : marked.every((el) => el.isConnected);
    })()`
  );

  // Restart rebuilds the step and keeps it running.
  if (facts.restart) {
    await evaluate(tab, `document.querySelector('[aria-label="Restart"]')?.click(); true`);
    await sleep(1200);
    const after = await evaluate(tab, STAGE_FACTS);
    out.restart = { restartStill: after.restart, readings: after.readings, canvases: after.canvases };
    out.restartCanvas = await probeCanvas(tab);
  }

  return out;
}

// ------------------------------------------------------------------ the walk

const routes = await discoverRoutes();
const tab = await openTab();
const facts = { base: BASE, sizes: SIZES.map((s) => s.join('x')), when: new Date().toISOString(), routes: {}, dev: {} };
const failures = [];
const fail = (where, what) => failures.push(`${where}: ${what}`);

log(`check-site → ${path.relative(process.cwd(), OUT)}  (${routes.length} routes × ${SIZES.length} sizes)`);

for (const route of routes) {
  facts.routes[route] = {};
  for (const size of SIZES) {
    const sizeKey = size.join('x');
    const where = `${route} @${sizeKey}`;
    const [width] = size;
    tab.errors.length = 0;
    tab.warnings.length = 0;

    await setSize(tab, size);
    const response = await fetch(BASE + route);
    await load(tab, BASE + route);
    const page = await evaluate(tab, PAGE_FACTS);
    page.status = response.status;
    const record = { page, chapters: {} };
    facts.routes[route][sizeKey] = record;

    if (response.status !== 200) fail(where, `HTTP ${response.status}`);
    if (page.overflowX > 0) fail(where, `scrolls sideways by ${page.overflowX}px`);
    if (page.spines < 2) fail(where, `expected the brand spine in header and footer, found ${page.spines}`);

    const base = `${slug(route)}@${sizeKey}`;
    if (!page.isLesson) {
      await maskedShot(tab, `${base}.png`);
      await liveShot(tab, `${base}.png`);
      // The whole page as well, for pages taller than the window.
      const height = await evaluate(tab, 'document.documentElement.scrollHeight');
      if (height > size[1]) {
        await evaluate(tab, `window.scrollTo(0, document.documentElement.scrollHeight); true`);
        await sleep(300);
        await maskedShot(tab, `${base}-end.png`);
      }
    }

    for (const section of page.isLesson ? page.sections : []) {
      const shotName = `${base}-${section.id}.png`;
      const reached = await scrollToSection(tab, section.id);
      const editorsHere = await evaluate(tab, `document.querySelectorAll('[data-section-id="${section.id}"] .lerpette-code').length`);
      await settle(tab, section.id, editorsHere > 0);

      const chapter = { reached, ...(page.hasStage ? await evaluate(tab, STAGE_FACTS) : {}) };
      chapter.editors = await evaluate(tab, EDITOR_FACTS(section.id));

      // Without a stage the player never starts, so nothing is marked active, by design.
      if (!reached && page.hasStage) fail(`${where} #${section.id}`, 'scrolling there did not make it the active section');

      if (page.hasStage) {
        const drawer = width < DRAWER_MAX;
        if (drawer) {
          // The drawer is the only way to the panel here: open it, look, close it.
          chapter.drawerOpened = await toggleDrawer(tab, true);
          chapter.canvas = chapter.canvases > 0 || chapter.activeCanvas ? await probeCanvas(tab) : null;
          await maskedShot(tab, shotName.replace('.png', '-drawer.png'));
          await liveShot(tab, shotName.replace('.png', '-drawer.png'));
          chapter.drawerClosed = await toggleDrawer(tab, false);
          if (!chapter.drawerOpened?.open) fail(`${where} #${section.id}`, 'the drawer did not open');
          if (chapter.drawerClosed?.open) fail(`${where} #${section.id}`, 'the drawer did not close');
        } else {
          chapter.canvas = chapter.activeCanvas ? await probeCanvas(tab) : null;
        }

        if (chapter.tabs.length === 0) fail(`${where} #${section.id}`, 'the stage has no tabs');
        if (chapter.hostChildren === 0) fail(`${where} #${section.id}`, 'the panel host is empty');
        if (chapter.canvas && chapter.canvas.drawn === false) fail(`${where} #${section.id}`, 'the canvas drew nothing');
      }

      for (const editor of chapter.editors) {
        if (!editor.built) fail(`${where} #${section.id}`, 'a code box was never built');
        if (editor.statusKind === 'bad') fail(`${where} #${section.id}`, `a build failed: ${editor.status}`);
        if (editor.statusKind === 'busy') fail(`${where} #${section.id}`, `a build was still running after ${COMPILE_MS}ms`);
      }

      await maskedShot(tab, shotName);
      await liveShot(tab, shotName);

      if (page.hasStage && width >= DRAWER_MAX) {
        chapter.interactions = await exerciseStage(tab, chapter);
        if (chapter.interactions.survivesTabReturn === false) {
          // Recorded, not failed: the baseline is known to rebuild 3D chapters here.
          chapter.notes = ['rebuilt on returning to the tab'];
        }
      }

      record.chapters[section.id] = chapter;
      process.stdout.write('.');
    }

    record.errors = [...tab.errors];
    record.warnings = [...new Set(tab.warnings)];
    for (const error of record.errors) fail(where, error);
    process.stdout.write(` ${route} ${sizeKey}\n`);
  }
}

// ------------------------------------------------------------------ the dev view switch

{
  await setSize(tab, SIZES[0]);
  const read = async () => ({
    toggle: await evaluate(tab, `document.querySelector('#lerpit-view-toggle')?.textContent ?? null`),
    cards: await evaluate(tab, `document.querySelectorAll('.cassette-card').length`),
    tags: await evaluate(tab, `[...document.querySelectorAll('[data-status]')].map((e) => e.dataset.status)`)
  });
  await load(tab, `${BASE}/library/`);
  facts.dev.local = await read();
  await evaluate(tab, `document.querySelector('#lerpit-view-toggle')?.click(); true`);
  await once(tab, 'Page.loadEventFired', 20000);
  await sleep(800);
  facts.dev.public = await read();
  // Every route again, as a reader of the deployed site would get it.
  facts.dev.publicStatus = {};
  for (const route of routes) {
    const status = (await fetch(BASE + route, { headers: { cookie: 'lerpit-view=public' } })).status;
    facts.dev.publicStatus[route] = status;
  }
  await evaluate(tab, `document.querySelector('#lerpit-view-toggle')?.click(); true`);
  await once(tab, 'Page.loadEventFired', 20000);
  await sleep(500);
  facts.dev.backToLocal = await read();
  if (facts.dev.local.toggle !== 'L') fail('dev toggle', `local view shows "${facts.dev.local.toggle}"`);
  if (facts.dev.public.toggle !== 'P') fail('dev toggle', `public view shows "${facts.dev.public.toggle}"`);
  if (facts.dev.backToLocal.toggle !== 'L') fail('dev toggle', 'did not switch back to local');
}

fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(facts, null, 1));

// ------------------------------------------------------------------ compare

const report = [`# check-site: ${NAME}`, '', `${new Date().toISOString()} · ${BASE} · ${facts.sizes.join(', ')}`, ''];
report.push(`## Invariants`, '', failures.length ? failures.map((f) => `- ${f}`).join('\n') : 'All held.', '');

if (AGAINST && fs.existsSync(path.join(AGAINST, 'facts.json'))) {
  const before = JSON.parse(fs.readFileSync(path.join(AGAINST, 'facts.json'), 'utf8'));
  report.push(`## Facts that changed since ${args.against}`, '');
  const changes = [];
  compareFacts(before, facts, '', changes);
  report.push(changes.length ? changes.map((c) => `- ${c}`).join('\n') : 'None.', '');

  report.push(`## Screenshots that changed since ${args.against}`, '');
  fs.mkdirSync(path.join(OUT, 'diffs'), { recursive: true });
  const rows = [];
  const beforeShots = new Set(fs.readdirSync(path.join(AGAINST, 'shots')));
  const afterShots = fs.readdirSync(path.join(OUT, 'shots'));
  for (const file of afterShots) {
    if (!beforeShots.has(file)) {
      rows.push(`- ${file}: new`);
      continue;
    }
    const a = fs.readFileSync(path.join(AGAINST, 'shots', file)).toString('base64');
    const b = fs.readFileSync(path.join(OUT, 'shots', file)).toString('base64');
    const result = await diff(a, b, true);
    if (result.sizeChanged) {
      rows.push(`- ${file}: size ${result.from.join('×')} → ${result.to.join('×')}`);
    } else if (result.fraction > DIFF_REPORT) {
      fs.writeFileSync(path.join(OUT, 'diffs', file), Buffer.from(result.image, 'base64'));
      rows.push(`- ${file}: ${(result.fraction * 100).toFixed(2)}% of pixels (diffs/${file})`);
    }
  }
  for (const file of beforeShots) if (!afterShots.includes(file)) rows.push(`- ${file}: gone`);
  report.push(rows.length ? rows.join('\n') : 'None beyond tolerance.', '');
}

fs.writeFileSync(path.join(OUT, 'report.md'), report.join('\n'));
log('\n' + report.join('\n'));

cdp.close();
chrome.kill();
// Chrome is still writing its profile as it exits; give it a moment, and never fail on it.
await sleep(500);
try {
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
} catch {}
process.exit(failures.length ? 1 : 0);

// ------------------------------------------------------------------ utilities

function compareFacts(a, b, at, out) {
  // Measurements that wobble between runs of unchanged code are not compared.
  const NOISY = new Set(['when', 'drawnFraction', 'movingFraction', 'warnings']);
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${at}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
    return;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${at}: ${short(a)} → ${short(b)}`);
    return;
  }
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (NOISY.has(key)) continue;
    const next = at ? `${at} › ${key}` : key;
    if (!(key in a)) out.push(`${next}: (new) ${short(b[key])}`);
    else if (!(key in b)) out.push(`${next}: (gone) was ${short(a[key])}`);
    else compareFacts(a[key], b[key], next, out);
  }
}

function short(value) {
  const s = JSON.stringify(value);
  return s && s.length > 240 ? `${s.slice(0, 240)}…` : s;
}

function parseArgs(list) {
  const out = {};
  for (let i = 0; i < list.length; i += 1) {
    if (!list[i].startsWith('--')) continue;
    const key = list[i].slice(2);
    const value = list[i + 1] && !list[i + 1].startsWith('--') ? list[(i += 1)] : true;
    out[key] = value;
  }
  return out;
}
