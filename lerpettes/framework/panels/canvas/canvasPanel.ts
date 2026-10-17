import type { LerpettePanel } from '../panel';
import type { ViewSize } from '../contract';
import type { LerpettePanelSlot } from '../types';

/**
 * A bare canvas, for a chapter that wants to draw with the 2D context it already
 * knows, or to hand the element to a library of its own.
 *
 * This was the only panel before panels had names, and every lesson written then drew
 * into it. It is an ordinary registry entry now, named `canvas`, so a heading can ask
 * for it beside any other panel and nothing about it is special to the player.
 *
 * The 2D context is acquired on first ask rather than up front, because a canvas can
 * only ever have one kind of context and a chapter that wants WebGL must get there
 * first. Asked for, it is cleared and put in layout pixels at the start of every frame,
 * so a chapter never does the device-pixel arithmetic.
 */

export type CanvasTarget = {
  canvas: HTMLCanvasElement;
  /** The 2D context: cleared and scaled to layout pixels before every draw. */
  context2d(): CanvasRenderingContext2D;
};

type Bundle = { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D | null };

const bundles = new WeakMap<CanvasTarget, Bundle>();

/**
 * Size the backing store to the box. Assigning width or height clears the canvas even
 * when the value is unchanged, so both are guarded.
 */
export function sizeCanvas(canvas: HTMLCanvasElement, size: ViewSize): boolean {
  const width = Math.floor(size.width * size.dpr);
  const height = Math.floor(size.height * size.dpr);
  if (canvas.width === width && canvas.height === height) return false;
  canvas.width = width;
  canvas.height = height;
  return true;
}

export const canvasPanel: LerpettePanel<CanvasTarget> = {
  name: 'canvas',
  label: 'Viewport',
  hostClass: 'lerpette-panel--canvas',
  cadence: 'frame',
  members: { required: ['draw'], optional: ['build'] },

  create(slot: LerpettePanelSlot, size: ViewSize): CanvasTarget {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', `Live render for ${slot.lessonTitle}`);
    slot.host.append(canvas);
    sizeCanvas(canvas, size);

    const bundle: Bundle = { canvas, context: null };
    const target: CanvasTarget = {
      canvas,
      context2d() {
        if (!bundle.context) {
          const context = canvas.getContext('2d');
          if (!context) throw new Error('This browser would not give the panel a 2D canvas context.');
          bundle.context = context;
        }
        return bundle.context;
      }
    };
    bundles.set(target, bundle);
    return target;
  },

  begin(target, size) {
    const context = bundles.get(target)?.context;
    if (!context) return;
    // From the ratio each frame rather than once, because the ratio changes when a
    // window moves between displays.
    context.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
  },

  resize(target, size) {
    sizeCanvas(target.canvas, size);
  },

  destroy(target) {
    // Drop the backing store now rather than waiting for the node to be collected.
    target.canvas.width = 0;
    target.canvas.height = 0;
    bundles.delete(target);
  }
};
