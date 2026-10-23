/*
 * The local editor's file API. Dev server only: scripts/lerpit-editor.mjs loads this
 * through Vite (ssrLoadModule) and routes /__lerpit/edit/api/* to it. A production
 * build never sees it; there is no server there to answer.
 *
 * It reads and writes the authored files under lerpettes/content and nothing else:
 *
 *   mixtape.md, collection.md, control.toml   text, with a hash so two writers cannot
 *                                             silently overwrite each other
 *   images beside a mixtape.md                added, never overwritten
 *   new collection and lerpette folders       scaffolded from the templates below
 *   a new chapter's code/<id>/js/index.ts     scaffolded once, on save; never overwritten
 *
 * Every path is built from validated slugs and checked to resolve inside the content
 * root, so nothing a request says can reach a file outside it.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { getLerpetteLibrary, renderMarkdownPreview } from '../../lib/content';
import { CARD_DEFAULTS } from '../../lib/cardArt';
import { site } from '../../site.config';

export const CONTENT_ROOT = path.join(process.cwd(), 'lerpettes/content');

/** Folder names a collection or lerpette may have: they are its URL. */
export const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
/** Chapter ids, as headingSpec.ts reads them. */
export const CHAPTER_ID = /^[A-Za-z0-9][A-Za-z0-9-_]*$/;
const TEXT_FILES = new Set(['mixtape.md', 'collection.md', 'control.toml']);
const IMAGE_TYPES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif']);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export type Reply = {
  status: number;
  json: unknown;
  /** Page paths whose open tabs should reload: the editor's preview, mostly. */
  reload?: string[];
  /**
   * Files this request created that make a new page. Astro's dev server learns a route
   * only when its file watcher reports a new file, which can come after the browser has
   * already navigated there; the middleware reports these before replying.
   */
  created?: string[];
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
  }
}

/** Files the editor itself just wrote, so the dev server's watcher does not reload every tab for them. */
export function recentEditorWrites(): Map<string, number> {
  const g = globalThis as { __lerpitEditorWrites?: Map<string, number> };
  g.__lerpitEditorWrites ??= new Map();
  return g.__lerpitEditorWrites;
}

function noteWrite(file: string) {
  const writes = recentEditorWrites();
  writes.set(path.resolve(file), Date.now());
  for (const [key, at] of writes) if (Date.now() - at > 10_000) writes.delete(key);
}

export function hashOf(text: string): string {
  return createHash('sha1').update(text).digest('hex').slice(0, 16);
}

function slug(value: unknown, what: string): string {
  if (typeof value !== 'string' || !SLUG.test(value)) {
    throw new ApiError(400, `${what} must be lowercase letters, digits and dashes, starting with a letter or digit.`);
  }
  return value;
}

/** Resolves inside the content root or refuses. */
function inside(...parts: string[]): string {
  const resolved = path.resolve(CONTENT_ROOT, ...parts);
  if (resolved !== CONTENT_ROOT && !resolved.startsWith(CONTENT_ROOT + path.sep)) {
    throw new ApiError(400, 'That path is outside lerpettes/content.');
  }
  return resolved;
}

async function readText(file: string): Promise<{ text: string; hash: string } | null> {
  try {
    const text = await fsp.readFile(file, 'utf8');
    return { text, hash: hashOf(text) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function library() {
  // The editor sees everything, whatever the L/P switch says for the pages.
  const view = process.env.LERPIT_VIEW;
  process.env.LERPIT_VIEW = 'local';
  try {
    return await getLerpetteLibrary();
  } finally {
    process.env.LERPIT_VIEW = view;
  }
}

/** The page path a lerpette or collection is served at, for a targeted reload. */
function pagePath(collection: string, lerpette?: string) {
  return lerpette ? `/${collection}/${lerpette}/` : `/${collection}/`;
}

// ---------------------------------------------------------------- reads

async function tree(): Promise<Reply> {
  const lib = await library();
  return {
    status: 200,
    json: {
      author: site.author,
      landingCollection: site.landingCollection,
      problems: lib.problems,
      collections: lib.collections.map((collection) => ({
        slug: collection.slug,
        title: collection.title,
        href: collection.href,
        problems: collection.problems.length,
        lerpettes: collection.mixtapes.map((mixtape) => ({
          slug: mixtape.slug,
          title: mixtape.title,
          href: mixtape.href,
          status: mixtape.status,
          publishedOn: mixtape.publishedOn,
          problems: mixtape.problems.length
        }))
      }))
    }
  };
}

async function lerpette(query: URLSearchParams): Promise<Reply> {
  const c = slug(query.get('c'), 'The collection');
  const l = slug(query.get('l'), 'The lerpette');
  const dir = inside(c, l);
  if (!fs.existsSync(dir)) throw new ApiError(404, `There is no lerpette at ${c}/${l}.`);

  const lib = await library();
  const collection = lib.collections.find((entry) => entry.slug === c);
  const mixtape = collection?.mixtapes.find((entry) => entry.slug === l);
  const codeDir = path.join(dir, 'code');
  const codeFolders = fs.existsSync(codeDir)
    ? (await fsp.readdir(codeDir, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : [];
  const images = (await fsp.readdir(dir)).filter((name) => IMAGE_TYPES.has(path.extname(name).toLowerCase()));

  return {
    status: 200,
    json: {
      collection: { slug: c, title: collection?.title ?? c },
      slug: l,
      href: pagePath(c, l),
      mixtape: await readText(path.join(dir, 'mixtape.md')),
      control: await readText(path.join(dir, 'control.toml')),
      codeFolders,
      images,
      parsed: mixtape
        ? {
            title: mixtape.title,
            status: mixtape.status,
            summary: mixtape.summary,
            introPanels: mixtape.introPanels,
            steps: mixtape.steps.map((step) => ({ id: step.id, title: step.title, panels: step.panels, hasOwnRuntime: step.hasOwnRuntime })),
            cardStyle: mixtape.cardStyle,
            palette: mixtape.palette ?? null,
            publishedOn: mixtape.publishedOn,
            problems: mixtape.problems
          }
        : null,
      siblings: (collection?.mixtapes ?? []).map((entry) => ({ slug: entry.slug, title: entry.title, status: entry.status }))
    }
  };
}

async function collection(query: URLSearchParams): Promise<Reply> {
  const c = slug(query.get('c'), 'The collection');
  const dir = inside(c);
  if (!fs.existsSync(dir)) throw new ApiError(404, `There is no collection called ${c}.`);
  const lib = await library();
  const found = lib.collections.find((entry) => entry.slug === c);
  return {
    status: 200,
    json: {
      slug: c,
      href: pagePath(c),
      document: await readText(path.join(dir, 'collection.md')),
      control: await readText(path.join(dir, 'control.toml')),
      title: found?.title ?? c,
      problems: found?.problems ?? [],
      // The style the cards draw when card_style is unset: assigned across the library.
      effectiveStyle: found?.mixtapes[0]?.cardStyle ?? null,
      lerpettes: await Promise.all((found?.mixtapes ?? []).map(async (mixtape) => ({
        slug: mixtape.slug,
        title: mixtape.title,
        summary: mixtape.summary,
        publishedOn: mixtape.publishedOn,
        chapters: mixtape.steps.length,
        status: mixtape.status,
        problems: mixtape.problems.length,
        // Each one's own settings, so the collection page can set status and order.
        control: await readText(path.join(dir, mixtape.slug, 'control.toml'))
      })))
    }
  };
}

// ---------------------------------------------------------------- writes

type WriteBody = {
  c: string;
  l?: string;
  file: string;
  text: string;
  baseHash: string | null;
  /** The editor reloads its own tab when it needs to; quiet skips reloading the page's other tabs. */
  quiet?: boolean;
};

async function writeFile(body: WriteBody): Promise<Reply> {
  const c = slug(body.c, 'The collection');
  const l = body.l === undefined || body.l === null ? null : slug(body.l, 'The lerpette');
  if (!TEXT_FILES.has(body.file)) throw new ApiError(400, `The editor only writes ${[...TEXT_FILES].join(', ')}.`);
  if (body.file === 'mixtape.md' && !l) throw new ApiError(400, 'mixtape.md belongs to a lerpette.');
  if (body.file === 'collection.md' && l) throw new ApiError(400, 'collection.md belongs to a collection.');
  if (typeof body.text !== 'string') throw new ApiError(400, 'No text to write.');

  const dir = l ? inside(c, l) : inside(c);
  if (!fs.existsSync(dir)) throw new ApiError(404, `${l ? `${c}/${l}` : c} is not there any more.`);
  const file = path.join(dir, body.file);
  const current = await readText(file);

  // The file moved on since the editor read it: another editor, or a save from VS Code.
  if ((current?.hash ?? null) !== (body.baseHash ?? null)) {
    throw new ApiError(409, `${body.file} changed on disk since you opened it.`, { current });
  }

  const reload = body.quiet ? [] : [pagePath(c, l ?? undefined)];

  // An emptied control.toml goes, rather than lingering as a blank file.
  if (body.file === 'control.toml' && body.text.trim() === '') {
    if (current) {
      noteWrite(file);
      await fsp.unlink(file);
    }
    return { status: 200, json: { hash: null, ...(await problemsFor(c, l)) }, reload };
  }

  noteWrite(file);
  await fsp.writeFile(file, body.text, 'utf8');
  return { status: 200, json: { hash: hashOf(body.text), ...(await problemsFor(c, l)) }, reload };
}

async function problemsFor(c: string, l: string | null) {
  const lib = await library();
  const collection = lib.collections.find((entry) => entry.slug === c);
  if (!l) return { problems: collection?.problems ?? [] };
  const mixtape = collection?.mixtapes.find((entry) => entry.slug === l);
  return {
    problems: mixtape?.problems ?? [],
    steps: mixtape?.steps.map((step) => ({ id: step.id, title: step.title, panels: step.panels, hasOwnRuntime: step.hasOwnRuntime })) ?? [],
    introPanels: mixtape?.introPanels ?? []
  };
}

function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Strips what would break a one-line Markdown heading or paragraph. */
function oneLine(value: unknown, what: string, max = 200): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (!text) throw new ApiError(400, `${what} is empty.`);
  if (text.length > max) throw new ApiError(400, `${what} is longer than ${max} characters.`);
  return text;
}

async function createCollection(body: { slug: string; title: string; summary?: string; cardStyle?: string; palette?: string }): Promise<Reply> {
  const c = slug(body.slug, 'The collection folder');
  const title = oneLine(body.title, 'The title');
  const summary = typeof body.summary === 'string' && body.summary.trim() ? body.summary.trim() : 'What this collection is about, in a sentence or two.';
  const dir = inside(c);
  if (fs.existsSync(dir)) throw new ApiError(409, `There is already a folder called ${c}.`);

  // Not marked as an editor write: the content watcher's reaction to a new folder is also
  // what makes Astro's router learn the new route, without which the page is a 404.
  await fsp.mkdir(dir);
  const doc = path.join(dir, 'collection.md');
  noteWrite(doc);
  await fsp.writeFile(doc, `# ${title}\n\n${summary}\n`, 'utf8');
  const control = [
    ...(body.palette ? [`palette = ${JSON.stringify(body.palette)}`] : []),
    ...(body.cardStyle ? [`card_style = ${JSON.stringify(body.cardStyle)}`] : [])
  ];
  if (control.length) {
    const file = path.join(dir, 'control.toml');
    noteWrite(file);
    await fsp.writeFile(file, `# The style and palette every card in this collection draws.\n${control.join('\n')}\n`, 'utf8');
  }
  return { status: 201, json: { slug: c, href: pagePath(c) }, created: [doc] };
}

/** The first chapter's code in a new lerpette: docs/authoring.md's spring, to be replaced. */
const STARTER_CHAPTER = `import { createStage } from '@lerpit/framework/chapter';

// A starting point: a ball on a spring. Replace it with this chapter's own code.
export default createStage({
  caption: 'A ball on a spring.',
  state: { x: 1, v: 0 },
  step(s, dt) {
    s.v += -8 * s.x * dt;
    s.x += s.v * dt;
  },
  viewport2d: {
    draw(sketch, s) {
      sketch.circle(s.x * 0.3, 0, 12, { color: 0xd17041 });
    }
  }
});
`;

async function createLerpette(body: { c: string; slug: string; title: string; author?: string; summary?: string }): Promise<Reply> {
  const c = slug(body.c, 'The collection');
  const l = slug(body.slug, 'The lerpette folder');
  const title = oneLine(body.title, 'The title');
  const author = typeof body.author === 'string' && body.author.trim() ? oneLine(body.author, 'The author', 80).replace(/\|/g, '/') : site.author;
  const summary = typeof body.summary === 'string' && body.summary.trim() ? body.summary.trim() : 'One paragraph: what the reader will build. The library card shows it.';
  if (!fs.existsSync(inside(c))) throw new ApiError(404, `There is no collection called ${c}.`);
  const dir = inside(c, l);
  if (fs.existsSync(dir)) throw new ApiError(409, `${c} already has a lerpette called ${l}.`);

  await fsp.mkdir(dir);
  const doc = path.join(dir, 'mixtape.md');
  noteWrite(doc);
  await fsp.writeFile(
    doc,
    `Author: ${author} | Date: ${today()}\n\n# ${title} {#intro +viewport2d}\n\n${summary}\n\n## First steps {#first-steps}\n\nThe first chapter.\n`,
    'utf8'
  );
  const control = path.join(dir, 'control.toml');
  noteWrite(control);
  // A new lerpette starts where nobody but its author can see it.
  await fsp.writeFile(control, '# Local only until it is ready. Switch to "published" to ship it.\nstatus = "draft"\n', 'utf8');
  // And with something on its stage, so it opens alive and with no problems listed.
  const module = path.join(dir, 'code', 'first-steps', 'js', 'index.ts');
  await fsp.mkdir(path.dirname(module), { recursive: true });
  noteWrite(module);
  await fsp.writeFile(module, STARTER_CHAPTER, 'utf8');
  return { status: 201, json: { c, slug: l, href: pagePath(c, l) }, created: [doc, module] };
}

async function render(body: { c: string; l?: string; chapter?: string; markdown: string }): Promise<Reply> {
  const c = slug(body.c, 'The collection');
  const dir = body.l ? inside(c, slug(body.l, 'The lerpette')) : inside(c);
  const chapter = typeof body.chapter === 'string' && CHAPTER_ID.test(body.chapter) ? body.chapter : null;
  if (typeof body.markdown !== 'string') throw new ApiError(400, 'No markdown to render.');
  const { html, problems } = renderMarkdownPreview(body.markdown, dir, chapter ? path.join(dir, 'code', chapter) : null);
  return { status: 200, json: { html, problems } };
}

async function addImage(query: URLSearchParams, data: Buffer): Promise<Reply> {
  const c = slug(query.get('c'), 'The collection');
  const l = slug(query.get('l'), 'The lerpette');
  const raw = path.basename(query.get('name') ?? '');
  const ext = path.extname(raw).toLowerCase();
  if (!IMAGE_TYPES.has(ext)) throw new ApiError(400, `Only images can be added: ${[...IMAGE_TYPES].join(' ')}.`);
  if (data.length === 0) throw new ApiError(400, 'The image is empty.');
  if (data.length > MAX_IMAGE_BYTES) throw new ApiError(413, 'That image is over 15 MB; shrink it first.');
  const stem = path.basename(raw, path.extname(raw)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'image';
  const dir = inside(c, l);
  if (!fs.existsSync(dir)) throw new ApiError(404, `${c}/${l} is not there.`);

  // Never overwrite: a second figure.png becomes figure-2.png.
  let name = `${stem}${ext}`;
  for (let n = 2; fs.existsSync(path.join(dir, name)); n += 1) name = `${stem}-${n}${ext}`;
  const file = path.join(dir, name);
  noteWrite(file);
  await fsp.writeFile(file, data, { flag: 'wx' });
  return { status: 201, json: { name } };
}

/** Renames a chapter's code folder with its id; the heading and control.toml are the editor's to save. */
async function renameCodeFolder(body: { c: string; l: string; from: string; to: string }): Promise<Reply> {
  const c = slug(body.c, 'The collection');
  const l = slug(body.l, 'The lerpette');
  if (!CHAPTER_ID.test(body.from ?? '') || !CHAPTER_ID.test(body.to ?? '')) throw new ApiError(400, 'Chapter ids are letters, digits, - and _.');
  const from = inside(c, l, 'code', body.from);
  const to = inside(c, l, 'code', body.to);
  if (!fs.existsSync(from)) return { status: 200, json: { moved: false } };
  if (fs.existsSync(to)) throw new ApiError(409, `code/${body.to}/ already exists, so code/${body.from}/ was not moved.`);
  noteWrite(from);
  noteWrite(to);
  await fsp.rename(from, to);
  return { status: 200, json: { moved: true } };
}

/** A new chapter's starting code: state only, so it runs clean under whichever panel the
 *  heading ends up naming, instead of opening with runtime-missing or chapter-code-unused. */
const MINIMAL_CHAPTER = `import { createStage } from '@lerpit/framework/chapter';

// A starting point for this chapter. Replace it with real state and a view.
export default createStage({
  state: {}
});
`;

async function scaffoldChapter(body: { c: string; l: string; id: string }): Promise<Reply> {
  const c = slug(body.c, 'The collection');
  const l = slug(body.l, 'The lerpette');
  if (!CHAPTER_ID.test(body.id ?? '')) throw new ApiError(400, 'Chapter ids are letters, digits, - and _.');
  if (!fs.existsSync(inside(c, l))) throw new ApiError(404, `${c}/${l} is not there any more.`);

  const codeDir = inside(c, l, 'code', body.id);
  // Never over a folder that is already there: a rename that lands on a fresh id after
  // this chapter already had code of its own must not be clobbered.
  if (fs.existsSync(codeDir)) return { status: 200, json: { scaffolded: false } };

  const module = path.join(codeDir, 'js', 'index.ts');
  await fsp.mkdir(path.dirname(module), { recursive: true });
  noteWrite(module);
  await fsp.writeFile(module, MINIMAL_CHAPTER, 'utf8');
  return { status: 201, json: { scaffolded: true }, created: [module] };
}

/** Card defaults the page needs to draw a collection's cards the way the site does. */
function cardDefaults(): Reply {
  return { status: 200, json: CARD_DEFAULTS };
}

// ---------------------------------------------------------------- routing

export async function handle(method: string, route: string, query: URLSearchParams, raw: Buffer): Promise<Reply> {
  const json = () => {
    try {
      return JSON.parse(raw.toString('utf8') || '{}');
    } catch {
      throw new ApiError(400, 'The request body is not JSON.');
    }
  };

  try {
    switch (`${method} ${route}`) {
      case 'GET tree': return await tree();
      case 'GET lerpette': return await lerpette(query);
      case 'GET collection': return await collection(query);
      case 'GET card-defaults': return cardDefaults();
      case 'PUT file': return await writeFile(json());
      case 'POST collection': return await createCollection(json());
      case 'POST lerpette': return await createLerpette(json());
      case 'POST render': return await render(json());
      case 'POST image': return await addImage(query, raw);
      case 'POST rename-code': return await renameCodeFolder(json());
      case 'POST scaffold-chapter': return await scaffoldChapter(json());
      default: throw new ApiError(404, `No editor endpoint ${method} ${route}.`);
    }
  } catch (error) {
    if (error instanceof ApiError) return { status: error.status, json: { error: error.message, detail: error.detail ?? null } };
    return { status: 500, json: { error: error instanceof Error ? error.message : String(error) } };
  }
}
