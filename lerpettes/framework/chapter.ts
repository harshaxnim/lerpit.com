import type { ChapterDefinition, SceneState } from './panels/contract';
import { createChapterRuntime } from './runtimes/createChapterRuntime';
import type { LerpetteStepRuntime } from './types';

/**
 * A chapter, written as a module in its code folder:
 *
 *   // code/orbit/js/index.ts
 *   import { createStage } from '@lerpit/framework/chapter';
 *
 *   export default createStage({
 *     caption: 'A planet on a spring.',
 *     state: { x: 1, v: 0 },
 *     setup(s, ctx) { ctx.controls().addBinding(s, 'x'); },
 *     step(s, dt) { s.v -= s.x * dt; s.x += s.v * dt; },
 *     viewport2d: { draw(sketch, s) { sketch.circle(s.x, 0, 8) } }
 *   });
 *
 * The heading still says which panels show (`## Orbit {#orbit +viewport2d}`); `panels`
 * here is only the fallback for a heading that names none. Everything is optional, and
 * the same names written in a `lerpit` fence's files replace these when the reader
 * presses run. See docs/authoring.md.
 *
 * The chapter is the prose under a heading; this is the code behind it, which plays on
 * the stage (the panel area beside the prose). Hence createStage.
 */
export function createStage<S extends SceneState = SceneState>(definition: ChapterDefinition<S>): LerpetteStepRuntime<any> {
  return createChapterRuntime(definition);
}

export type { ChapterDefinition, LerpetteCtx, SceneState, ViewExports, ViewSize, PointerState, WasmExports } from './panels/contract';
export type { Controls, ControlOptions, ControlsOptions } from './stage/chrome';
