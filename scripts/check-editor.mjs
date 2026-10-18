/*
 * check-editor: drive the local editor in Chrome and check that it does what it says.
 *
 *   node scripts/check-editor.mjs                 # against the running dev server
 *   node scripts/check-editor.mjs --base http://localhost:4330 --keep
 *
 *   --base URL     the running dev server (default http://localhost:4321)
 *   --keep         leave the scratch collection behind to look at
 *   --headed       show the browser
 *
 * The editor writes files, so this works in a scratch collection of its own,
 * lerpettes/content/zz-editor-check/, which it creates through the editor and deletes
 * at the end, pass or fail. Your own lerpettes are only opened, never saved, and their
 * files are hashed before and after to prove it.
 *
 * Like check-site, it needs only Node 22 and a local Chrome. Screenshots of every state
 * go to test-results/editor/ (gitignored). Exits 1 if any check fails.
 *
 * Do not edit lerpettes/content while it runs (in an editor or in this one, in another
 * tab): the dev server would reload the page under it, and the last check, that nothing
 * outside the scratch collection changed, would rightly fail.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
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
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = process.cwd();
const CONTENT = path.join(ROOT, 'lerpettes/content');
const SCRATCH = 'zz-editor-check';
const SCRATCH_DIR = path.join(CONTENT, SCRATCH);
const OUT = path.join(ROOT, 'test-results/editor');
const PORT = 9700 + Math.floor(Math.random() * 200);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

fs.mkdirSync(OUT, { recursive: true });
if (fs.existsSync(SCRATCH_DIR)) {
  console.error(`${path.relative(ROOT, SCRATCH_DIR)} already exists; delete it (a previous --keep run) and try again.`);
  process.exit(2);
}
try {
  await fetch(`${BASE}/`);
} catch {
  console.error(`Nothing is answering at ${BASE}. Start it with npm run dev.`);
  process.exit(2);
}

// ------------------------------------------------------------------ chrome

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lerpit-editor-check-'));
const chrome = spawn(CHROME, [
  ...(args.headed ? [] : ['--headless=new']),
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${PORT}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'
], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 100 && !target; i += 1) {
  try {
    target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((entry) => entry.type === 'page');
  } catch {
    await sleep(150);
  }
}
if (!target) {
  console.error(`Chrome did not start (looked for it at ${CHROME}).`);
  process.exit(2);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
let nextId = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') {
    errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  }
  // Nothing the editor does should raise a native dialog; accept one rather than hang.
  if (message.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true });
});
function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
await send('Page.enable');
await send('Runtime.enable');

// ------------------------------------------------------------------ helpers

async function js(expression) {
  const result = await send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
async function go(url, settle = 2500) {
  await send('Page.navigate', { url: `${BASE}${url}` });
  await sleep(settle);
}
async function size(width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
}
async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
}
async function until(expression, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await js(`return !!(${expression})`).catch(() => false)) return true;
    await sleep(150);
  }
  return false;
}
async function typeText(text) {
  await send('Input.insertText', { text });
  await sleep(120);
}
async function saveKey() {
  for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, modifiers: 4 });
}
/** Clicks a bar button by its label. */
const barButton = (label) => js(`[...document.querySelectorAll('.ed-bar button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)} || b.textContent.includes(${JSON.stringify(label)})).click()`);
/**
 * Puts the caret at the end of a Markdown box, with CodeMirror's own key for it
 * (setting the DOM selection does not move CodeMirror's cursor).
 */
async function caretToEnd(box) {
  const mac = await js(`document.querySelector('${box} .cm-content').focus(); return /Mac/.test(navigator.platform)`);
  const [key, code, keyCode, modifiers] = mac ? ['ArrowDown', 'ArrowDown', 40, 4] : ['End', 'End', 35, 2];
  for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: keyCode, modifiers });
  await sleep(100);
}
const setInput = (selector, value, event = 'input') => js(`const i = document.querySelector(${JSON.stringify(selector)}); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event(${JSON.stringify(event)}));`);
const read = (rel) => fs.readFileSync(path.join(SCRATCH_DIR, rel), 'utf8');
const startEditing = async () => {
  await js(`document.getElementById('lerpit-edit-button').click()`);
  return until(`document.querySelector('.ed-bar')`);
};
const fresh = () => js(`try { sessionStorage.clear(); localStorage.clear(); } catch {}`);

let failed = 0;
let passed = 0;
function check(ok, what, detail = '') {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${what}${!ok && detail ? `  (${detail})` : ''}`);
}

function hashTree(dir) {
  const hash = createHash('sha1');
  for (const file of fs.readdirSync(dir, { recursive: true }).map(String).sort()) {
    const full = path.join(dir, file);
    if (file.includes(`${SCRATCH}`) || file.includes(`${path.sep}build${path.sep}`) || !fs.statSync(full).isFile()) continue;
    hash.update(file).update(fs.readFileSync(full));
  }
  return hash.digest('hex');
}

// ------------------------------------------------------------------ the checks

const before = hashTree(CONTENT);
const LESSON = `/${SCRATCH}/first-lerpette/`;

try {
  await size(1440, 900);

  // A previous run's cleanup (or any content change) makes the dev server reload every
  // tab a moment later; let that land before the first page, not in the middle of it.
  await sleep(2000);

  console.log('\nThe pencil');
  await go('/library/');
  await js(`document.cookie = 'lerpit-view=public; path=/'`);
  await go('/library/');
  check(await until(`!document.getElementById('lerpit-edit-button') && document.getElementById('lerpit-view-toggle')?.dataset.view === 'public'`), 'public view shows no pencil');
  await js(`document.cookie = 'lerpit-view=local; path=/'`);
  await go('/library/');
  check(await until(`document.getElementById('lerpit-edit-button')`), 'local view shows it');

  console.log('\nLibrary: a new collection');
  await fresh();
  check(await startEditing(), 'the pencil starts edit mode on the library');
  await js(`document.querySelector('.ed-new-collection').click()`);
  await setInput('.ed-sheet input[aria-label=Title]', 'Editor check');
  check(await js(`return document.querySelector('.ed-sheet input[aria-label=Folder]').value`) === 'editor-check', 'the folder name follows the title');
  await setInput('.ed-sheet input[aria-label=Folder]', SCRATCH);
  await js(`[...document.querySelectorAll('.ed-sheet .ed-chip')].find((b) => b.textContent === 'orb').click()`);
  check(await js(`return document.querySelector('.ed-preview-card')?.dataset.cardStyle`) === 'orb', 'the preview card redraws in the picked style');
  await shot('01-new-collection');
  await js(`document.querySelector('.ed-sheet form').requestSubmit()`);
  check(await until(`location.pathname === '/${SCRATCH}/' && document.querySelector('.ed-bar')`, 15000), 'it opens the new collection, still in edit mode');
  check(fs.existsSync(path.join(SCRATCH_DIR, 'collection.md')) && read('control.toml').includes('card_style = "orb"'), 'collection.md and control.toml are written');

  console.log('\nCollection: a new lerpette');
  await js(`document.querySelector('.ed-new-card').click()`);
  await setInput('.ed-sheet input[aria-label=Title]', 'First lerpette');
  await shot('02-new-lerpette');
  await js(`document.querySelector('.ed-sheet form').requestSubmit()`);
  check(await until(`location.pathname === '${LESSON}' && document.querySelector('.ed-bar')`, 20000), 'it opens the new lerpette in edit mode');
  check(read('first-lerpette/control.toml').includes('status = "draft"'), 'it starts as a draft');
  check(await until(`document.querySelector('.ed-bar__problems')?.hidden === true`), 'it has no problems', await js(`return document.querySelector('.ed-bar__problems')?.textContent`));
  await shot('03-new-lesson');

  console.log('\nLesson: writing a chapter');
  await js(`document.querySelector('#first-steps .ed-open-btn').click()`);
  check(await until(`document.querySelector('#first-steps .cm-content')`), 'a chapter opens in place');
  await caretToEnd('#first-steps');
  await typeText('\n\nThe force is $F = -kx$.');
  check(await until(`document.querySelector('#first-steps .prose-block .katex')`), 'the preview renders the maths as you type');
  check(await js(`return document.querySelector('.ed-bar__dirty').textContent`) === '1 unsaved', 'the bar counts one unsaved change');
  await js(`window.__kept = 1`);
  await saveKey();
  check(await until(`document.querySelector('.ed-toast')?.textContent === 'Saved.'`), 'a prose-only save says so');
  check(await js(`return window.__kept === 1`), 'and does not reload the page');
  check(read('first-lerpette/mixtape.md').includes('The first chapter.\n\nThe force is $F = -kx$.\n'), 'the text is on disk, where it was typed');
  await js(`document.querySelector('#first-steps .cm-content').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  check(await until(`!document.querySelector('#first-steps.ed-open')`), 'Esc closes the chapter');

  console.log('\nLesson: panels, chapters, ids');
  await js(`document.querySelector('#first-steps .ed-open-btn').click()`);
  await until(`document.querySelector('#first-steps .ed-chip')`);
  await js(`[...document.querySelectorAll('#first-steps .ed-chip')].find((b) => b.textContent.startsWith('table')).click()`);
  await js(`[...document.querySelectorAll('.ed-add')].at(-1).click()`);
  await until(`document.querySelector('.ed-new .ed-input--title')`);
  await setInput('.ed-new .ed-input--title', 'Damping');
  check(await js(`return document.querySelector('.ed-new .ed-input--id').value`) === 'damping', "a new chapter's id follows its title");
  await js(`[...document.querySelectorAll('.ed-add')].at(-1).click()`);
  await sleep(300);
  await js(`const t = [...document.querySelectorAll('.ed-new .ed-input--title')].at(-1); t.value = 'Scrap'; t.dispatchEvent(new Event('input'));`);
  await js(`[...document.querySelectorAll('.ed-new')].find((s) => s.querySelector('.ed-input--title').value === 'Damping').querySelector('[aria-label="Move chapter up"]').click()`);
  check((await js(`return [...document.querySelectorAll('.lerpette-step h2')].map((h) => h.textContent).join()`)).startsWith('Damping'), 'moving a chapter moves its box');
  // Delete an old chapter, undo it, then delete the new one for real.
  await js(`document.querySelector('#first-steps [aria-label="Delete chapter"]').click()`);
  check(await until(`document.querySelector('.ed-bar__question')`), 'deleting asks first');
  check(await js(`return document.querySelector('.ed-bar__question').getBoundingClientRect().height < 40`), 'the question fits the bar on one or two lines');
  await shot('04-delete-ask');
  await barButton('Delete');
  check(await until(`document.querySelector('#first-steps.ed-deleted')`), 'a deleted chapter folds to a strip');
  await js(`document.querySelector('#first-steps .ed-deleted__strip button').click()`);
  check(await until(`!document.querySelector('#first-steps.ed-deleted')`), 'Undo brings it back');
  await js(`[...document.querySelectorAll('.ed-new')].find((s) => s.querySelector('.ed-input--title').value === 'Scrap').querySelector('[aria-label="Delete chapter"]').click()`);
  await barButton('Delete');
  // Rename the chapter that has a code folder, and give it a caption. (Deleting closed
  // its editor, and Undo leaves it closed.)
  await js(`document.querySelector('#first-steps .ed-open-btn').click()`);
  await until(`document.querySelector('#first-steps .ed-input--id')`);
  await setInput('#first-steps .ed-input--id', 'the-swing', 'change');
  check((await js(`return document.querySelector('#first-steps .ed-chapter__note').textContent`)).includes('code/the-swing/'), 'renaming an id says what happens to its code folder');
  await barButton('Settings');
  await until(`document.querySelector('.ed-sheet input[aria-label="caption for the-swing"]')`);
  await setInput('.ed-sheet input[aria-label="caption for the-swing"]', 'It swings.', 'change');
  await js(`[...document.querySelectorAll('.ed-seg__opt')].find((b) => b.textContent === 'Unlisted').click()`);
  await shot('05-settings');
  await js(`document.querySelector('.ed-sheet__close').click()`);
  await saveKey();
  check(await until(`document.querySelector('.ed-bar') && document.readyState === 'complete' && !window.__kept`, 15000), 'a structural save reloads the page');
  check(await until(`document.querySelector('#the-swing.ed-open')`), 'and comes back in edit mode with the chapter open');
  const doc = read('first-lerpette/mixtape.md');
  check(/## Damping \{#damping\}[\s\S]*## First steps \{#the-swing \+table\}/.test(doc) && !doc.includes('Scrap'), 'mixtape.md has the new order, panels and ids', doc.split('\n').filter((l) => l.startsWith('#')).join(' | '));
  check(fs.existsSync(path.join(SCRATCH_DIR, 'first-lerpette/code/the-swing')) && !fs.existsSync(path.join(SCRATCH_DIR, 'first-lerpette/code/first-steps')), 'the code folder was renamed');
  const control = read('first-lerpette/control.toml');
  check(control.includes('status = "unlisted"') && control.includes('the-swing = "It swings."') && control.startsWith('# Local only'), 'control.toml has the settings and kept its comment');
  check(await until(`document.querySelector('.ed-bar__problems')?.hidden === true`), 'no problems after the save');

  console.log('\nLesson: images');
  await caretToEnd('#the-swing');
  await js(`
    const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 100;
    const g = canvas.getContext('2d'); g.fillStyle = '#d17041'; g.fillRect(0, 0, 200, 100);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const data = new DataTransfer(); data.items.add(new File([blob], 'A Sketch.png', { type: 'image/png' }));
    document.querySelector('#the-swing .cm-content').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));`);
  check(await until(`document.querySelector('#the-swing .prose-block figure img')?.naturalWidth === 200`), 'a pasted image is saved, linked and shown as a figure');
  check(fs.existsSync(path.join(SCRATCH_DIR, 'first-lerpette/a-sketch.png')), 'it lands beside mixtape.md with a safe name');
  await shot('06-image');

  console.log('\nLesson: an outside save while editing');
  await js(`window.__kept = 2`);
  fs.appendFileSync(path.join(SCRATCH_DIR, 'first-lerpette/mixtape.md'), '\nWritten elsewhere.\n');
  await sleep(2500);
  check(await js(`return window.__kept === 2`), 'the tab keeps its unsaved work when the file changes on disk');
  await saveKey();
  check(await until(`document.querySelector('.ed-bar__question')?.textContent.includes('changed on disk')`), 'saving asks which version to keep');
  await shot('07-conflict');
  await barButton('Overwrite with mine');
  await sleep(4000);
  const overwritten = read('first-lerpette/mixtape.md');
  check(!overwritten.includes('Written elsewhere.') && overwritten.includes('a-sketch.png'), 'overwriting writes this version');

  console.log('\nLesson: unsaved work survives a closed tab');
  await until(`document.querySelector('#the-swing .cm-content')`, 10000) || await js(`document.querySelector('#the-swing .ed-open-btn')?.click()`);
  await until(`document.querySelector('#the-swing .cm-content')`);
  await caretToEnd('#the-swing');
  await typeText(' Unsaved words.');
  await sleep(800);
  await js(`sessionStorage.removeItem('lerpit-editor:resume')`);
  await go(LESSON, 3500);
  check(await until(`document.querySelector('.ed-bar__question')?.textContent.includes('unsaved edits')`), 'coming back offers the unsaved edits');
  await shot('08-restore-ask');
  await barButton('Restore them');
  check(await until(`document.querySelector('.ed-bar__dirty')?.textContent === '1 unsaved' && document.querySelector('#the-swing .prose-block')?.textContent.includes('Unsaved words.')`), 'restoring puts them back in place');
  await barButton('Done');
  await barButton('Drop them');
  check(await until(`!document.querySelector('.ed-bar')`, 8000), 'Done asks, then leaves edit mode');

  console.log('\nCollection: title, introduction and cards');
  await go(`/${SCRATCH}/`);
  await fresh();
  await startEditing();
  await setInput('.ed-input--collection', 'Editor check, renamed');
  await caretToEnd('.ed-chapter--collection');
  await typeText(' More about it.');
  check(await until(`/two\\.\\s+More about it\\./.test(document.querySelector('.collection-copy')?.textContent)`), 'the introduction preview follows the typing');
  await barButton('Cards');
  await sleep(400);
  await js(`[...document.querySelectorAll('.ed-sheet .ed-chip')].find((b) => b.textContent === 'wheel').click()`);
  check(await js(`return [...document.querySelectorAll('.archive-collection a.cassette-card')].every((c) => c.dataset.cardStyle === 'wheel')`), 'picking a style redraws the cards on the page');
  await shot('09-collection');
  await saveKey();
  await sleep(4000);
  check(read('collection.md').startsWith('# Editor check, renamed\n') && /two\.\s+More about it\./.test(read('collection.md')), 'collection.md has the new title and text');
  check(read('control.toml').includes('card_style = "wheel"'), 'control.toml has the new style');

  console.log('\nCollection: its lerpettes\' settings');
  check(await until(`document.querySelector('.ed-bar') && document.querySelector('.ed-input--collection')`, 10000), 'the collection page comes back in edit mode after saving');
  await barButton('Cards');
  check(await until(`document.querySelector('.ed-sheet .ed-lerpette')`), 'its settings list each lerpette');
  await js(`const row = document.querySelector('.ed-sheet .ed-lerpette');
    [...row.querySelectorAll('.ed-seg__opt')].find((b) => b.textContent === 'Draft').click();
    const order = row.querySelector('.ed-input--order'); order.value = '3'; order.dispatchEvent(new Event('change'));`);
  check(await js(`return document.querySelector('.ed-bar__dirty').textContent`) === '1 unsaved', 'changing one counts as one unsaved change');
  await js(`document.querySelector('.ed-sheet .ed-lerpette').scrollIntoView()`);
  await sleep(400);
  await shot('09b-collection-lerpettes');
  await saveKey();
  await sleep(4000);
  const own = read('first-lerpette/control.toml');
  check(own.includes('status = "draft"') && own.includes('order = 3') && own.startsWith('# Local only'), 'status and order land in that lerpette\'s control.toml, comment kept');

  console.log('\nLesson: the collection\'s cards');
  await go(LESSON, 3000);
  await fresh();
  await startEditing();
  await barButton('Settings');
  check(await until(`[...document.querySelectorAll('.ed-sheet .ed-group__title')].some((t) => t.textContent.startsWith('Collection'))`), 'the lesson\'s settings have a Collection group');
  await js(`const group = [...document.querySelectorAll('.ed-sheet .ed-group')].find((g) => g.querySelector('.ed-group__title')?.textContent.startsWith('Collection'));
    [...group.querySelectorAll('.ed-chip')].find((b) => b.textContent.includes('Tropicana')).click();
    group.scrollIntoView();`);
  await sleep(400);
  await shot('09c-lesson-collection');
  await saveKey();
  await sleep(5000);
  check(read('control.toml').includes('card_palette = "Tropicana 1980"') && read('control.toml').includes('card_style = "wheel"'), 'picking a palette there writes the collection\'s control.toml');

  console.log('\nLibrary: editing a collection');
  await go('/library/');
  await fresh();
  await startEditing();
  check(await until(`document.querySelector('.archive-collection[data-collection="${SCRATCH}"] .ed-edit-collection')`), 'each collection has an Edit collection button');
  await shot('09d-library-edit');
  await js(`document.querySelector('.archive-collection[data-collection="${SCRATCH}"] .ed-edit-collection').click()`);
  check(await until(`location.pathname === '/${SCRATCH}/' && document.querySelector('.ed-input--collection')`, 10000), 'it opens that collection in edit mode');

  console.log('\nYour lerpettes: opened, never changed');
  const lessons = fs.readdirSync(CONTENT, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== SCRATCH)
    .flatMap((c) => fs.readdirSync(path.join(CONTENT, c.name), { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(CONTENT, c.name, d.name, 'mixtape.md'))).map((d) => `/${c.name}/${d.name}/`));
  for (const lesson of lessons) {
    await go(lesson, 3000);
    await fresh();
    await startEditing();
    await until(`document.querySelector('.ed-editable') || document.querySelector('.ed-toast')`);
    const state = await js(`return { boxes: document.querySelectorAll('.lerpette-intro, .lerpette-step').length, editable: document.querySelectorAll('.ed-editable').length, clean: document.querySelector('.ed-bar__dirty').hidden }`);
    check(state.boxes === state.editable && state.clean, `${lesson} opens with every box editable and nothing unsaved`, JSON.stringify(state));
  }

  console.log('\nSizes');
  for (const [width, height, name] of [[390, 844, 'phone'], [1000, 800, 'drawer']]) {
    await size(width, height);
    await go(LESSON, 3000);
    await fresh();
    await startEditing();
    await js(`document.querySelector('#the-swing .ed-open-btn').click()`);
    await until(`document.querySelector('#the-swing .cm-content')`);
    await js(`document.querySelector('#the-swing').scrollIntoView()`);
    await sleep(400);
    check(await js(`return document.documentElement.scrollWidth <= innerWidth`), `${name} (${width}px): no sideways scroll with a chapter open`);
    if (width < 700) {
      const small = await js(`return [...document.querySelectorAll('.ed-bar button, .ed-open button, .ed-open input, .ed-chip, .ed-md__tool')].filter((el) => el.offsetParent && el.getBoundingClientRect().height < 39.5).map((el) => (el.className || el.tagName) + ':' + Math.round(el.getBoundingClientRect().height))`);
      check(small.length === 0, `${name}: every control is at least 40px tall`, small.slice(0, 6).join(', '));
      check(await js(`const t = document.querySelector('#the-swing .ed-input--title').getBoundingClientRect(); const x = document.querySelector('#the-swing .ed-head > .ed-icon:last-child').getBoundingClientRect(); return Math.abs(t.top + t.height / 2 - (x.top + x.height / 2)) < 8`), `${name}: close sits beside the title`);
      check(await js(`const t = document.querySelector('#the-swing .ed-input--title').getBoundingClientRect(); const i = document.querySelector('#the-swing .ed-input--id').getBoundingClientRect(); return i.top >= t.bottom && t.width > 200`), `${name}: the title keeps its row, the id goes under it`);
    }
    await shot(`10-${name}-chapter`);
    await barButton('Settings');
    await sleep(500);
    check(await js(`return document.documentElement.scrollWidth <= innerWidth`), `${name}: no sideways scroll with settings open`);
    await shot(`11-${name}-settings`);
  }
  await size(1440, 900);
} catch (error) {
  check(false, 'the run finished', error.message);
  await shot('failure').catch(() => {});
} finally {
  check(hashTree(CONTENT) === before, 'no file outside the scratch collection changed');
  check(errors.length === 0, 'no uncaught errors in the page', errors.slice(0, 3).join(' | '));
  if (!args.keep) fs.rmSync(SCRATCH_DIR, { recursive: true, force: true });
  ws.close();
  chrome.kill();
  // Chrome flushes its profile as it exits; give it a moment, and never fail on it.
  await new Promise((resolve) => chrome.once('exit', resolve) && setTimeout(resolve, 3000));
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {}
}

console.log(`\n${passed} passed, ${failed} failed. Screenshots in ${path.relative(ROOT, OUT)}/${args.keep ? `; ${path.relative(ROOT, SCRATCH_DIR)}/ kept` : ''}`);
process.exit(failed ? 1 : 0);
