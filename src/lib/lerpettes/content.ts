import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { toString } from 'mdast-util-to-string';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import type {
  LerpetteAssetEntry,
  LerpetteCollection,
  LerpetteLibrary,
  LerpetteMixtape,
  LerpetteStep
} from './types';

type MarkdownNode = {
  type: string;
  depth?: number;
  url?: string;
  children?: MarkdownNode[];
};

type MarkdownRoot = {
  type: 'root';
  children: MarkdownNode[];
};

type MixtapeMeta = {
  author: string;
  date: string;
};

const LERPETTE_ROOT = path.join(process.cwd(), 'src/lerpettes');
const RUNTIME_LOADER_DIR = path.join(process.cwd(), 'src/lib/lerpettes');
const ASSET_ROUTE_PREFIX = '/assets/lerpettes';
const DOC_BASENAMES = new Set(['collection', 'mixtape']);
const CODE_EXTENSIONS = new Set(['.js', '.ts', '.jsx', '.tsx', '.mts', '.cts']);
const DOCUMENT_EXTENSIONS = new Set(['.md', '.mdx']);
const MIME_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

let cachedLibrary: Promise<LerpetteLibrary> | null = null;

export async function getLerpetteLibrary(): Promise<LerpetteLibrary> {
  if (process.env.NODE_ENV !== 'production') {
    return buildLerpetteLibrary();
  }

  if (!cachedLibrary) {
    cachedLibrary = buildLerpetteLibrary();
  }

  return cachedLibrary;
}

export async function getIssueZeroLerpette(): Promise<LerpetteMixtape> {
  return (await getLerpetteLibrary()).issueZero;
}

export async function getCollections(): Promise<LerpetteCollection[]> {
  return (await getLerpetteLibrary()).collections;
}

export async function getCollectionBySlug(slug: string): Promise<LerpetteCollection | undefined> {
  return (await getLerpetteLibrary()).collections.find((collection) => collection.slug === slug);
}

export async function getMixtapeBySlugs(collectionSlug: string, mixtapeSlug: string): Promise<LerpetteMixtape | undefined> {
  return (await getLerpetteLibrary()).mixtapes.find(
    (mixtape) => mixtape.collectionSlug === collectionSlug && mixtape.slug === mixtapeSlug
  );
}

export async function getLerpetteAssetEntries(): Promise<LerpetteAssetEntry[]> {
  return (await getLerpetteLibrary()).assetEntries;
}

function createParseProcessor() {
  return unified().use(remarkParse).use(remarkGfm).use(remarkMath);
}

function createRenderProcessor(docDir: string) {
  return unified()
    .use(remarkGfm)
    .use(remarkMath)
    .use(() => (tree: MarkdownRoot) => {
      visit(tree, (node: MarkdownNode) => {
        if ((node.type === 'image' || node.type === 'link') && node.url && isRelativeUrl(node.url)) {
          const assetPath = path.resolve(docDir, node.url);
          if (!fs.existsSync(assetPath)) {
            throw new Error(`Referenced asset was not found: ${node.url}`);
          }

          node.url = toAssetUrl(assetPath);
        }
      });
    })
    .use(remarkRehype)
    .use(rehypeKatex)
    .use(rehypeStringify);
}

async function buildLerpetteLibrary(): Promise<LerpetteLibrary> {
  assert(fs.existsSync(LERPETTE_ROOT), `Missing lerpette root directory at ${LERPETTE_ROOT}`);

  const directories = (await fsp.readdir(LERPETTE_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  assert(directories.includes('issue-zero'), 'Missing special issue-zero directory under src/lerpettes.');

  const issueZero = await parseMixtapeDirectory(
    path.join(LERPETTE_ROOT, 'issue-zero'),
    undefined,
    undefined,
    '/'
  );

  const collections = await Promise.all(
    directories
      .filter((directory) => directory !== 'issue-zero')
      .sort((left, right) => left.localeCompare(right))
      .map((directory) => parseCollectionDirectory(path.join(LERPETTE_ROOT, directory)))
  );

  const mixtapes = collections.flatMap((collection) => collection.mixtapes);
  const assetEntries = await collectAssetEntries(LERPETTE_ROOT);

  return {
    issueZero,
    collections,
    mixtapes,
    assetEntries
  };
}

async function parseCollectionDirectory(collectionDir: string): Promise<LerpetteCollection> {
  const collectionSlug = path.basename(collectionDir);
  const collectionPath = resolveDocumentPath(collectionDir, 'collection');

  const collectionDoc = await parseCollectionDocument(collectionPath, `/${collectionSlug}/`);
  const mixtapeDirs = (await fsp.readdir(collectionDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const mixtapes = await Promise.all(
    mixtapeDirs.map(async (mixtapeSlug) => {
      const href = `/${collectionSlug}/${mixtapeSlug}/`;
      const mixtape = await parseMixtapeDirectory(
        path.join(collectionDir, mixtapeSlug),
        collectionSlug,
        collectionDoc.title,
        href
      );

      return mixtape;
    })
  );

  return {
    slug: collectionSlug,
    href: collectionDoc.href,
    title: collectionDoc.title,
    summary: collectionDoc.summary,
    bodyHtml: collectionDoc.bodyHtml,
    mixtapes
  };
}

async function parseCollectionDocument(filePath: string, href: string) {
  const docDir = path.dirname(filePath);
  const source = await fsp.readFile(filePath, 'utf-8');
  const root = parseMarkdown(source);
  const h1Index = root.children.findIndex((node) => node.type === 'heading' && node.depth === 1);
  assert(h1Index >= 0, `Missing H1 in ${filePath}`);

  const h1Node = root.children[h1Index];
  const title = getHeadingTitle(h1Node, 1, filePath).title;
  const bodyNodes = root.children.slice(h1Index + 1);
  const { summary } = extractSummary(bodyNodes, filePath);

  return {
    href,
    title,
    summary,
    bodyHtml: renderNodesToHtml(bodyNodes, docDir)
  };
}

async function parseMixtapeDirectory(
  mixtapeDir: string,
  collectionSlug?: string,
  collectionTitle?: string,
  href?: string
): Promise<LerpetteMixtape> {
  const mixtapePath = resolveDocumentPath(mixtapeDir, 'mixtape');

  const source = await fsp.readFile(mixtapePath, 'utf-8');
  const root = parseMarkdown(source);
  const h1Index = root.children.findIndex((node) => node.type === 'heading' && node.depth === 1);
  assert(h1Index >= 0, `Missing H1 in ${mixtapePath}`);

  const { meta: preTitleMeta } = extractMixtapeMeta(root.children.slice(0, h1Index), mixtapePath, false);
  const title = getHeadingTitle(root.children[h1Index], 1, mixtapePath).title;
  const contentNodes = root.children.slice(h1Index + 1);
  const firstStepIndex = contentNodes.findIndex((node) => node.type === 'heading' && node.depth === 2);
  assert(firstStepIndex >= 0, `Mixtape ${mixtapePath} must include at least one H2 chapter with an explicit id.`);

  const introNodes = contentNodes.slice(0, firstStepIndex);
  const { summary, summaryNode, remainingNodes: introNodesWithoutSummary } = extractSummary(introNodes, mixtapePath);
  const { meta: postSummaryMeta, remainingNodes: introBodyNodes } = extractMixtapeMeta(
    introNodesWithoutSummary,
    mixtapePath,
    false
  );
  const meta = preTitleMeta ?? postSummaryMeta;
  assert(meta, `Expected metadata near the top of ${mixtapePath}. Use "Author: Harsha | Date: YYYY-MM-DD".`);
  const stepNodes = contentNodes.slice(firstStepIndex);
  const steps = extractMixtapeSteps(stepNodes, mixtapePath, mixtapeDir);

  validateCodeDirectory(mixtapeDir, steps);

  return {
    slug: path.basename(mixtapeDir),
    href: href ?? (collectionSlug ? `/${collectionSlug}/${path.basename(mixtapeDir)}/` : '/'),
    title,
    summary,
    publishedOn: meta.date,
    author: meta.author,
    introHtml: renderNodesToHtml([summaryNode, ...introBodyNodes], mixtapeDir),
    steps,
    collectionSlug,
    collectionTitle
  };
}

function extractMixtapeSteps(stepNodes: MarkdownNode[], filePath: string, mixtapeDir: string): LerpetteStep[] {
  const steps: Array<{ heading: MarkdownNode; body: MarkdownNode[] }> = [];
  let current: { heading: MarkdownNode; body: MarkdownNode[] } | null = null;

  for (const node of stepNodes) {
    if (node.type === 'heading' && node.depth === 2) {
      if (current) {
        steps.push(current);
      }

      current = {
        heading: node,
        body: []
      };
      continue;
    }

    assert(current, `Content appeared before the first H2 chapter in ${filePath}`);
    current.body.push(node);
  }

  if (current) {
    steps.push(current);
  }

  const seenIds = new Set<string>();
  const parsedSteps = steps.map(({ heading, body }) => {
    const { title, id } = getHeadingTitle(heading, 2, filePath);
    assert(id, `Missing explicit H2 id in ${filePath}. Use the form "## Title {#step-id}".`);
    assert(!seenIds.has(id), `Duplicate step id "${id}" found in ${filePath}`);
    seenIds.add(id);

    return { id, title, body };
  });

  const runtimeAvailability = parsedSteps.map((step) => {
    const runtimeFile = path.join(mixtapeDir, 'code', step.id, 'js', 'index.ts');
    return {
      runtimeFile,
      exists: fs.existsSync(runtimeFile)
    };
  });

  const hasAnyRuntime = runtimeAvailability.some((entry) => entry.exists);
  assert(hasAnyRuntime, `No runtime entry found for any step in ${mixtapeDir}/code/*/js/index.ts`);

  return parsedSteps.map((step, index) => {
    const fallbackIndex = findNearestRuntimeIndex(runtimeAvailability, index);
    const runtimeStepId = parsedSteps[fallbackIndex].id;
    const runtimeFile = runtimeAvailability[fallbackIndex].runtimeFile;

    return {
      id: step.id,
      title: step.title,
      bodyHtml: renderNodesToHtml(step.body, mixtapeDir),
      runtimeImportKey: toRuntimeImportKey(runtimeFile),
      assetBasePath: `${ASSET_ROUTE_PREFIX}/${toPosixPath(path.relative(LERPETTE_ROOT, path.join(mixtapeDir, 'code', runtimeStepId)))}/`
    };
  });
}

function findNearestRuntimeIndex(
  availability: Array<{ runtimeFile: string; exists: boolean }>,
  fromIndex: number
): number {
  if (availability[fromIndex]?.exists) {
    return fromIndex;
  }

  for (let index = fromIndex + 1; index < availability.length; index += 1) {
    if (availability[index].exists) {
      return index;
    }
  }

  for (let index = fromIndex - 1; index >= 0; index -= 1) {
    if (availability[index].exists) {
      return index;
    }
  }

  throw new Error(`No runtime available near step index ${fromIndex}.`);
}

function validateCodeDirectory(mixtapeDir: string, steps: LerpetteStep[]) {
  const codeDir = path.join(mixtapeDir, 'code');
  assert(fs.existsSync(codeDir), `Missing code directory in ${mixtapeDir}`);

  const stepIds = new Set(steps.map((step) => step.id));
  const entries = fs.readdirSync(codeDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      throw new Error(`Unexpected file in ${codeDir}: ${entry.name}`);
    }

    const entryId = entry.name;
    if (entryId === 'shared') {
      continue;
    }

    if (!stepIds.has(entryId)) {
      throw new Error(`Runtime directory "${entryId}" does not match any H2 step id in ${mixtapeDir}`);
    }

    const runtimeEntry = path.join(codeDir, entryId, 'js', 'index.ts');
    if (!fs.existsSync(runtimeEntry)) {
      throw new Error(`Malformed runtime directory for "${entryId}". Expected ${runtimeEntry}`);
    }
  }
}

function parseMarkdown(source: string): MarkdownRoot {
  return createParseProcessor().parse(source) as MarkdownRoot;
}

function renderNodesToHtml(nodes: MarkdownNode[], docDir: string): string {
  if (nodes.length === 0) {
    return '';
  }

  const processor = createRenderProcessor(docDir);
  const tree = {
    type: 'root',
    children: nodes
  } satisfies MarkdownRoot;

  const result = processor.runSync(tree as never);
  return String(processor.stringify(result));
}

function getHeadingTitle(node: MarkdownNode, depth: number, filePath: string): { title: string; id?: string } {
  assert(node.type === 'heading' && node.depth === depth, `Expected H${depth} in ${filePath}`);

  const raw = toString(node as never).trim();
  if (depth === 2) {
    const match = raw.match(/^(.*?)\s*\{#([A-Za-z0-9][A-Za-z0-9-_]*)\}$/);
    assert(match, `Heading "${raw}" in ${filePath} is missing an explicit id.`);

    return {
      title: match[1].trim(),
      id: match[2]
    };
  }

  return { title: raw };
}

function extractSummary(nodes: MarkdownNode[], filePath: string): {
  summary: string;
  summaryNode: MarkdownNode;
  remainingNodes: MarkdownNode[];
} {
  const paragraphIndex = nodes.findIndex((node) => node.type === 'paragraph');
  const paragraph = paragraphIndex >= 0 ? nodes[paragraphIndex] : undefined;
  assert(paragraph, `Expected a summary paragraph near the top of ${filePath}`);
  return {
    summary: toString(paragraph as never).trim(),
    summaryNode: paragraph,
    remainingNodes: nodes.filter((_, index) => index !== paragraphIndex)
  };
}

function extractMixtapeMeta(
  nodes: MarkdownNode[],
  filePath: string,
  required = true
): { meta?: MixtapeMeta; remainingNodes: MarkdownNode[] } {
  const paragraphIndex = nodes.findIndex((node) => node.type === 'paragraph');
  const paragraph = paragraphIndex >= 0 ? nodes[paragraphIndex] : undefined;
  if (!paragraph) {
    assert(!required, `Expected metadata after summary in ${filePath}. Use "Author: Harsha | Date: YYYY-MM-DD".`);
    return {
      remainingNodes: nodes
    };
  }

  const raw = toString(paragraph as never).trim();
  const looksLikeMeta = /\bauthor\s*:/i.test(raw) || /\bdate\s*:/i.test(raw);
  if (!looksLikeMeta) {
    assert(!required, `Expected metadata after summary in ${filePath}. Use "Author: Harsha | Date: YYYY-MM-DD".`);
    return {
      remainingNodes: nodes
    };
  }

  const parts = raw
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  const meta = new Map<string, string>();

  for (const part of parts) {
    const separatorIndex = part.indexOf(':');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim().toLowerCase();
    const value = part.slice(separatorIndex + 1).trim();
    if (!key || !value) {
      continue;
    }

    meta.set(key, value);
  }

  const author = meta.get('author');
  const date = meta.get('date');

  assert(author, `Missing author metadata in ${filePath}. Use "Author: Harsha | Date: YYYY-MM-DD".`);
  assert(date, `Missing date metadata in ${filePath}. Use "Author: Harsha | Date: YYYY-MM-DD".`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(date), `Invalid date "${date}" in ${filePath}. Use YYYY-MM-DD.`);

  return {
    meta: {
      author,
      date
    },
    remainingNodes: nodes.filter((_, index) => index !== paragraphIndex)
  };
}

async function collectAssetEntries(rootDir: string): Promise<LerpetteAssetEntry[]> {
  const files = await walkFiles(rootDir);
  return files
    .filter((filePath) => isAssetFile(filePath))
    .sort((left, right) => left.localeCompare(right))
    .map((filePath) => ({
      urlPath: `${ASSET_ROUTE_PREFIX}/${toPosixPath(path.relative(LERPETTE_ROOT, filePath))}`,
      filePath,
      contentType: getContentType(filePath)
    }));
}

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const results = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return walkFiles(entryPath);
      }

      return [entryPath];
    })
  );

  return results.flat();
}

function isAssetFile(filePath: string): boolean {
  const basename = path.basename(filePath);
  const parsed = path.parse(basename);
  if (DOC_BASENAMES.has(parsed.name) && DOCUMENT_EXTENSIONS.has(parsed.ext)) {
    return false;
  }

  const ext = path.extname(filePath);
  return !DOCUMENT_EXTENSIONS.has(ext) && !CODE_EXTENSIONS.has(ext);
}

function getContentType(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function toRuntimeImportKey(absRuntimePath: string): string {
  return toPosixPath(path.relative(RUNTIME_LOADER_DIR, absRuntimePath));
}

function toAssetUrl(absAssetPath: string): string {
  return `${ASSET_ROUTE_PREFIX}/${toPosixPath(path.relative(LERPETTE_ROOT, absAssetPath))}`;
}

function isRelativeUrl(url: string): boolean {
  return !url.startsWith('#') && !url.startsWith('/') && !/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url);
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function resolveDocumentPath(dir: string, basename: 'collection' | 'mixtape'): string {
  const matches = ['.md', '.mdx']
    .map((extension) => path.join(dir, `${basename}${extension}`))
    .filter((filePath) => fs.existsSync(filePath));

  assert(matches.length > 0, `Missing ${basename}.md or ${basename}.mdx in ${dir}`);
  assert(matches.length === 1, `Found multiple ${basename} documents in ${dir}. Keep only one.`);

  return matches[0];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
