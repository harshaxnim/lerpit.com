import { canvasViewportPanel } from '../panels';
import type { LerpetteStepRuntime } from '../types';
import { canvas2dScene } from './canvas2dScene';
import { createFrameLoop } from './frameLoop';

type SketchConfig = {
  status: string;
  draw: (ctx: CanvasRenderingContext2D, frame: number, width: number, height: number) => void;
};

/**
 * A scene that animates on its own, with nothing to simulate and nothing for a reader
 * to edit. The loop, the pixel ratio and the clear all belong to createFrameLoop now;
 * what is left is the frame counter this signature promises its two lessons.
 */
export function createCanvasSketchRuntime(config: SketchConfig): LerpetteStepRuntime {
  let frame = 0;

  const loop = createFrameLoop(canvas2dScene, (context, _dt, size) => {
    frame += 1;
    config.draw(context, frame, size.width, size.height);
  });

  return {
    panel: canvasViewportPanel,
    mount(ctx) {
      loop.sync(ctx);
    },
    enter(ctx) {
      ctx.setCaption(config.status);
      loop.start(ctx);
    },
    exit() {
      loop.stop();
    },
    resize(ctx) {
      loop.sync(ctx);
    },
    dispose(ctx) {
      loop.release(ctx);
    }
  };
}
