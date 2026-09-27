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
import { assignStyles } from './cardArt';
import { parseFence, FENCE_LANG } from '@lerpit/libs/live-code/js/fence';
import { scanRegions } from '@lerpit/libs/live-code/js/regions';
import type {
  LerpetteAssetEntry,
  LerpetteCollection,
  LerpetteLibrary,
  LerpetteMixtape,
  LerpetteProblem,
  LerpetteStep
} from '@lerpit/framework/types';
import { parseHeading, resolvePanels } from './headingSpec';

type MarkdownNode = {
  type: string;
  depth?: number;
  url?: string;
  children?: MarkdownNode[];
};

/** A fenced code block, which is what carries a `lerpit` code box. */
type FenceNode = MarkdownNode & {
  lang?: string;
  meta?: string;
  value?: string;
  data?: { hName?: string; hProperties?: Record<string, string>; hChildren?: unknown[] };
};

type MarkdownRoot = {
  type: 'root';
  children: MarkdownNode[];
};

type MixtapeMeta = {
  author: string;
  date: string;
};

/**
 * Records what is wrong with an authored document. Nothing an author can write under
 * lerpettes/content/ throws: a document that does not parse is still published, and
 * its problems are rendered on its own page. See ContentProblems.astro.
 */
type Report = (message: string, fix?: string, where?: string) => void;

const LERPETTE_ROOT = path.join(process.cwd(), 'lerpettes/content');
// Runtime import keys are paths relative to runtimeLoader.ts, so they line up with
// the keys its import.meta.glob() produces.
const RUNTIME_LOADER_DIR = path.join(process.cwd(), 'website/src/lib');
const ASSET_ROUTE_PREFIX = '/assets/lerpettes';
// The collection whose newest lerpette is served at '/'.
const LANDING_COLLECTION_SLUG = 'physics-engine';
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

export async function getLandingLerpette(): Promise<LerpetteMixtape> {
  return (await getLerpetteLibrary()).landing;
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

function createProblemLog(defaultWhere: string) {
  const problems: LerpetteProblem[] = [];

  const report: Report = (message, fix, where = defaultWhere) => {
    problems.push({ where: toContentPath(where), message, fix });
  };

  return { problems, report };
}

function createParseProcessor() {
  return unified().use(remarkParse).use(remarkGfm).use(remarkMath);
}

function createRenderProcessor(docDir: string, report: Report, codeDir: string | null) {
  return unified()
    .use(remarkGfm)
    .use(remarkMath)
    .use(() => (tree: MarkdownRoot) => {
      visit(tree, 'code', (node: MarkdownNode) => {
        if ((node as FenceNode).lang === FENCE_LANG) {
          transformCodeFence(node as FenceNode, codeDir, report);
        }
      });
    })
    .use(() => (tree: MarkdownRoot) => {
      visit(tree, (node: MarkdownNode) => {
        if ((node.type === 'image' || node.type === 'link') && node.url && isRelativeUrl(node.url)) {
          const assetPath = path.resolve(docDir, node.url);
          if (!fs.existsSync(assetPath)) {
            // Left pointing where the author wrote it, so the gap shows up in the
            // prose as well as in the problem list.
            report(
              `The document links to \`${node.url}\`, which is not there.`,
              `Add the file at ${toContentPath(assetPath)}, or correct the link.`
            );
            return;
          }

          node.url = toAssetUrl(assetPath);
        }
      });
    })
    .use(remarkRehype)
    .use(() => (tree: any) => {
      visit(tree, 'element', (node: any, index: number | undefined, parent: any) => {
        if (!parent || typeof index !== 'number') {
          return;
        }

        if (node.tagName !== 'p' || !Array.isArray(node.children) || node.children.length !== 1) {
          return;
        }

        const imageNode = node.children[0];
        if (!imageNode || imageNode.type !== 'element' || imageNode.tagName !== 'img') {
          return;
        }

        const title = typeof imageNode.properties?.title === 'string' ? imageNode.properties.title.trim() : '';
        const alt = typeof imageNode.properties?.alt === 'string' ? imageNode.properties.alt.trim() : '';
        const caption = title || alt;
        const figureChildren: any[] = [imageNode];

        if (caption) {
          figureChildren.push({
            type: 'element',
            tagName: 'figcaption',
            properties: {},
            children: [{ type: 'text', value: caption }]
          });
        }

        parent.children[index] = {
          type: 'element',
          tagName: 'figure',
          properties: {},
          children: figureChildren
        };
      });
    })
    .use(rehypeKatex)
    .use(rehypeStringify);
}

async function buildLerpetteLibrary(): Promise<LerpetteLibrary> {
  const { problems, report } = createProblemLog(LERPETTE_ROOT);

  if (!fs.existsSync(LERPETTE_ROOT)) {
    report(
      'There is no content root, so the site has nothing to publish.',
      `Create ${LERPETTE_ROOT} with one directory per collection.`
    );

    return { landing: emptyMixtape(problems), collections: [], mixtapes: [], assetEntries: [], problems };
  }

  const directories = (await fsp.readdir(LERPETTE_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const collections = await Promise.all(
    directories
      .sort((left, right) => left.localeCompare(right))
      .map((directory) => parseCollectionDirectory(path.join(LERPETTE_ROOT, directory)))
  );

  // The card style is handed out here and nowhere else, because this is the only
  // place the whole library is in view. Picking it per card from the collection
  // name alone is uniform but independent, so twelve collections would land on
  // about nine distinct styles; assigning across the set gives twelve.
  const styles = assignStyles(collections.map((collection) => collection.title));
  for (const collection of collections) {
    const style = styles.get(collection.title);
    for (const mixtape of collection.mixtapes) mixtape.cardStyle = style;
  }

  const mixtapes = collections
    .flatMap((collection) => collection.mixtapes)
    .sort((left, right) => right.publishedOn.localeCompare(left.publishedOn));

  // The landing lesson is served at '/' AND kept in its collection listing (so it
  // still shows up under its own collection). Clone with an overridden href for the
  // homepage; the original keeps its canonical href for the listing and its own route.
  const landingCollection = collections.find((collection) => collection.slug === LANDING_COLLECTION_SLUG);
  // Collection mixtapes are sorted newest-first, so the newest one is the default.
  const newest = landingCollection?.mixtapes[0] ?? mixtapes[0];
  if (!landingCollection || landingCollection.mixtapes.length === 0) {
    report(
      `The landing collection has no lerpette, so '/' falls back to the newest one in the library.`,
      `Add a lerpette under lerpettes/content/${LANDING_COLLECTION_SLUG}/.`,
      path.join(LERPETTE_ROOT, LANDING_COLLECTION_SLUG)
    );
  }

  // '/' is where a library-level problem is visible, so the landing clone carries it.
  const landing: LerpetteMixtape = newest
    ? { ...newest, href: '/', problems: [...problems, ...newest.problems] }
    : emptyMixtape(problems);
  const assetEntries = await collectAssetEntries(LERPETTE_ROOT);
  const library = { landing, collections, mixtapes, assetEntries, problems };

  logProblems(library);

  return library;
}

async function parseCollectionDirectory(collectionDir: string): Promise<LerpetteCollection> {
  const collectionSlug = path.basename(collectionDir);
  const { problems, report } = createProblemLog(collectionDir);
  const collectionDoc = await parseCollectionDocument(collectionDir, `/${collectionSlug}/`, report);

  const mixtapeDirs = (await fsp.readdir(collectionDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const mixtapes = await Promise.all(
    mixtapeDirs.map((mixtapeSlug) =>
      parseMixtapeDirectory(
        path.join(collectionDir, mixtapeSlug),
        collectionSlug,
        collectionDoc.title,
        `/${collectionSlug}/${mixtapeSlug}/`
      )
    )
  );

  // Newest-first by publishedOn (YYYY-MM-DD sorts lexicographically).
  mixtapes.sort((left, right) => right.publishedOn.localeCompare(left.publishedOn));

  return {
    slug: collectionSlug,
    href: collectionDoc.href,
    title: collectionDoc.title,
    summary: collectionDoc.summary,
    bodyHtml: collectionDoc.bodyHtml,
    mixtapes,
    problems
  };
}

async function parseCollectionDocument(collectionDir: string, href: string, report: Report) {
  const slug = path.basename(collectionDir);
  const filePath = resolveDocumentPath(collectionDir, 'collection', report);
  if (!filePath) {
    return { href, title: titleFromSlug(slug), summary: '', bodyHtml: '' };
  }

  const source = await fsp.readFile(filePath, 'utf-8');
  const root = parseMarkdown(source);
  const h1Index = root.children.findIndex((node) => node.type === 'heading' && node.depth === 1);
  if (h1Index < 0) {
    report(
      'The collection has no title, so its slug is shown instead.',
      'Start the document with one `# Title` heading.',
      filePath
    );
  }

  const bodyNodes = root.children.slice(h1Index + 1);

  return {
    href,
    title: h1Index >= 0 ? toString(root.children[h1Index] as never).trim() : titleFromSlug(slug),
    summary: extractSummary(bodyNodes, report, filePath, 'collection').summary,
    bodyHtml: renderNodesToHtml(bodyNodes, collectionDir, report)
  };
}

async function parseMixtapeDirectory(
  mixtapeDir: string,
  collectionSlug: string,
  collectionTitle: string,
  href: string
): Promise<LerpetteMixtape> {
  const { problems, report } = createProblemLog(mixtapeDir);
  const shell = {
    slug: path.basename(mixtapeDir),
    href,
    collectionSlug,
    collectionTitle,
    problems
  };

  try {
    return { ...shell, ...(await parseMixtapeDocument(mixtapeDir, report)) };
  } catch (error) {
    // The checks above cover everything an author is expected to get wrong. This is
    // the net under the rest — a markdown extension throwing, a file vanishing
    // mid-build — so that one bad lerpette can still never take the site down.
    report(describeError(error), 'This one is a bug, not an authoring mistake.');
    return { ...shell, ...emptyDocument(titleFromSlug(shell.slug)) };
  }
}

async function parseMixtapeDocument(mixtapeDir: string, report: Report) {
  const slug = path.basename(mixtapeDir);
  const mixtapePath = resolveDocumentPath(mixtapeDir, 'mixtape', report);
  if (!mixtapePath) {
    return emptyDocument(titleFromSlug(slug));
  }

  const source = await fsp.readFile(mixtapePath, 'utf-8');
  const root = parseMarkdown(source);
  const h1Index = root.children.findIndex((node) => node.type === 'heading' && node.depth === 1);
  if (h1Index < 0) {
    report(
      'This lerpette has no title, so its slug is shown instead.',
      'Put one `# Title` heading under the metadata line.',
      mixtapePath
    );
  }

  // Without a title there is no line between the head of the document and its body,
  // so the metadata line is reported once, as missing, and not again as misplaced.
  const meta = extractTopMixtapeMeta(h1Index >= 0 ? root.children.slice(0, h1Index) : [], report, mixtapePath);
  const contentNodes = root.children.slice(h1Index + 1);
  if (h1Index >= 0) {
    reportBodyMetaLine(contentNodes, report, mixtapePath);
  }

  const firstStepIndex = contentNodes.findIndex((node) => node.type === 'heading' && node.depth === 2);
  if (firstStepIndex < 0) {
    report(
      'This lerpette has no chapters, so there is nothing for the panel to play.',
      'Add a chapter heading in the form `## Title {#step-id}`.',
      mixtapePath
    );
  }

  const introNodes = firstStepIndex < 0 ? contentNodes : contentNodes.slice(0, firstStepIndex);
  const { summary, summaryNode, remainingNodes } = extractSummary(introNodes, report, mixtapePath, 'lerpette');
  // The title heading is the article's opening section, numbered 00, and is parsed by
  // the same rules as a chapter. Whatever panels it names are the default every
  // chapter inherits, which is the only place an article-wide setting is written.
  const titleSpec =
    h1Index >= 0 ? parseHeading(toString(root.children[h1Index] as never)) : parseHeading(titleFromSlug(slug));
  titleSpec.problems.forEach((problem) => report(problem.message, problem.fix, mixtapePath));
  const defaultPanels = resolvePanels([], titleSpec.ops);

  const steps =
    firstStepIndex < 0
      ? []
      : extractMixtapeSteps(contentNodes.slice(firstStepIndex), mixtapeDir, report, mixtapePath, defaultPanels);

  reportCodeDirectory(mixtapeDir, steps, report);

  return {
    title: titleSpec.title,
    // Links already point at #intro, so only an author who writes an explicit id moves it.
    introId: titleSpec.explicit ? titleSpec.id : 'intro',
    introPanels: defaultPanels,
    summary,
    publishedOn: meta.date,
    author: meta.author,
    introHtml: renderNodesToHtml(summaryNode ? [summaryNode, ...remainingNodes] : remainingNodes, mixtapeDir, report),
    steps
  };
}

function extractMixtapeSteps(
  stepNodes: MarkdownNode[],
  mixtapeDir: string,
  report: Report,
  filePath: string,
  defaultPanels: readonly string[]
): LerpetteStep[] {
  const steps: Array<{ heading: MarkdownNode; body: MarkdownNode[] }> = [];
  let current: { heading: MarkdownNode; body: MarkdownNode[] } | null = null;

  for (const node of stepNodes) {
    if (node.type === 'heading' && node.depth === 2) {
      if (current) {
        steps.push(current);
      }

      current = { heading: node, body: [] };
      continue;
    }

    // stepNodes starts at the first H2, so there is always a chapter to hang this on.
    current?.body.push(node);
  }

  if (current) {
    steps.push(current);
  }

  const seenIds = new Set<string>();
  const parsedSteps = steps.map(({ heading, body }, index) => {
    const parsed = parseHeading(toString(heading as never));
    let id = parsed.id || `step-${index + 1}`;

    // A heading's settings are reported against the document, not swallowed: an author
    // who writes `+viewpoint2d` gets told, rather than getting a chapter with no panel.
    parsed.problems.forEach((problem) => report(problem.message, problem.fix, filePath));

    if (!parsed.explicit) {
      report(
        `Chapter “${parsed.title}” has no explicit id, so its runtime is looked up at \`code/${id}/\`.`,
        `Write the heading as \`## ${parsed.title} {#${id}}\`.`,
        filePath
      );
    }

    if (seenIds.has(id)) {
      const unique = `${id}-${index + 1}`;
      report(
        `Two chapters share the id \`${id}\`, so the second one answers to \`${unique}\` instead.`,
        'Give each chapter its own id; links to the page use them as anchors.',
        filePath
      );
      id = unique;
    }

    seenIds.add(id);

    return { id, title: parsed.title, body, panels: resolvePanels(defaultPanels, parsed.ops) };
  });

  const runtimeAvailability = parsedSteps.map((step) => {
    const runtimeFile = path.join(mixtapeDir, 'code', step.id, 'js', 'index.ts');
    return { runtimeFile, exists: fs.existsSync(runtimeFile) };
  });

  const firstRuntimeIndex = runtimeAvailability.findIndex((entry) => entry.exists);
  if (firstRuntimeIndex < 0) {
    report(
      'No chapter in this lerpette has a runtime, so the page renders without a panel.',
      `Add \`code/${parsedSteps[0].id}/js/index.ts\` with a default-exported runtime.`
    );
  }

  return parsedSteps.map((step, index) => {
    // A chapter with no runtime of its own keeps the nearest one on screen rather
    // than emptying the panel; with none anywhere, the panel is not rendered at all.
    const fallbackIndex = firstRuntimeIndex < 0 ? -1 : findNearestRuntimeIndex(runtimeAvailability, index);
    const runtimeStepId = fallbackIndex < 0 ? step.id : parsedSteps[fallbackIndex].id;

    // One value, two uses: the asset URL is this path under the asset route, and the
    // runtime is handed the path itself so it can read the chapter's own sources.
    const codePath = toPosixPath(path.relative(LERPETTE_ROOT, path.join(mixtapeDir, 'code', runtimeStepId)));

    return {
      id: step.id,
      title: step.title,
      bodyHtml: renderNodesToHtml(step.body, mixtapeDir, report, path.join(mixtapeDir, 'code', step.id)),
      runtimeImportKey: fallbackIndex < 0 ? '' : toRuntimeImportKey(runtimeAvailability[fallbackIndex].runtimeFile),
      assetBasePath: `${ASSET_ROUTE_PREFIX}/${codePath}/`,
      codePath,
      hasOwnRuntime: runtimeAvailability[index].exists,
      panels: step.panels
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

  return -1;
}

function reportCodeDirectory(mixtapeDir: string, steps: LerpetteStep[], report: Report) {
  const codeDir = path.join(mixtapeDir, 'code');
  if (!fs.existsSync(codeDir)) {
    if (steps.length > 0) {
      report('This lerpette has chapters but no code directory.', `Add ${toContentPath(codeDir)}/.`);
    }

    return;
  }

  const stepIds = new Set(steps.map((step) => step.id));

  for (const entry of fs.readdirSync(codeDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    if (!entry.isDirectory()) {
      report(
        `\`code/${entry.name}\` is a file, but everything under code/ is a chapter directory.`,
        'Move it into the chapter that uses it, or into `code/shared/`.'
      );
      continue;
    }

    if (entry.name === 'shared') {
      continue;
    }

    if (!stepIds.has(entry.name)) {
      report(
        `\`code/${entry.name}/\` matches no chapter id, so nothing loads it.`,
        `Either add a \`## Title {#${entry.name}}\` chapter, or delete the directory.`
      );
      continue;
    }

    const runtimeEntry = path.join(codeDir, entry.name, 'js', 'index.ts');
    if (!fs.existsSync(runtimeEntry)) {
      report(
        `Chapter \`${entry.name}\` has a code directory but no runtime entry.`,
        `Add ${toContentPath(runtimeEntry)}.`
      );
    }
  }
}

function parseMarkdown(source: string): MarkdownRoot {
  return createParseProcessor().parse(source) as MarkdownRoot;
}

/**
 * Turn a ```lerpit fence into the empty box the player fills.
 *
 * `data.hName` and `hProperties` are mdast-util-to-hast's documented way to say what
 * a node should become, so the rest of the pipeline is untouched and raw HTML stays
 * off for every document on the site.
 *
 * Everything the fence claims is checked here, in Node, against the files on disk:
 * that the file exists, that its markers parse, and that it really marks the region
 * the fence asked for. An author who mistypes a region name gets a line in the page's
 * problem panel naming the regions the file does have, rather than a box with a tab
 * that does nothing.
 */
function transformCodeFence(node: FenceNode, codeDir: string | null, report: Report) {
  const { entries, problems } = parseFence(node.meta ?? '');

  for (const problem of problems) {
    report(problem.message, problem.fix);
  }

  if (node.value?.trim()) {
    report(
      'A `lerpit` fence has code written inside it, which is ignored.',
      'The files are named on the fence line; leave the block empty.'
    );
  }

  const usable: string[] = [];

  for (const entry of entries) {
    if (!codeDir) {
      report(
        `A \`lerpit\` fence names \`${entry.path}\`, but only a chapter has a code directory to look in.`,
        'Move the fence under a `## Heading {#step-id}`.'
      );
      continue;
    }

    const filePath = path.join(codeDir, entry.path);
    if (!fs.existsSync(filePath)) {
      report(
        `A \`lerpit\` fence names \`${entry.path}\`, which is not there.`,
        `Add ${toContentPath(filePath)}, or correct the path.`
      );
      continue;
    }

    const source = fs.readFileSync(filePath, 'utf8');
    const { regions, problems: markerProblems } = scanRegions(source);

    for (const problem of markerProblems) {
      report(`${entry.path} line ${problem.line}: ${problem.message}`, problem.fix);
    }

    if (entry.regionId && !regions.some((region) => region.id === entry.regionId)) {
      const known = regions.map((region) => `\`${region.id}\``).join(', ');
      report(
        `\`${entry.path}\` does not mark a region called \`${entry.regionId}\`.`,
        known
          ? `That file marks ${known}. Use one of those, or add the marker.`
          : `Add \`// lerpit:${entry.regionId}:edit:start\` and a matching \`:end\` to that file.`
      );
      continue;
    }

    usable.push(entry.regionId ? `${entry.path}:${entry.regionId}` : entry.path);
  }

  // The node stops being a `code` node first. mdast-util-to-hast's code handler wraps
  // whatever it produces in a <pre>, and `hName` only renames the element inside it,
  // so leaving the type alone yields <pre><div class="lerpette-code"></div></pre>: the
  // box is then not a child of .prose-block and its bleed is measured against the
  // wrapper. An unrecognised type goes through the unknown handler, which honours
  // hName, hProperties and hChildren and wraps nothing.
  node.type = 'lerpitCodeBox';
  node.value = '';

  // The box is rendered even when nothing in it resolved, because an empty box with a
  // problem listed above it reads better than a chapter that silently lost a section.
  node.data = {
    hName: 'div',
    hProperties: {
      className: 'lerpette-code',
      'data-lerpit-code': usable.join(' ')
    },
    hChildren: []
  };
}

function renderNodesToHtml(
  nodes: MarkdownNode[],
  docDir: string,
  report: Report,
  codeDir: string | null = null
): string {
  if (nodes.length === 0) {
    return '';
  }

  const processor = createRenderProcessor(docDir, report, codeDir);
  const tree = {
    type: 'root',
    children: nodes
  } satisfies MarkdownRoot;

  const result = processor.runSync(tree as never);
  return String(processor.stringify(result));
}

function extractSummary(
  nodes: MarkdownNode[],
  report: Report,
  filePath: string,
  kind: 'lerpette' | 'collection'
): {
  summary: string;
  summaryNode?: MarkdownNode;
  remainingNodes: MarkdownNode[];
} {
  const paragraphIndex = nodes.findIndex((node) => node.type === 'paragraph');
  if (paragraphIndex < 0) {
    report(
      `This ${kind} has no summary, so its cassette card in the library is blank.`,
      'Write the summary as the first paragraph after the title.',
      filePath
    );

    return { summary: '', remainingNodes: nodes };
  }

  return {
    summary: toString(nodes[paragraphIndex] as never).trim(),
    summaryNode: nodes[paragraphIndex],
    remainingNodes: nodes.filter((_, index) => index !== paragraphIndex)
  };
}

function extractTopMixtapeMeta(nodesBeforeTitle: MarkdownNode[], report: Report, filePath: string): MixtapeMeta {
  const firstNode = nodesBeforeTitle[0];
  const raw = firstNode?.type === 'paragraph' ? toString(firstNode as never).trim() : '';
  const match = raw.match(/^Author:\s*(.+?)\s*\|\s*Date:\s*(\d{4}-\d{2}-\d{2})$/);

  if (!match || nodesBeforeTitle.length !== 1) {
    report(
      // An undated lerpette sorts last, so a half-written one never takes over '/'.
      'The metadata line is missing or malformed, so this lerpette is undated and sorts last.',
      'Make the very first line exactly `Author: <name> | Date: YYYY-MM-DD`.',
      filePath
    );

    return { author: match?.[1]?.trim() || 'unknown', date: match?.[2] ?? '' };
  }

  return { author: match[1].trim(), date: match[2] };
}

function reportBodyMetaLine(nodes: MarkdownNode[], report: Report, filePath: string) {
  const misplaced = nodes.some(
    (node) =>
      node.type === 'paragraph' &&
      /^Author:\s*.+?\s*\|\s*Date:\s*\d{4}-\d{2}-\d{2}$/i.test(toString(node as never).trim())
  );

  if (misplaced) {
    report(
      'A metadata line appears in the body, where it is read as prose rather than as the byline.',
      'Keep exactly one metadata line, as the first line of the document.',
      filePath
    );
  }
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

function emptyDocument(title: string) {
  return {
    title,
    summary: '',
    publishedOn: '',
    author: 'unknown',
    introHtml: '',
    introId: 'intro',
    introPanels: [],
    steps: []
  };
}

function emptyMixtape(problems: LerpetteProblem[]): LerpetteMixtape {
  return { slug: 'library', href: '/', problems, ...emptyDocument('Nothing published yet') };
}

/** `point-dynamics` -> `Point dynamics`, for a document that did not name itself. */
function titleFromSlug(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : slug;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Dev renders problems into the page, which is where an author is looking. A
 * production build is read from a terminal, so it says the same thing there.
 */
function logProblems(library: LerpetteLibrary) {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const all = [
    ...library.problems,
    ...library.collections.flatMap((collection) => collection.problems),
    ...library.mixtapes.flatMap((mixtape) => mixtape.problems)
  ];

  if (all.length === 0) {
    return;
  }

  console.warn(`\n[lerpit] ${all.length} authoring ${all.length === 1 ? 'problem' : 'problems'}; the site still builds.`);
  for (const problem of all) {
    console.warn(`  ${problem.where}: ${problem.message}${problem.fix ? ` ${problem.fix}` : ''}`);
  }
  console.warn('');
}

function toRuntimeImportKey(absRuntimePath: string): string {
  return toPosixPath(path.relative(RUNTIME_LOADER_DIR, absRuntimePath));
}

function toAssetUrl(absAssetPath: string): string {
  return `${ASSET_ROUTE_PREFIX}/${toPosixPath(path.relative(LERPETTE_ROOT, absAssetPath))}`;
}

/** Where a problem is, written the way an author refers to it: relative to the content root. */
function toContentPath(absPath: string): string {
  const relative = toPosixPath(path.relative(LERPETTE_ROOT, absPath));
  if (!relative) {
    return 'lerpettes/content/';
  }

  return path.extname(relative) ? relative : `${relative}/`;
}

function isRelativeUrl(url: string): boolean {
  return !url.startsWith('#') && !url.startsWith('/') && !/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url);
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function resolveDocumentPath(dir: string, basename: 'collection' | 'mixtape', report: Report): string | null {
  const matches = ['.md', '.mdx']
    .map((extension) => path.join(dir, `${basename}${extension}`))
    .filter((filePath) => fs.existsSync(filePath));

  if (matches.length === 0) {
    report(
      `There is no ${basename} document here, so this page has no content of its own.`,
      `Write ${toContentPath(dir)}${basename}.md.`
    );

    return null;
  }

  if (matches.length > 1) {
    report(
      `Both ${basename}.md and ${basename}.mdx are here; only ${basename}.md is read.`,
      'Keep one document per slot.'
    );
  }

  return matches[0];
}
