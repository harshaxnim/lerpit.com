/**
 * What a chapter implements, and what it is handed when it runs.
 *
 * A chapter is one model and any number of views. The model owns the state and is the
 * only thing that changes it; a view is handed the state and shows it. The model's
 * exports are bare because there is exactly one of each. A view's exports live under
 * the name of the panel they feed, because a chapter can have several and each belongs
 * to one panel:
 *
 *   export const state = { value: 1 };                  // the model
 *   export function step(s, dt, ctx) { }                // the model
 *   export const viewport2d = { draw(g, s, ctx) { } };  // a view
 *   export const table = { draw(out, s, ctx) { } };     // another view
 *
 * The namespace is what lets every panel call its render function `draw`. Two panels
 * in one chapter can each have one and they cannot collide, so a reader learns one
 * verb rather than one per panel.
 */

/** A compiled C++ module's exports. Plain functions and numbers; no Embind classes. */
export type WasmExports = Record<string, unknown>;

/** Where the pointer is, in the coordinates of the panel being drawn. */
export type PointerState = {
  x: number;
  y: number;
  /** Whether a button is held. */
  down: boolean;
  /** Whether the pointer is over this panel at all. */
  inside: boolean;
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
 * and `draw` never rewrites a signature. Read it; nothing here is yours to change.
 */
export type LerpetteCtx = {
  /** The compiled C++ exports, or null when this chapter has no .cpp in it. */
  wasm: WasmExports | null;
  /**
   * The size of the panel being drawn. During `step`, which belongs to no panel, it is
   * the size of the chapter's first panel.
   */
  view: ViewSize;
  /** Pointer state for the panel being drawn, all zero on a panel nobody is over. */
  input: PointerState;
  /** Seconds since this build started running. Reset by every run. */
  time: number;
};

/** The state a chapter carries. Whatever the author puts in it. */
export type SceneState = Record<string, unknown>;

/** The model half: the two names a chapter may export bare. */
export type ModelExports = {
  state?: SceneState;
  setup?: (state: SceneState, ctx: LerpetteCtx) => void;
  step?: (state: SceneState, dt: number, ctx: LerpetteCtx) => void;
};

/**
 * The view half: what a chapter exports under one panel's name.
 *
 * `draw` is the one every panel has. `build` is for panels that hold a scene between
 * frames rather than repainting it, and runs once per build before the first draw.
 */
export type ViewExports<Target> = {
  build?: (target: Target, ctx: LerpetteCtx) => void;
  draw?: (target: Target, state: SceneState, ctx: LerpetteCtx) => void;
};
