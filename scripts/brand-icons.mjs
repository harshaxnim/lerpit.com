#!/usr/bin/env node
/*
 * Renders the site's icons and share image from the brand spine, in Chrome.
 *
 *   node scripts/brand-icons.mjs
 *
 * Writes into website/public/:
 *   apple-touch-icon.png       180×180   iOS home screen (no transparency: iOS fills it black)
 *   icons/icon-192.png         192×192   Android home screen, the manifest's "any" icon
 *   icons/icon-512.png         512×512   install splash, the manifest's large "any" icon
 *   icons/icon-maskable-512.png 512×512  the manifest's "maskable" icon: the mark inside the
 *                                         central 80% safe zone, paper to the edges
 *   og-image.png               1200×630  the link preview on WhatsApp, iMessage, Slack, X …
 *
 * Every image is drawn as SVG and HTML at its final pixel size, so nothing is scaled up
 * from a small bitmap; the bands are the same five colours and shares as --spine-bands
 * in global.css and favicon.svg, leaning at the wordmark's 14 degrees. The icons are flat
 * (no blur, no grain) because at icon sizes the print texture reads as noise; the share
 * image, which is seen large, carries the paper grain the site does.
 *
 * No dependencies beyond Node 22 and a local Chrome, like scripts/check-site.mjs.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PUBLIC = path.resolve(process.env.OUT ?? 'website/public');
const PORT = 9700 + Math.floor(Math.random() * 200);

/** The five bands, outside first, as fractions of the spine's width. */
const BANDS = [
  ['#f2b021', 0.324],
  ['#e7752c', 0.25],
  ['#e7212c', 0.191],
  ['#a51e4d', 0.14],
  ['#63164d', 0.095]
];
const PAPER = '#fdfbf4';
const INK = '#20313f';
const LEAN = Math.tan((14 * Math.PI) / 180);

/**
 * The spine as SVG polygons: `width` wide at mid-height, `height` tall, its left edge at
 * mid-height on `x`, leaning right as it rises (the site mirrors the bands, so the widest
 * is on the outside, which is the left here).
 */
function spine(x, y, width, height) {
  const shift = (height / 2) * LEAN;
  let at = 0;
  return BANDS.map(([colour, share]) => {
    const left = x + at * width;
    const right = left + share * width;
    at += share;
    const pts = [
      [left + shift, y],
      [right + shift, y],
      [right - shift, y + height],
      [left - shift, y + height]
    ];
    return `<polygon fill="${colour}" points="${pts.map((p) => p.map((n) => n.toFixed(2)).join(',')).join(' ')}"/>`;
  }).join('');
}

/** A square icon: paper, and the spine standing in the middle `fill` of it. */
function iconSvg(size, fill) {
  const height = size * fill;
  // The site's spine is 136:140 at its widest crop (favicon.svg); keep that shape.
  const width = height * (136 / 140) * 0.62;
  const span = width + height * LEAN;
  const x = (size - span) / 2 + (height / 2) * LEAN;
  const y = (size - height) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="${PAPER}"/>${spine(x, y, width, height)}</svg>`;
}

const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E")`;

/** The share image: the site's header, at poster size. */
function ogHtml() {
  const W = 1200;
  const H = 630;
  const sheet = { x: 40, y: 40, w: W - 80, h: H - 80 };
  // The spine stands where the header's does: 66% across the sheet, 14% of it wide,
  // from the sheet's top edge down to its bottom edge.
  const width = sheet.w * 0.14;
  const x = sheet.x + sheet.w * 0.66;
  return `<!doctype html><html><head><meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Cardo:ital,wght@0,400;1,400&family=Syne:wght@500&display=block" rel="stylesheet">
  <style>
    html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; }
    body {
      background-color: #f7f3e7;
      background-image:
        linear-gradient(rgba(81,131,173,.18) 1px, transparent 1px),
        linear-gradient(90deg, rgba(81,131,173,.18) 1px, transparent 1px),
        linear-gradient(rgba(81,131,173,.08) 1px, transparent 1px),
        linear-gradient(90deg, rgba(81,131,173,.08) 1px, transparent 1px);
      background-size: 120px 120px, 120px 120px, 24px 24px, 24px 24px;
      background-position: -1px -1px;
      font-family: Cardo, serif; color: ${INK};
    }
    .sheet { position: absolute; left: ${sheet.x}px; top: ${sheet.y}px; width: ${sheet.w}px; height: ${sheet.h}px;
      background: ${PAPER}; border: 2px solid rgba(81,131,173,.72); box-sizing: border-box; overflow: hidden; }
    .art { position: absolute; inset: 0; }
    .grain { position: absolute; inset: 0; background-image: ${GRAIN}; opacity: .19; mix-blend-mode: overlay; }
    h1 { position: absolute; left: 72px; top: 150px; margin: 0; font-weight: 400; font-size: 168px; line-height: 1; letter-spacing: -0.03em; }
    p { position: absolute; left: 78px; top: 360px; width: 520px; margin: 0; font: 500 28px/1.35 Syne, sans-serif; color: #506270; }
  </style></head><body>
  <div class="sheet">
    <svg class="art" width="${sheet.w}" height="${sheet.h}" viewBox="0 0 ${sheet.w} ${sheet.h}">${spine(x - sheet.x, -2, width, sheet.h + 4)}</svg>
    <div class="grain"></div>
    <h1>Lerp<em>It</em></h1>
    <p>Interactive lessons on simulation, rendering and animation.</p>
  </div></body></html>`;
}

// ------------------------------------------------------------------ chrome

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lerpit-icons-'));
const chrome = spawn(CHROME, ['--headless=new', `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, '--hide-scrollbars', 'about:blank'], {
  stdio: 'ignore'
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 80 && !target; i += 1) {
  try {
    target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page');
  } catch {
    await sleep(150);
  }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) pending.get(m.id)(m.result);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable');

async function render(html, width, height, out) {
  const file = path.join(profile, 'render.html');
  fs.writeFileSync(file, html);
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `file://${file}` });
  await sleep(400);
  await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true });
  await sleep(200);
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 } });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(`  ${path.relative(process.cwd(), out)}  ${width}×${height}`);
}

const page = (svg, size) => `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px">${svg}</body></html>`;

await render(page(iconSvg(180, 0.72), 180), 180, 180, path.join(PUBLIC, 'apple-touch-icon.png'));
await render(page(iconSvg(192, 0.72), 192), 192, 192, path.join(PUBLIC, 'icons/icon-192.png'));
await render(page(iconSvg(512, 0.72), 512), 512, 512, path.join(PUBLIC, 'icons/icon-512.png'));
// Maskable: launchers crop to a circle or squircle inside the central 80%, so the mark
// stays inside 56% of the canvas and paper runs to every edge.
await render(page(iconSvg(512, 0.56), 512), 512, 512, path.join(PUBLIC, 'icons/icon-maskable-512.png'));
await render(ogHtml(), 1200, 630, path.join(PUBLIC, 'og-image.png'));

ws.close();
chrome.kill();
await sleep(300);
try {
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
} catch {}
