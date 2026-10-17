import type { CanvasTarget } from '../panels/canvas/canvasPanel';
import type { LerpetteStepRuntime } from '../types';
import { createChapterRuntime } from './createChapterRuntime';

type SketchConfig = {
  /** The caption under the drawing. */
  status: string;
  /** Paint one frame. `frame` counts up from 1; the canvas is cleared before every call. */
  draw: (ctx: CanvasRenderingContext2D, frame: number, width: number, height: number) => void;
};

/**
 * A drawing that animates on its own, with nothing to simulate and nothing for a
 * reader to edit. A preset, not a runtime of its own: a chapter on the `canvas` panel
 * whose state is a frame counter, so it gets the same clock, stage and lifecycle as
 * everything else.
 */
export function createCanvasSketchRuntime(config: SketchConfig): LerpetteStepRuntime<any> {
  return createChapterRuntime<{ frame: number }>({
    panels: ['canvas'],
    caption: config.status,
    restart: false,
    state: () => ({ frame: 0 }),
    canvas: {
      draw(target: CanvasTarget, s: { frame: number }, ctx: { view: { width: number; height: number } }) {
        s.frame += 1;
        config.draw(target.context2d(), s.frame, ctx.view.width, ctx.view.height);
      }
    }
  });
}
