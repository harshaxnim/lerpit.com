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
import { isPanelName, PANEL_NAMES } from '@lerpit/framework/panels/registry';
import { parseHeading, resolvePanels } from './headingSpec';
import { defaultControl, isLandingCandidate, isListed, isRoutable, parseCollectionControl, parseControl, type LerpetteControl } from './control';
import type { ProblemId } from './problems';
import { site } from '../site.config';

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
type Report = (id: ProblemId, message: string, fix?: string, where?: string) => void;

const LERPETTE_ROOT = path.join(process.cwd(), 'lerpettes/content');
// Runtime import keys are paths relative to runtimeLoader.ts, so they line up with
// the keys its import.meta.glob() produces.
const RUNTIME_LOADER_DIR = path.join(process.cwd(), 'website/src/lib');
const ASSET_ROUTE_PREFIX = '/assets/lerpettes';
// The collection whose newest lerpette is served at '/', unless a control.toml says
// `landing = true`. Set in site.config.ts.
const LANDING_COLLECTION_SLUG = site.landingCollection;

/** Optional, one per lerpette folder, beside mixtape.md. See lib/control.ts. */
const CONTROL_FILE = 'control.toml';

/**
 * Hiding only happens in a production build. Locally every lerpette is listed and
 * routed, each card tagged with its status, so an author can see their drafts
 * without having to remember what they hid.
 *
 * The dev server's view toggle (scripts/dev-view-toggle.mjs) can ask for the public
 * view instead, which hides exactly what production hides. Read per build, since
 * the toggle flips it between requests.
 */
function hidesLikeProduction(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.LERPIT_VIEW === 'public';
}

/**
 * Whether a page spells out its authoring problems: the problems box's list (message,
 * fix, path), and the `!` marks on a card and a chapter. Those are for the author, so
 * only in local view. Public view and a production build still say a page is unfinished,
 * but not why (ContentProblems.astro). The build lists them all in its log.
 */
export function showsAuthoringProblems(): boolean {
  return !hidesLikeProduction();
}
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

/** Every lerpette that gets a page, including the unlisted ones. For routing. */
export async function getRoutableMixtapes(): Promise<LerpetteMixtape[]> {
  return (await getLerpetteLibrary()).routable;
}

export async function getMixtapeBySlugs(collectionSlug: string, mixtapeSlug: string): Promise<LerpetteMixtape | undefined> {
  return (await getLerpetteLibrary()).routable.find(
    (mixtape) => mixtape.collectionSlug === collectionSlug && mixtape.slug === mixtapeSlug
  );
}

export async function getLerpetteAssetEntries(): Promise<LerpetteAssetEntry[]> {
  return (await getLerpetteLibrary()).assetEntries;
}

/**
 * A piece of a document rendered the way its page renders it: the same Markdown,
 * maths, figures, asset links and code boxes. For the local editor's prose preview
 * (website/src/editor), so what it shows cannot drift from the site.
 *
 * `docDir` is the lerpette's (or collection's) folder, which relative links resolve
 * against; `codeDir`, a chapter's code folder, is what its code boxes are checked against.
 */
export function renderMarkdownPreview(markdown: string, docDir: string, codeDir: string | null = null) {
  const { problems, report } = createProblemLog(docDir);
  const html = renderNodesToHtml(parseMarkdown(markdown).children, docDir, report, codeDir);
  return { html, problems };
}

function createProblemLog(defaultWhere: string) {
  const problems: LerpetteProblem[] = [];

  const report: Report = (id, message, fix, where = defaultWhere) => {
    problems.push({ id, where: toContentPath(where), message, fix });
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
              'link-missing', `The document links to \`${node.url}\`, which is not there.`,
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
  const isProduction = hidesLikeProduction();

  if (!fs.existsSync(LERPETTE_ROOT)) {
    report(
      'content-root-missing', 'There is no content root, so the site has nothing to publish.',
      `Create ${LERPETTE_ROOT} with one directory per collection.`
    );

    return { landing: emptyMixtape(problems), collections: [], mixtapes: [], routable: [], assetEntries: [], problems };
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
    // The collection's own card_style wins over the assignment.
    for (const mixtape of collection.mixtapes) {
      mixtape.cardStyle = collection.cardStyle ?? style;
      if (collection.cardPalette) mixtape.cardPalette = collection.cardPalette;
    }
  }

  const newestFirst = (left: LerpetteMixtape, right: LerpetteMixtape) =>
    right.publishedOn.localeCompare(left.publishedOn);

  // Routing and listing are separate questions, so they get separate answers.
  // An unlisted lerpette still gets a page, which is the whole point of it: the
  // link works for whoever has it, and nothing else points there.
  const routable = collections
    .flatMap((collection) => collection.mixtapes)
    .filter((mixtape) => isRoutable(mixtape.status, isProduction))
    .sort(newestFirst);

  // Narrowed in place, so every shelf and collection page that reads
  // collection.mixtapes hides the right things without knowing this exists.
  for (const collection of collections) {
    collection.allMixtapes = collection.mixtapes;
    collection.mixtapes = collection.mixtapes.filter(
      (mixtape) => isRoutable(mixtape.status, isProduction) && isListed(mixtape.status, isProduction)
    );
  }

  const mixtapes = collections.flatMap((collection) => collection.mixtapes).sort(newestFirst);

  // The landing lesson is served at '/' AND kept in its collection listing (so it
  // still shows up under its own collection). Clone with an overridden href for the
  // homepage; the original keeps its canonical href for the listing and its own route.
  // Published only, and the same rule locally as in production, so '/' never shows
  // a draft at home and a different lerpette once deployed. Drafts and unlisted
  // ones are skipped here even when the local build is listing them everywhere else.
  const published = routable.filter((mixtape) => isLandingCandidate(mixtape.status)).sort(newestFirst);
  const landingCollection = collections.find((collection) => collection.slug === LANDING_COLLECTION_SLUG);
  const fromLandingCollection = published.filter(
    (mixtape) => mixtape.collectionSlug === LANDING_COLLECTION_SLUG
  );
  // `landing = true` in a control.toml picks '/' outright. Two of them is a mistake:
  // the newest wins, and the author is told.
  const chosen = published.filter((mixtape) => mixtape.landing);
  if (chosen.length > 1) {
    report(
      'landing-multiple',
      `${chosen.length} lerpettes set landing = true; '/' shows the newest, ${chosen[0].collectionSlug}/${chosen[0].slug}.`,
      `Keep landing = true in one ${CONTROL_FILE}.`
    );
  }
  for (const mixtape of routable.filter((entry) => entry.landing && !isLandingCandidate(entry.status))) {
    mixtape.problems.push({
      id: 'landing-unpublished',
      where: `${mixtape.collectionSlug}/${mixtape.slug}/${CONTROL_FILE}`,
      message: `This lerpette sets landing = true but is ${mixtape.status}, so it cannot be '/'.`,
      fix: 'Publish it, or remove landing = true.'
    });
  }
  const newest = chosen[0] ?? fromLandingCollection[0] ?? published[0];
  if (chosen.length === 0 && (!landingCollection || fromLandingCollection.length === 0)) {
    report(
      'landing-empty', `The landing collection has no published lerpette, so '/' falls back to the newest published one in the library.`,
      `Add a lerpette under lerpettes/content/${LANDING_COLLECTION_SLUG}/, or set status = "published" in its ${CONTROL_FILE}.`,
      path.join(LERPETTE_ROOT, LANDING_COLLECTION_SLUG)
    );
  }

  // '/' is where a library-level problem is visible, so the landing clone carries it.
  const landing: LerpetteMixtape = newest
    ? { ...newest, href: '/', problems: [...problems, ...newest.problems] }
    : emptyMixtape(problems);
  const unpublished = collections
    .flatMap((collection) => collection.allMixtapes)
    .filter((mixtape) => !isRoutable(mixtape.status, isProduction))
    .map((mixtape) => path.join(LERPETTE_ROOT, mixtape.collectionSlug ?? '', mixtape.slug));
  const assetEntries = await collectAssetEntries(LERPETTE_ROOT, unpublished);
  for (const collection of collections) delete (collection as { allMixtapes?: unknown }).allMixtapes;
  const library = { landing, collections, mixtapes, routable, assetEntries, problems };

  logProblems(library);

  return library;
}

async function parseCollectionDirectory(collectionDir: string): Promise<LerpetteCollection & { allMixtapes?: LerpetteMixtape[] }> {
  const collectionSlug = path.basename(collectionDir);
  const { problems, report } = createProblemLog(collectionDir);
  const collectionDoc = await parseCollectionDocument(collectionDir, `/${collectionSlug}/`, report);
  const collectionControl = await readCollectionControl(collectionDir, report);

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

  // An author's order first, lowest first; then newest first by publishedOn
  // (YYYY-MM-DD sorts lexicographically).
  mixtapes.sort((left, right) => {
    const a = left.order ?? Infinity;
    const b = right.order ?? Infinity;
    return a !== b ? a - b : right.publishedOn.localeCompare(left.publishedOn);
  });

  return {
    slug: collectionSlug,
    href: collectionDoc.href,
    title: collectionDoc.title,
    summary: collectionDoc.summary,
    bodyHtml: collectionDoc.bodyHtml,
    ...(collectionControl.cardStyle ? { cardStyle: collectionControl.cardStyle } : {}),
    ...(collectionControl.cardPalette ? { cardPalette: collectionControl.cardPalette } : {}),
    mixtapes,
    problems
  };
}

/** A collection's own control.toml, beside collection.md. Optional; see parseCollectionControl. */
async function readCollectionControl(collectionDir: string, report: Report) {
  const controlPath = path.join(collectionDir, CONTROL_FILE);
  let source: string;
  try {
    source = await fsp.readFile(controlPath, 'utf8');
  } catch {
    return { cardStyle: null, cardPalette: null };
  }
  const { control, problems } = parseCollectionControl(source);
  for (const problem of problems) report(problem.id, problem.what, problem.fix, controlPath);
  return control;
}

async function parseCollectionDocument(collectionDir: string, href: string, report: Report) {
  const slug = path.basename(collectionDir);
  const filePath = resolveDocumentPath(collectionDir, 'collection', report);
  if (!filePath) {
    return { href, title: titleFromSlug(slug), summary: '', bodyHtml: '' };
  }

  const source = await fsp.readFile(filePath, 'utf-8');
  reportFrontMatter(source, report, filePath);
  const root = parseMarkdown(source);
  reportRawHtml(root, report, filePath);
  const h1Index = root.children.findIndex((node) => node.type === 'heading' && node.depth === 1);
  if (h1Index < 0) {
    report(
      'collection-title-missing', 'The collection has no title, so its slug is shown instead.',
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
  const control = await readControl(mixtapeDir, report);
  const shell = {
    slug: path.basename(mixtapeDir),
    href,
    collectionSlug,
    collectionTitle,
    status: control.status,
    landing: control.landing,
    order: control.order,
    problems
  };

  try {
    return { ...shell, ...(await parseMixtapeDocument(mixtapeDir, report, control)) };
  } catch (error) {
    // The checks above cover everything an author is expected to get wrong. This is
    // the net under the rest — a markdown extension throwing, a file vanishing
    // mid-build — so that one bad lerpette can still never take the site down.
    report('internal-error', describeError(error), 'This one is a bug, not an authoring mistake.');
    return { ...shell, ...emptyDocument(titleFromSlug(shell.slug)) };
  }
}

/**
 * control.toml is optional and stays optional: no file means every default, which
 * is published and listed. A file that cannot be read is reported and then
 * ignored, because a knob failing open would silently unpublish a lerpette.
 */
async function readControl(mixtapeDir: string, report: Report) {
  const controlPath = path.join(mixtapeDir, CONTROL_FILE);

  let source: string;
  try {
    source = await fsp.readFile(controlPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      report(
        'control-unreadable', `${CONTROL_FILE} could not be read, so its settings were skipped. ${describeError(error)}`,
        `Check the file's permissions, or delete it to take the defaults.`,
        controlPath
      );
    }
    return defaultControl();
  }

  const { control, problems } = parseControl(source);
  for (const problem of problems) report(problem.id, problem.what, problem.fix, controlPath);
  return control;
}

async function parseMixtapeDocument(mixtapeDir: string, report: Report, control: LerpetteControl = defaultControl()) {
  const slug = path.basename(mixtapeDir);
  const mixtapePath = resolveDocumentPath(mixtapeDir, 'mixtape', report);
  if (!mixtapePath) {
    return emptyDocument(titleFromSlug(slug));
  }

  const source = await fsp.readFile(mixtapePath, 'utf-8');
  reportFrontMatter(source, report, mixtapePath);
  const root = parseMarkdown(source);
  reportRawHtml(root, report, mixtapePath);
  const h1Index = root.children.findIndex((node) => node.type === 'heading' && node.depth === 1);
  if (h1Index < 0) {
    report(
      'title-missing', 'This lerpette has no title, so its slug is shown instead.',
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
      'chapters-missing', 'This lerpette has no chapters, so there is nothing for the panel to play.',
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
  titleSpec.problems.forEach((problem) => report('heading-token', problem.message, problem.fix, mixtapePath));
  reportUnknownPanels(titleSpec.ops, titleSpec.title, report, mixtapePath);
  const defaultPanels = resolvePanels([], titleSpec.ops);

  const steps =
    firstStepIndex < 0
      ? []
      : extractMixtapeSteps(contentNodes.slice(firstStepIndex), mixtapeDir, report, mixtapePath, defaultPanels, control);

  reportCodeDirectory(mixtapeDir, steps, report);
  reportControlChapters(control, steps, report, path.join(mixtapeDir, CONTROL_FILE));

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
  defaultPanels: readonly string[],
  control: LerpetteControl = defaultControl()
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
    parsed.problems.forEach((problem) => report('heading-token', problem.message, problem.fix, filePath));
    reportUnknownPanels(parsed.ops, parsed.title, report, filePath);

    if (!parsed.explicit) {
      report(
        'chapter-id-missing',
        `Chapter “${parsed.title}” has no explicit id, so its code is looked up at \`code/${id}/\`.`,
        `Write the heading as \`## ${parsed.title} {#${id}}\`.`,
        filePath
      );
    }

    if (seenIds.has(id)) {
      const unique = `${id}-${index + 1}`;
      report(
        'chapter-id-duplicate',
        `Two chapters share the id \`${id}\`, so the second one answers to \`${unique}\` instead.`,
        'Give each chapter its own id; links to the page use them as anchors.',
        filePath
      );
      id = unique;
    }

    seenIds.add(id);

    const panels = resolvePanels(defaultPanels, parsed.ops).filter((name) => isPanelName(name));
    return { id, title: parsed.title, body, panels, hasFence: hasCodeFence(body) };
  });

  /*
   * A chapter has a runtime of its own when it has anything to run: a module
   * (code/<id>/js/index.ts), a code box in its prose, or panels in its heading (which
   * the chapter runtime stands up even with nothing else). One with none of these
   * keeps the nearest chapter's stage on screen rather than emptying it.
   */
  const ownership = parsedSteps.map((step) => {
    const runtimeFile = path.join(mixtapeDir, 'code', step.id, 'js', 'index.ts');
    const hasModule = fs.existsSync(runtimeFile);
    return { runtimeFile, hasModule, exists: hasModule || step.hasFence || step.panels.length > 0 };
  });

  const firstRuntimeIndex = ownership.findIndex((entry) => entry.exists);
  if (firstRuntimeIndex < 0 && parsedSteps.length > 0) {
    report(
      'runtime-missing',
      'No chapter in this lerpette has anything to run, so the page renders without a stage.',
      `Name a panel in a heading (\`## ${parsedSteps[0].title} {#${parsedSteps[0].id} +viewport2d}\`), or add \`code/${parsedSteps[0].id}/js/index.ts\`.`
    );
  }

  return parsedSteps.map((step, index) => {
    const ownerIndex = firstRuntimeIndex < 0 ? -1 : findNearestRuntimeIndex(ownership, index);
    const owner = ownerIndex < 0 ? step : parsedSteps[ownerIndex];
    const ownerEntry = ownerIndex < 0 ? null : ownership[ownerIndex];

    // One value, two uses: the asset URL is this path under the asset route, and the
    // runtime is handed the path itself so it can read the chapter's own sources. A
    // chapter with its own runtime always gets its own folder, even with no module in
    // it, so its code boxes load and save its own files and never a neighbour's.
    const codePath = toPosixPath(path.relative(LERPETTE_ROOT, path.join(mixtapeDir, 'code', owner.id)));

    return {
      id: step.id,
      title: step.title,
      bodyHtml: renderNodesToHtml(step.body, mixtapeDir, report, path.join(mixtapeDir, 'code', step.id)),
      runtimeImportKey: ownerEntry?.hasModule ? toRuntimeImportKey(ownerEntry.runtimeFile) : '',
      runtimeStepId: owner.id,
      assetBasePath: `${ASSET_ROUTE_PREFIX}/${codePath}/`,
      codePath,
      hasOwnRuntime: ownership[index].exists,
      panels: ownerIndex < 0 ? step.panels : owner.panels,
      ...(control.caption[step.id] !== undefined ? { caption: control.caption[step.id] } : {}),
      ...(control.idleStatus[step.id] !== undefined ? { idleStatus: control.idleStatus[step.id] } : {})
    };
  });
}

/** Whether a chapter's prose has a `lerpit` fence anywhere in it. */
function hasCodeFence(nodes: MarkdownNode[]): boolean {
  let found = false;
  for (const node of nodes) {
    visit(node as never, 'code', (code: FenceNode) => {
      if (code.lang === FENCE_LANG) found = true;
    });
  }
  return found;
}

/**
 * A panel name the registry does not know. Caught here rather than at runtime, so the
 * author reads it in the problem list with the names that do exist, instead of finding
 * a caption in the stage saying the panel is missing. The name is dropped from the
 * chapter's list, so the rest of its panels still show.
 */
function reportUnknownPanels(ops: ReadonlyArray<{ op: string; name: string }>, title: string, report: Report, filePath: string) {
  for (const { op, name } of ops) {
    if (op === '-' || name === 'none' || isPanelName(name)) continue;
    report(
      'panel-unknown',
      `The heading “${title}” asks for a panel called \`${name}\`, which does not exist, so it is left out.`,
      `Panels: ${PANEL_NAMES.map((known) => `\`${known}\``).join(', ')}.`,
      filePath
    );
  }
}

/**
 * Front matter (a `---` block at the top) is not how a lerpette says anything: the
 * byline is the first line, and settings live in control.toml. Without this check the
 * block renders as a rule and a stray heading.
 */
function reportFrontMatter(source: string, report: Report, filePath: string) {
  if (!/^\uFEFF?---\r?\n/.test(source)) return;
  report(
    'front-matter',
    'The document starts with a front-matter block, which this site does not read; it renders as a rule and a heading.',
    'Delete the `---` block. The byline is the first line (`Author: … | Date: …`); settings go in control.toml.',
    filePath
  );
}

/**
 * Raw HTML is switched off for every document, so a tag written in prose silently
 * disappears. Comments are allowed (dropping them is what an author means), anything
 * else is reported.
 */
function reportRawHtml(root: MarkdownRoot, report: Report, filePath: string) {
  const seen = new Set<string>();
  visit(root as never, 'html', (node: { value?: string }) => {
    const value = (node.value ?? '').trim();
    if (!value || value.startsWith('<!--')) return;
    const tag = value.match(/^<\/?([A-Za-z][\w-]*)/)?.[1] ?? value.slice(0, 20);
    if (seen.has(tag)) return;
    seen.add(tag);
    report(
      'raw-html',
      `The document has raw HTML (\`<${tag}>\`), which is not rendered, so that part is missing from the page.`,
      'Write it in Markdown instead. Images, links, tables, maths and footnotes all have Markdown forms.',
      filePath
    );
  });
}

/** control.toml's per-chapter tables name chapters; a name that matches none is a typo. */
function reportControlChapters(control: LerpetteControl, steps: LerpetteStep[], report: Report, controlPath: string) {
  const ids = new Set(steps.map((step) => step.id));
  for (const [table, entries] of [['caption', control.caption], ['idle_status', control.idleStatus]] as const) {
    for (const id of Object.keys(entries)) {
      if (ids.has(id)) continue;
      report(
        'control-chapter-unknown',
        `control.toml's [${table}] names a chapter \`${id}\`, which this lerpette does not have.`,
        `Chapters here: ${[...ids].map((known) => `\`${known}\``).join(', ') || 'none'}.`,
        controlPath
      );
    }
  }
}

function findNearestRuntimeIndex(
  availability: Array<{ exists: boolean }>,
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
      report('code-dir-missing', 'This lerpette has chapters but no code directory.', `Add ${toContentPath(codeDir)}/.`);
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
        'code-stray-file', `\`code/${entry.name}\` is a file, but everything under code/ is a chapter directory.`,
        'Move it into the chapter that uses it, or into `code/shared/`.'
      );
      continue;
    }

    if (entry.name === 'shared') {
      continue;
    }

    if (!stepIds.has(entry.name)) {
      report(
        'code-dir-unmatched', `\`code/${entry.name}/\` matches no chapter id, so nothing loads it.`,
        `Either add a \`## Title {#${entry.name}}\` chapter, or delete the directory.`
      );
      continue;
    }

    // A code folder with no module is fine when the chapter runs anyway: its boxes
    // read their files from here, or its heading names panels. Only a folder nothing
    // will ever read is worth mentioning.
    const step = steps.find((candidate) => candidate.id === entry.name);
    const runtimeEntry = path.join(codeDir, entry.name, 'js', 'index.ts');
    if (step && !step.hasOwnRuntime && !fs.existsSync(runtimeEntry)) {
      report(
        'chapter-code-unused',
        `Chapter \`${entry.name}\` has a code directory, but nothing in the chapter runs it.`,
        `Add ${toContentPath(runtimeEntry)}, name a panel in its heading, or add a \`lerpit\` fence to its prose.`
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
    report('fence-syntax', problem.message, problem.fix);
  }

  if (node.value?.trim()) {
    report(
      'fence-body-ignored', 'A `lerpit` fence has code written inside it, which is ignored.',
      'The files are named on the fence line; leave the block empty.'
    );
  }

  const usable: string[] = [];

  for (const entry of entries) {
    if (!codeDir) {
      report(
        'fence-outside-chapter', `A \`lerpit\` fence names \`${entry.path}\`, but only a chapter has a code directory to look in.`,
        'Move the fence under a `## Heading {#step-id}`.'
      );
      continue;
    }

    const filePath = path.join(codeDir, entry.path);
    if (!fs.existsSync(filePath)) {
      report(
        'fence-file-missing', `A \`lerpit\` fence names \`${entry.path}\`, which is not there.`,
        `Add ${toContentPath(filePath)}, or correct the path.`
      );
      continue;
    }

    const source = fs.readFileSync(filePath, 'utf8');
    const { regions, problems: markerProblems } = scanRegions(source);

    for (const problem of markerProblems) {
      report('region-marker', `${entry.path} line ${problem.line}: ${problem.message}`, problem.fix);
    }

    if (entry.regionId && !regions.some((region) => region.id === entry.regionId)) {
      const known = regions.map((region) => `\`${region.id}\``).join(', ');
      report(
        'fence-region-missing', `\`${entry.path}\` does not mark a region called \`${entry.regionId}\`.`,
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
      'summary-missing', `This ${kind} has no summary, so its cassette card in the library is blank.`,
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
      'meta-line-missing', // An undated lerpette sorts last, so a half-written one never takes over '/'.
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
      'meta-line-misplaced', 'A metadata line appears in the body, where it is read as prose rather than as the byline.',
      'Keep exactly one metadata line, as the first line of the document.',
      filePath
    );
  }
}

async function collectAssetEntries(rootDir: string, unpublishedDirs: readonly string[]): Promise<LerpetteAssetEntry[]> {
  const files = await walkFiles(rootDir);
  // A lerpette that gets no page gets no assets either: a draft's images and wasm are
  // otherwise public at a guessable URL, which is the thing `draft` is for.
  const hidden = (filePath: string) => unpublishedDirs.some((dir) => filePath.startsWith(dir + path.sep));
  return files
    .filter((filePath) => isAssetFile(filePath) && !hidden(filePath))
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
    entries
      // A dot-directory is tooling (.vscode, .cache), never content.
      .filter((entry) => !(entry.isDirectory() && entry.name.startsWith('.')))
      .map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return walkFiles(entryPath);
      }

      return [entryPath];
    })
  );

  return results.flat();
}

/**
 * Files that are never published, whatever folder they are in: the operating system's
 * and the editor's leftovers, and tooling that only makes sense on the author's disk.
 */
const NEVER_PUBLISHED = new Set(['compile_flags.txt', 'compile_commands.json', 'Thumbs.db', 'desktop.ini']);

function isAssetFile(filePath: string): boolean {
  const basename = path.basename(filePath);

  // Dotfiles (.DS_Store, .gitkeep, an editor's swap file) and tooling files.
  if (basename.startsWith('.') || NEVER_PUBLISHED.has(basename)) {
    return false;
  }

  // Build-time settings, not something to serve. Without this it ships to
  // /assets/ alongside the images, which publishes the fact that a lerpette is
  // hidden and roughly where to look for it.
  if (basename === CONTROL_FILE) {
    return false;
  }

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
      'document-missing', `There is no ${basename} document here, so this page has no content of its own.`,
      `Write ${toContentPath(dir)}${basename}.md.`
    );

    return null;
  }

  if (matches.length > 1) {
    report(
      'document-duplicate', `Both ${basename}.md and ${basename}.mdx are here; only ${basename}.md is read.`,
      'Keep one document per slot.'
    );
  }

  return matches[0];
}
