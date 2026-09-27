import type { EditorLayer } from './runtimes/editorLayer';
import type { LerpettePanelKind, LerpettePanelSlot } from './panels/types';
import type { CanvasViewportSurface } from './panels/canvasViewport/canvasViewportPanel';

/**
 * What a step's runtime is handed. The slot half is lent by the player; `surface` is
 * whatever this step's panel returned from create(), so it is the panel kind that
 * decides what a runtime can draw on.
 */
export type LerpetteRuntimeContext<Surface = CanvasViewportSurface> = LerpettePanelSlot & {
  currentStepId: string;
  resolveAssetUrl: (relativePath: string) => string;
  surface: Surface;
  /**
   * The empty boxes a `lerpit` fence left in this step's prose, in document order.
   * A runtime that puts something in the article rather than in the panel builds
   * here: the editor belongs beside the words it is about, while the panel stays the
   * place the result is drawn.
   *
   * A list rather than one box, because the author decides how many there are and
   * where each goes. Each carries the files it was written with on
   * `dataset.lerpitCode`, so the fence stays the only place that names them.
   */
  codeHosts: HTMLElement[];
  /**
   * This chapter's own directory under lerpettes/content, as `<collection>/<mixtape>/
   * code/<step-id>`. A runtime that reads the lesson's source files needs to say which
   * lesson it is, and deriving that from a URL would mean parsing one back into a
   * filesystem path. `assetBasePath` is built from this, so the two cannot disagree.
   */
  codePath: string;
  /**
   * Every code box on the page, already built and on screen. A runtime claims the ones
   * in its own section so that pressing run builds into its panels; it never creates
   * them, because an editor belongs to the prose and outlives any one chapter's
   * runtime. Absent only for a page with no editors anywhere.
   */
  editors?: EditorLayer;
};

/**
 * Members are methods rather than arrow properties on purpose: under strictFunctionTypes
 * that keeps the parameters bivariant, so the player can hold these without casting.
 *
 * Surface defaults to the canvas viewport because that is what every lesson written
 * before panels existed is asking for, and the default here and the fallback in
 * panels/index.ts are the same fact — what typechecks is what runs.
 */
export type LerpetteStepRuntime<Surface = CanvasViewportSurface> = {
  /** Which kind of right panel this step draws into. Absent means the canvas viewport. */
  panel?: LerpettePanelKind<Surface>;
  mount(ctx: LerpetteRuntimeContext<Surface>): Promise<void> | void;
  enter?(ctx: LerpetteRuntimeContext<Surface>): Promise<void> | void;
  exit?(ctx: LerpetteRuntimeContext<Surface>): Promise<void> | void;
  resize?(ctx: LerpetteRuntimeContext<Surface>): void;
  dispose?(ctx: LerpetteRuntimeContext<Surface>): void;
};

/**
 * Something wrong with an authored document, found while parsing it. Problems are
 * collected rather than thrown: the lerpette is still published, and this is what
 * its page shows instead of the site failing to build.
 */
export type LerpetteProblem = {
  /** Path of the document or directory at fault, relative to lerpettes/content/. */
  where: string;
  /** What is wrong, and what it costs the reader. */
  message: string;
  /** What to write to fix it. */
  fix?: string;
};

export type LerpetteStep = {
  id: string;
  title: string;
  bodyHtml: string;
  runtimeImportKey: string;
  assetBasePath: string;
  /** Path of the chapter's code directory, relative to lerpettes/content. */
  codePath: string;
  hasOwnRuntime: boolean;
  /** Panel names this chapter shows, in tab order. Resolved from the headings. */
  panels: string[];
};

export type LerpetteMixtape = {
  slug: string;
  href: string;
  title: string;
  summary: string;
  publishedOn: string;
  author: string;
  introHtml: string;
  /** Anchor of the opening section, chapter 00. `intro` unless the title names one. */
  introId: string;
  /** Panels the title declares, which every chapter inherits. */
  introPanels: string[];
  steps: LerpetteStep[];
  problems: LerpetteProblem[];
  collectionSlug?: string;
  collectionTitle?: string;
  /** Which generated card style this lerpette draws. Derived, never authored:
   *  assigned across the whole library so two collections do not share one. */
  cardStyle?: string;
};

export type LerpetteCollection = {
  slug: string;
  href: string;
  title: string;
  summary: string;
  bodyHtml: string;
  mixtapes: LerpetteMixtape[];
  problems: LerpetteProblem[];
};

export type LerpetteAssetEntry = {
  urlPath: string;
  filePath: string;
  contentType: string;
};

export type LerpetteLibrary = {
  landing: LerpetteMixtape;
  collections: LerpetteCollection[];
  mixtapes: LerpetteMixtape[];
  assetEntries: LerpetteAssetEntry[];
  /** Problems with the tree itself, as opposed to with one document in it. */
  problems: LerpetteProblem[];
};
