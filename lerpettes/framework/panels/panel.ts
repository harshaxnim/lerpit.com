import type { LerpetteCtx, ViewSize } from './contract';
import type { LerpettePanelSlot } from './types';

/**
 * One kind of panel: what it is called, what it builds, and what it asks a chapter for.
 *
 * This is the whole extension point. Adding a panel is one folder holding one of these
 * plus whatever it draws with. Nothing outside the registry learns its name: the
 * document names it, the registry loads it, and the runtime talks to it only through
 * the members below.
 *
 * `name` is load-bearing twice over. It is what an author writes in a heading, and it
 * is the export a chapter's view code lives under, so `viewport2d` in `{#id +viewport2d}`
 * and `export const viewport2d = { ... }` are the same word by construction rather than
 * by a mapping someone has to maintain.
 */
export type LerpettePanel<Target = unknown> = {
  /** The word an author writes, and the namespace a chapter exports its view under. */
  name: string;
  /** The corner label and the drawer toggle both read this. */
  label: string;
  /** Modifier class the player puts on the panel's box for its lifetime. */
  hostClass: string;
  /**
   * Whether the stage caption shows while this panel is the open tab. The caption is a
   * band laid over the top of the panel, which suits a drawing and covers the first
   * lines of a panel that is itself text. Left out, it shows.
   */
  showsCaption?: boolean;

  /**
   * How often this panel wants drawing.
   *
   * `frame` is for anything animated. `change` is for panels whose output is text or
   * markup, where redrawing sixty times a second destroys selection and thrashes
   * layout for no gain; those redraw when the state advanced or the box resized.
   */
  cadence: 'frame' | 'change';

  /**
   * Names a chapter may export under this panel's namespace, for reporting. `required`
   * missing is an authoring error worth telling someone about; anything not listed at
   * all is a typo worth catching.
   */
  members: {
    required: readonly string[];
    optional: readonly string[];
  };

  /** Build the panel inside its box and return what a chapter's view is handed. */
  create(slot: LerpettePanelSlot, size: ViewSize): Target | Promise<Target>;
  /** Start of a frame. Clear here, if clearing is a thing this panel does. */
  begin?(target: Target, size: ViewSize): void;
  /** End of a frame. Present here, if presenting is a thing this panel does. */
  end?(target: Target, size: ViewSize): void;
  /** The box changed size. */
  resize?(target: Target, size: ViewSize): void;
  /** Where the pointer is in this panel's own coordinates, for `ctx.input`. */
  locate?(target: Target, clientX: number, clientY: number): { x: number; y: number };
  /** Release what removing the DOM will not: GL contexts, observers, timers. */
  destroy?(target: Target, slot: LerpettePanelSlot): void;
};

/** What the runtime hands a panel each time it draws. Re-exported for panel authors. */
export type { LerpetteCtx, ViewSize };
