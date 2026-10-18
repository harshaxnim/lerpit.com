import type { EditorLayer } from './runtimes/editorLayer';
import type { LerpettePanelSlot } from './panels/types';
import type { PanelStack } from './panels/panelStack';
import type { CanvasTarget } from './panels/canvas/canvasPanel';
import type { StageOwner } from './stage/chrome';

/**
 * What a step's runtime is handed. The slot half is lent by the player; `panels` is the
 * stack the chapter's heading (or its code) asked for, and `surface` is the first of
 * them, which is all a runtime written for one canvas needs.
 */
export type LerpetteRuntimeContext<Surface = CanvasTarget> = LerpettePanelSlot & {
  currentStepId: string;
  resolveAssetUrl: (relativePath: string) => string;
  /** The first panel's target. For a runtime that draws into one panel. */
  surface: Surface;
  /** Every panel this chapter shows, in tab order. */
  panels: PanelStack;
  /**
   * The stage's chrome for this chapter: controls and restart in the top right,
   * readings in the top left, the caption at the foot. The player shows and hides it
   * as the chapter comes and goes; a runtime only fills it.
   */
  stage: StageOwner;
  /**
   * The empty boxes a `lerpit` fence left in this step's prose, in document order.
   * Each carries the files it was written with on `dataset.lerpitCode`.
   */
  codeHosts: HTMLElement[];
  /**
   * This chapter's own directory under lerpettes/content, as `<collection>/<mixtape>/
   * code/<step-id>`. `assetBasePath` is built from this, so the two cannot disagree.
   */
  codePath: string;
  /**
   * Every code box on the page, already built. A runtime claims the ones in its own
   * section so that pressing run builds into its panels. Absent only for a page with
   * no editors anywhere.
   */
  editors?: EditorLayer;
};

/**
 * One chapter's runtime. A runtime instance serves exactly one chapter: the player
 * keeps it for the life of the page and mounts it again only after the stack it was
 * mounted on has been taken down.
 *
 * Most chapters never write one of these: `defineChapter` (framework/chapter.ts) turns
 * the chapter contract into one. Writing it by hand is for a chapter that needs the
 * whole lifecycle, and gets the same context as everything else.
 *
 * Members are methods rather than arrow properties on purpose: under strictFunctionTypes
 * that keeps the parameters bivariant, so the player can hold these without casting.
 */
export type LerpetteStepRuntime<Surface = CanvasTarget> = {
  /** Panels to show when the heading names none. Absent means `canvas`. */
  panels?: readonly string[];
  /** Built on a stack, once. Claim editors and make the first frame here. */
  mount(ctx: LerpetteRuntimeContext<Surface>): Promise<void> | void;
  /** This chapter became the one on screen. */
  enter?(ctx: LerpetteRuntimeContext<Surface>): Promise<void> | void;
  /** Another chapter did. */
  exit?(ctx: LerpetteRuntimeContext<Surface>): Promise<void> | void;
  /**
   * The reader came back to this browser tab. Not a re-entry: nothing is rebuilt, the
   * chapter carries on from where it was.
   */
  resume?(ctx: LerpetteRuntimeContext<Surface>): void;
  resize?(ctx: LerpetteRuntimeContext<Surface>): void;
  /** The stack is going away. Release everything; mount may be called again later. */
  dispose?(ctx: LerpetteRuntimeContext<Surface>): void;
};

/**
 * Something wrong with an authored document, found while parsing it. Problems are
 * collected rather than thrown: the lerpette is still published, and this is what
 * its page shows instead of the site failing to build.
 */
export type LerpetteProblem = {
  /** Which problem this is. See website/src/lib/problems.ts and docs/authoring/problems.md. */
  id: string;
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
  /** Whether this chapter has code of its own (a module, a fence, or declared panels). */
  hasOwnRuntime: boolean;
  /**
   * The chapter whose runtime is on screen while this one is active: its own id, or
   * the nearest chapter's when it has nothing of its own to show.
   */
  runtimeStepId: string;
  /** Panel names this chapter shows, in tab order. Resolved from the headings. */
  panels: string[];
  /** What control.toml's `[caption]` says for this chapter, overriding its code. */
  caption?: string;
  /** What control.toml's `[idle_status]` says the code box shows before a build. */
  idleStatus?: string;
};

/** Mirrors LerpetteStatus in website/src/lib/control.ts, which owns the meanings. */
export type LerpetteStatus = 'published' | 'unlisted' | 'draft';

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
  /** What control.toml says to do with this one. Defaults to published. */
  status: LerpetteStatus;
  /** control.toml's `landing = true`: serve this one at '/'. */
  landing?: boolean;
  /** control.toml's `order`: its place in the collection, before the newest-first rest. */
  order?: number | null;
  /** Which generated card style this lerpette draws: its collection's `card_style`, or
   *  assigned across the whole library so two collections do not share one. */
  cardStyle?: string;
};

export type LerpetteCollection = {
  slug: string;
  href: string;
  title: string;
  summary: string;
  bodyHtml: string;
  /** The collection control.toml's `card_style`, which every card in it draws. */
  cardStyle?: string;
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
  /** Each collection carries only the mixtapes that should be listed. */
  collections: LerpetteCollection[];
  /** Listed, newest first. What shelves and collection pages draw. */
  mixtapes: LerpetteMixtape[];
  /** Everything that gets a page built, listed or not. What routing reads. */
  routable: LerpetteMixtape[];
  assetEntries: LerpetteAssetEntry[];
  /** Problems with the tree itself, as opposed to with one document in it. */
  problems: LerpetteProblem[];
};
