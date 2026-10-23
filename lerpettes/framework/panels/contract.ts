import type { Pane } from 'tweakpane';
import type { Readings } from '../readings/readings';
import type { ControlsOptions } from '../stage/chrome';
import type { CanvasTarget } from './canvas/canvasPanel';
import type { Viewport2dTarget } from './viewport2d/viewport2dPanel';
import type { Viewport3dTarget } from './viewport3d/viewport3dPanel';
import type { TableTarget } from './table/tablePanel';
import type { ReadoutTarget } from './readout/readoutPanel';

/**
 * What a chapter implements, and what it is handed when it runs.
 *
 * A chapter is one model and any number of views. The model owns the state and is the
 * only thing that changes it; a view is handed the state and shows it. The model's
 * exports are bare because there is exactly one of each. A view's exports live under
 * the name of the panel they feed, because a chapter can have several and each belongs
 * to one panel:
 *
 *   export const state = { value: 1 };                       // the model
 *   export function setup(s, ctx) { }                        // the model, once per run
 *   export function step(s, dt, ctx) { }                     // the model, every frame
 *   export const viewport2d = { draw(sketch, s, ctx) { } };  // a view
 *   export const table = { draw(out, s, ctx) { } };          // another view
 *
 * The same names work wherever the chapter's code comes from: a module in the chapter's
 * code folder (`createStage({...})` in `code/<id>/js/index.ts`), or the files a
 * `lerpit` fence puts in an editor. When both exist, what the reader builds replaces
 * what the module said, name by name.
 *
 * The namespace is what lets every panel call its render function `draw`. Two panels
 * in one chapter can each have one and they cannot collide, so a reader learns one
 * verb rather than one per panel.
 */

/** A compiled C++ module's exports. */
export type WasmExports = Record<string, unknown>;

/** Where the pointer is, in the coordinates of the panel being drawn. */
export type PointerState = {
  /** In pixels, from the panel's top left, y down: for laying out against its edges. */
  x: number;
  y: number;
  /**
   * The same point in units, as a chapter simulates and draws: the origin mid-panel, x −1
   * to 1 across, y up to `ctx.view.halfHeight`.
   */
  ux: number;
  uy: number;
  /**
   * Whether a button is held. A press on the panel holds until it is let go, even if the
   * pointer leaves the panel on the way, and `x` and `y` keep following it out there.
   */
  down: boolean;
  /** Whether the pointer is over this panel at all. */
  inside: boolean;
  /**
   * A press began since the last frame. Kept until a frame has seen it, so a click
   * shorter than a frame is never missed; check this rather than comparing `down` with
   * the last frame's.
   */
  pressed: boolean;
  /** A press ended since the last frame, by letting go or by the browser cancelling it. */
  released: boolean;
};

/** The panel's box in layout pixels, and the backing-store scale it is drawn at. */
export type ViewSize = {
  width: number;
  height: number;
  dpr: number;
};

/**
 * The last argument to every function a chapter writes, model or view alike.
 *
 * One object rather than a different tail per function, so moving code between `step`
 * and `draw` never rewrites a signature.
 */
export type LerpetteCtx = {
  /** The compiled C++ exports, or null when this chapter has none. */
  wasm: WasmExports | null;
  /**
   * The size of the panel being drawn. During `setup` and `step`, which belong to no
   * panel, it is the size of the panel on screen.
   */
  view: ViewSize & {
    /**
     * How far the view reaches in units, the sketch's `g.px`/`g.py` units: x runs
     * `-halfWidth..halfWidth`, which is always -1..1, and y `-halfHeight..halfHeight`,
     * height over width. Square (1) before the panel has a size.
     */
    halfWidth: number;
    halfHeight: number;
  };
  /** Pointer state for the panel being drawn, all zero on a panel nobody is over. */
  input: PointerState;
  /** Seconds this run has been running. Stops while the chapter is off screen. */
  time: number;
  /** The stage's controls card: a tweakpane, folded unless asked otherwise. */
  controls(options?: ControlsOptions): Pane;
  /** The stage's readings card. See readings/readings.ts. */
  readings(): Readings;
  /** The band at the foot of the stage. */
  caption(value: string): void;
};

/** The state a chapter carries. Whatever the author puts in it. */
export type SceneState = Record<string, any>;

/**
 * A view: what a chapter exports under one panel's name.
 *
 * `draw` is the one every panel has. `build` is for panels that hold a scene between
 * frames rather than repainting it, and runs once per run, after `setup`, before the
 * first draw. Each run starts from an empty scene, so `build` never has to clean up.
 */
export type ViewExports<Target = any, S = SceneState> = {
  build?: (target: Target, state: S, ctx: LerpetteCtx) => void | Promise<void>;
  draw?: (target: Target, state: S, ctx: LerpetteCtx) => void;
};

/**
 * Everything a chapter may say, whichever way it is written.
 *
 * Only the model names and view namespaces are code; the rest is configuration a
 * module source can carry and an editor build cannot (it is read before anything runs).
 */
export type ChapterDefinition<S extends SceneState = SceneState> = {
  /**
   * The panels to show when the heading names none. A heading's `+name` list always
   * wins, so the document stays the place that says what the stage shows.
   */
  panels?: readonly string[];
  /** The band under the panel. control.toml's `[caption]` overrides it. */
  caption?: string;
  /**
   * Prebuilt C++ for this chapter, as `() => import('../build/name.js')`. Loaded once,
   * instantiated once per page, and handed over as `ctx.wasm`.
   */
  wasm?: () => Promise<unknown>;
  /** Where it starts. A function for a state that must not be shared between runs. */
  state?: S | (() => S);
  /** Once per run, before the first frame. May be async (to load something). */
  setup?: (state: S, ctx: LerpetteCtx) => void | Promise<void>;
  /** Advance the state. `dt` is seconds, already clamped. */
  step?: (state: S, dt: number, ctx: LerpetteCtx) => void;
  /**
   * A press on a panel, the moment it lands, with `ctx.input` at the press. Take hold of
   * whatever is under it in the state and return true, or return false for empty space.
   * On a phone a touch that grabbed something drags it, and any other touch scrolls the
   * page, so a reader can still scroll past the stage. Without `grab`, touches always scroll.
   */
  grab?: (state: S, ctx: LerpetteCtx) => boolean;
  /** The run is ending (restart, a new build, the chapter going away). */
  dispose?: (state: S, ctx: LerpetteCtx) => void;
  /** Whether the stage offers restart. Defaults to whether the chapter has a `step`. */
  restart?: boolean;
  // The panels the registry knows, typed, so a view's arguments are typed with no
  // annotation. Type-only imports: naming a panel here loads none of its code.
  canvas?: ViewExports<CanvasTarget, S>;
  viewport2d?: ViewExports<Viewport2dTarget, S>;
  viewport3d?: ViewExports<Viewport3dTarget, S>;
  table?: ViewExports<TableTarget, S>;
  readout?: ViewExports<ReadoutTarget, S>;
} & { [panel: string]: unknown };

/** The model names, which can never be a panel's name. */
export const MODEL_NAMES = ['panels', 'caption', 'wasm', 'state', 'setup', 'step', 'grab', 'dispose', 'restart'] as const;
