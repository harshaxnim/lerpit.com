/**
 * perf-lab: measure what each chapter of a lesson costs per frame, in a real Chrome.
 *
 *   node scripts/perf-lab.mjs                                  every chapter of /meta/perf-lab/
 *   node scripts/perf-lab.mjs --page /physics-engine/particles/
 *   node scripts/perf-lab.mjs --chapters trail,lines --seconds 6 --headed
 *
 * For each chapter it scrolls the chapter in, lets it settle, and records for a few
 * seconds:
 *
 *   fps            animation frames the page actually got
 *   draws/frame    WebGL draw calls per frame, counted by wrapping the GL context
 *   runtime ms     main-thread time per frame inside the chapter runtime's frame
 *   main busy      share of the main thread not idle, from the CPU profile
 *   renderer, GPU  CPU used by Chrome's renderer and GPU processes, as % of one core.
 *                  A WebGL canvas costs most of its time in the GPU process, which a
 *                  main-thread profile never shows.
 *
 * Every chapter's CPU profile is written to test-results/perf/<chapter>.cpuprofile.
 * Open one in Chrome DevTools (Performance panel, "Load profile") or drop it on
 * https://www.speedscope.app for the flame graph.
 *
 * Needs the dev server (npm run dev) and a local Chrome. Chrome runs headless but on
 * the real GPU, because software GL measures a different machine. A save in another
 * lesson reloads open lesson pages; a chapter whose window a reload lands in is
 * measured again.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((out, arg, i, all) => {
  if (!arg.startsWith('--')) return out;
  const next = all[i + 1];
  out.push([arg.slice(2), next && !next.startsWith('--') ? next : true]);
  return out;
}, []));
const BASE = String(args.base ?? 'http://localhost:4321').replace(/\/$/, '');
const PAGE = String(args.page ?? '/meta/perf-lab/');
const SECONDS = Number(args.seconds ?? 4);
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.join(process.cwd(), 'test-results/perf');
const PORT = 9500 + Math.floor(Math.random() * 200);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

fs.mkdirSync(OUT, { recursive: true });
try {
  await fetch(`${BASE}/`);
} catch {
  console.error(`Nothing is answering at ${BASE}. Start it with npm run dev.`);
  process.exit(2);
}

// ------------------------------------------------------------------ chrome

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lerpit-perf-'));
const chrome = spawn(CHROME, [
  ...(args.headed ? [] : ['--headless=new']),
  `--user-data-dir=${profileDir}`,
  `--remote-debugging-port=${PORT}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
  '--window-size=1440,900', 'about:blank'
], { stdio: 'ignore' });

const finish = (code) => {
  chrome.kill();
  fs.rmSync(profileDir, { recursive: true, force: true });
  process.exit(code);
};

let version = null;
for (let i = 0; i < 100 && !version; i += 1) {
  try {
    version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  } catch {
    await sleep(150);
  }
}
if (!version) {
  console.error(`Chrome did not start (looked for it at ${CHROME}).`);
  finish(2);
}

/** One DevTools connection: the browser's, for process CPU, or a page's. */
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const browser = await connect(version.webSocketDebuggerUrl);
const target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((entry) => entry.type === 'page');
const send = await connect(target.webSocketDebuggerUrl);
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });

const js = async (expression) => {
  const result = await send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
};

// Counts draw calls and frames from the first script on, before three.js has a context.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    const counts = { draws: 0, frames: 0 };
    window.__perf = counts;
    for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
      for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        const original = C.prototype[name];
        if (original) C.prototype[name] = function (...a) { counts.draws += 1; return original.apply(this, a); };
      }
    }
    const tick = () => { counts.frames += 1; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })();`
});

/** CPU seconds so far, summed by Chrome process type. */
async function processCpu() {
  const { processInfo } = await browser('SystemInfo.getProcessInfo');
  const out = {};
  for (const info of processInfo) out[info.type] = (out[info.type] ?? 0) + info.cpuTime;
  return out;
}

/** Main-thread time spent under the chapter runtime's frame, and how busy the thread was. */
function summarise(profile) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map();
  profile.nodes.forEach((node) => (node.children ?? []).forEach((child) => parent.set(child, node.id)));
  let inFrame = 0;
  let busy = 0;
  let total = 0;
  profile.samples.forEach((sample, i) => {
    const delta = profile.timeDeltas[i] ?? 0;
    total += delta;
    if (byId.get(sample).callFrame.functionName !== '(idle)') busy += delta;
    for (let id = sample; id !== undefined; id = parent.get(id)) {
      const frame = byId.get(id).callFrame;
      if (frame.functionName === 'frame' && frame.url.includes('createChapterRuntime')) {
        inFrame += delta;
        break;
      }
    }
  });
  return { inFrameMs: inFrame / 1000, busy: total ? busy / total : 0 };
}

// ------------------------------------------------------------------ measure

await send('Page.navigate', { url: `${BASE}${PAGE}` });
await sleep(8000);
const sections = await js(`return [...document.querySelectorAll('[data-section-id]')].map((s) => s.dataset.sectionId).filter((id) => id !== 'intro')`);
const chapters = args.chapters ? String(args.chapters).split(',') : sections;
const missing = chapters.filter((id) => !sections.includes(id));
if (missing.length) {
  console.error(`${PAGE} has no chapter ${missing.join(', ')}. It has: ${sections.join(', ')}.`);
  finish(2);
}

const rows = [];
for (let k = 0, retries = 0; k < chapters.length; k += 1) {
  const id = chapters[k];
  await js(`const s = document.querySelector('[data-section-id="${id}"]'); scrollTo({ top: scrollY + s.getBoundingClientRect().top - 20, behavior: 'instant' })`);
  await sleep(2500);

  const origin = await js('return performance.timeOrigin');
  await send('Profiler.enable');
  await send('Profiler.setSamplingInterval', { interval: 200 });
  const before = { cpu: await processCpu(), gl: await js('return { ...window.__perf }') };
  await send('Profiler.start');
  await sleep(SECONDS * 1000);
  const { profile } = await send('Profiler.stop');
  const after = { cpu: await processCpu(), gl: await js('return { ...window.__perf }') };

  if ((await js('return performance.timeOrigin')) !== origin) {
    if (++retries > 6) {
      console.error('The page keeps reloading (a file being saved?); stopping.');
      finish(1);
    }
    console.log(`  ${id}: the page reloaded while measuring; again`);
    await sleep(4000);
    k -= 1;
    continue;
  }

  fs.writeFileSync(path.join(OUT, `${id}.cpuprofile`), JSON.stringify(profile));
  const frames = Math.max(1, after.gl.frames - before.gl.frames);
  const { inFrameMs, busy } = summarise(profile);
  const cpu = (type) => Math.round((((after.cpu[type] ?? 0) - (before.cpu[type] ?? 0)) / SECONDS) * 100);
  rows.push({
    chapter: id,
    fps: Math.round(frames / SECONDS),
    'draws/frame': Math.round((after.gl.draws - before.gl.draws) / frames),
    'runtime ms/frame': +(inFrameMs / frames).toFixed(2),
    'main busy %': Math.round(busy * 100),
    'renderer %': cpu('renderer'),
    'GPU %': cpu('GPU')
  });
}

console.log(`\n${BASE}${PAGE}, ${SECONDS}s per chapter, 1440x900 at 2x`);
console.table(rows);
console.log(`CPU profiles: ${path.relative(process.cwd(), OUT)}/<chapter>.cpuprofile`);
finish(0);
