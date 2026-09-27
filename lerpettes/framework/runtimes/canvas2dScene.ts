import type { FrameSize, LerpetteSceneKind } from './frameLoop';

/**
 * The 2D scene kind: a canvas context, cleared and put in layout coordinates before
 * every frame.
 *
 * Everything a 2D scene needs that a WebGL one does not is here, and it is only these
 * two lines. The transform is set from the pixel ratio each frame rather than scaled
 * once at acquire, because the ratio changes when a window moves between displays and
 * a context scaled at acquire would then draw at the wrong size until the panel was
 * rebuilt.
 */
export const canvas2dScene: LerpetteSceneKind<CanvasRenderingContext2D> = {
  acquire(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('This browser would not give the panel a 2D canvas context.');
    }

    return context;
  },

  begin(context: CanvasRenderingContext2D, size: FrameSize) {
    context.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
  }
};
