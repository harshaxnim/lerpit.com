import type { LerpetteRuntimeContext, LerpetteStepRuntime } from '../types';

type SketchConfig = {
  status: string;
  draw: (ctx: CanvasRenderingContext2D, frame: number, width: number, height: number) => void;
};

export function createCanvasSketchRuntime(config: SketchConfig): LerpetteStepRuntime {
  let context2d: CanvasRenderingContext2D | null = null;
  let frame = 0;
  let rafId = 0;
  let mounted = false;
  let active = false;

  const render = (ctx: LerpetteRuntimeContext) => {
    if (!context2d) {
      return;
    }

    const width = ctx.host.clientWidth;
    const height = Math.max(ctx.host.clientHeight, 320);

    ctx.canvas.width = Math.floor(width * Math.min(window.devicePixelRatio || 1, 2));
    ctx.canvas.height = Math.floor(height * Math.min(window.devicePixelRatio || 1, 2));
    ctx.canvas.style.width = `${width}px`;
    ctx.canvas.style.height = `${height}px`;

    context2d.setTransform(1, 0, 0, 1, 0, 0);
    context2d.scale(ctx.canvas.width / width, ctx.canvas.height / height);
    context2d.clearRect(0, 0, width, height);
    config.draw(context2d, frame, width, height);
  };

  const tick = (ctx: LerpetteRuntimeContext) => {
    frame += 1;
    render(ctx);

    if (active) {
      rafId = window.requestAnimationFrame(() => tick(ctx));
    }
  };

  const stop = () => {
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  return {
    mount(ctx) {
      if (!mounted) {
        context2d = ctx.canvas.getContext('2d');
        if (!context2d) {
          throw new Error('2D canvas context could not be created.');
        }

        mounted = true;
      }

      render(ctx);
    },
    enter(ctx) {
      ctx.setCaption(config.status);
      active = true;
      stop();
      tick(ctx);
    },
    exit() {
      active = false;
      stop();
    },
    resize(ctx) {
      render(ctx);
    },
    dispose() {
      active = false;
      stop();
    }
  };
}
