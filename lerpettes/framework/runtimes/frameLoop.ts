import type { LerpetteRuntimeContext } from '../types';

/**
 * One frame loop, for every kind of scene.
 *
 * Four of these had grown: two in framework/runtimes and two more inside lessons.
 * They were not merely duplicated, they disagreed. Each had got one cross-cutting
 * decision right and the rest wrong:
 *
 *   - the 2D sketch runtime capped the pixel ratio at 2; the others did not, so the
 *     same canvas allocated nine times the pixels on a 3x phone instead of four
 *   - only the spring sketch clamped the frame delta, so everywhere else a tab left
 *     in the background integrated one enormous step on return
 *   - only issue zero stopped drawing when the document was hidden
 *   - three different ways to notice the canvas had been replaced: a closure check,
 *     a WeakMap keyed by element, and the panel's shared map
 *
 * Each of those is one decision, so each lives here once.
 *
 * What differs between a 2D sketch and a WebGL scene is not the loop; it is what the
 * loop is driving. That goes in a scene kind, which is the same shape as the panel
 * kind a step already names, one level further in: the panel says what fills the
 * right column, the scene says what a runtime draws into.
 */

/** The canvas as it stands this frame, in layout pixels plus the backing-store scale. */
export type FrameSize = {
  width: number;
  height: number;
  dpr: number;
};

/**
 * Backing store beyond twice the layout size buys nothing anyone can see, and on a
 * 3x phone it triples the memory a panel holds and the pixels it fills each frame.
 */
export const MAX_PIXEL_RATIO = 2;

/**
 * A frame longer than this is not a slow frame, it is a gap: a backgrounded tab, a
 * blocked main thread, a breakpoint. Integrating across it in one step throws any
 * simulation somewhere absurd, so the loop reports the cap instead and the scene
 * advances a little less than real time rather than exploding.
 */
export const MAX_FRAME_SECONDS = 1 / 30;

export function measure(width: number, height: number, rawRatio: number): FrameSize {
  return {
    width: Math.max(0, width),
    height: Math.max(0, height),
    dpr: Math.min(Math.max(rawRatio || 1, 1), MAX_PIXEL_RATIO)
  };
}

export function clampDelta(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return 0;
  }

  return Math.min(elapsedMs / 1000, MAX_FRAME_SECONDS);
}

/** Whether a size is worth drawing into at all. A collapsed panel is neither. */
export function isDrawable(size: FrameSize): boolean {
  return size.width > 0 && size.height > 0;
}

/**
 * What a runtime draws into, and how it is prepared and finished each frame.
 *
 * Members are methods rather than arrow properties for the same reason the panel kind
 * does it: under strictFunctionTypes that keeps the parameters bivariant, so the
 * driver can hold a kind whose Target it does not know.
 */
export type LerpetteSceneKind<Target> = {
  /** Build the draw target for this canvas. Called again when the canvas changes. */
  acquire(canvas: HTMLCanvasElement, size: FrameSize, shared: Map<string, unknown>): Target;
  /** Start of frame. A 2D context clears here; a WebGL scene does nothing. */
  begin?(target: Target, size: FrameSize): void;
  /** End of frame. A WebGL scene renders here; a 2D context has already drawn. */
  end?(target: Target, size: FrameSize): void;
  /** The panel box changed size. The backing store has already been set. */
  resize?(target: Target, size: FrameSize): void;
  /** Release what dropping the canvas will not: GL contexts, observers. */
  release?(target: Target, shared: Map<string, unknown>): void;
};

export type FrameLoop<Target> = {
  /** Size the canvas and draw one frame, without starting the loop. */
  sync(ctx: LerpetteRuntimeContext): void;
  start(ctx: LerpetteRuntimeContext): void;
  stop(): void;
  /** Stop, and hand the target back to the scene kind. */
  release(ctx: LerpetteRuntimeContext): void;
  /** The current target, or null before the first frame. For runtimes that need it. */
  current(): Target | null;
};

export function createFrameLoop<Target>(
  kind: LerpetteSceneKind<Target>,
  onFrame: (target: Target, dt: number, size: FrameSize) => void
): FrameLoop<Target> {
  let target: Target | null = null;
  let boundCanvas: HTMLCanvasElement | null = null;
  let rafId = 0;
  let running = false;
  let lastMs = 0;

  const sizeOf = (ctx: LerpetteRuntimeContext): FrameSize =>
    measure(ctx.host.clientWidth, ctx.host.clientHeight, window.devicePixelRatio);

  /**
   * A runtime outlives any one canvas: leaving this lesson's panel and coming back
   * builds a new one, and a target bound to the old element draws nowhere visible.
   */
  const ensure = (ctx: LerpetteRuntimeContext, size: FrameSize): Target => {
    const canvas = ctx.surface.canvas;
    if (target !== null && boundCanvas === canvas) {
      return target;
    }

    if (target !== null) {
      kind.release?.(target, ctx.shared);
    }

    target = kind.acquire(canvas, size, ctx.shared);
    boundCanvas = canvas;
    return target;
  };

  const applySize = (ctx: LerpetteRuntimeContext, size: FrameSize) => {
    const canvas = ctx.surface.canvas;
    const backingWidth = Math.floor(size.width * size.dpr);
    const backingHeight = Math.floor(size.height * size.dpr);

    // Assigning width or height clears the canvas even when the value is unchanged,
    // so both are guarded rather than set every frame.
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
    }

    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
  };

  const draw = (ctx: LerpetteRuntimeContext, dt: number) => {
    const size = sizeOf(ctx);
    if (!isDrawable(size)) {
      return;
    }

    const before = ctx.surface.canvas.width;
    const scene = ensure(ctx, size);
    applySize(ctx, size);

    if (ctx.surface.canvas.width !== before) {
      kind.resize?.(scene, size);
    }

    kind.begin?.(scene, size);
    onFrame(scene, dt, size);
    kind.end?.(scene, size);
  };

  const tick = (ctx: LerpetteRuntimeContext) => (nowMs: number) => {
    if (!running) {
      return;
    }

    // Hidden tabs throttle rAF to a crawl rather than stopping it, which burns battery
    // drawing what nobody is looking at. The clock is reset so returning does not
    // arrive with a delta the size of however long the reader was away.
    if (document.hidden) {
      lastMs = 0;
      rafId = window.requestAnimationFrame(tick(ctx));
      return;
    }

    const dt = lastMs ? clampDelta(nowMs - lastMs) : 0;
    lastMs = nowMs;
    draw(ctx, dt);
    rafId = window.requestAnimationFrame(tick(ctx));
  };

  const stop = () => {
    running = false;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  return {
    sync(ctx) {
      draw(ctx, 0);
    },

    start(ctx) {
      stop();
      running = true;
      lastMs = 0;
      rafId = window.requestAnimationFrame(tick(ctx));
    },

    stop,

    release(ctx) {
      stop();
      if (target !== null) {
        kind.release?.(target, ctx.shared);
        target = null;
        boundCanvas = null;
      }
    },

    current: () => target
  };
}
