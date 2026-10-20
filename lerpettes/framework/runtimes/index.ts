/**
 * The runtime helpers a lesson imports.
 *
 * Most chapters need none of these: `createStage` (framework/chapter.ts) and the
 * panels a heading names cover them. These are presets for the shapes that recur, each
 * a chapter definition underneath, so they share one clock, one stage and one lifecycle.
 *
 * Nothing here reaches three.js. A 2D chapter that imported this barrel would
 * otherwise ship the whole WebGL renderer because one sibling export mentions it. The
 * 3D preset is imported by its own path:
 *
 *   import { create3DRuntime } from '@lerpit/framework/runtimes/create3DRuntime';
 */
export { createCanvasSketchRuntime } from './createCanvasSketchRuntime';
export { createChapterRuntime } from './createChapterRuntime';

// For a hand-written runtime that drives its own canvas.
export { createFrameLoop, measure, clampDelta, isDrawable, MAX_PIXEL_RATIO, MAX_FRAME_SECONDS } from './frameLoop';
export type { FrameLoop, FrameSize, LerpetteSceneKind } from './frameLoop';
export { canvas2dScene } from './canvas2dScene';

export type { LerpetteRuntimeContext, LerpetteStepRuntime } from '../types';
