import * as THREE from 'three';
import type { LerpettePanel } from '../panel';
import type { ViewSize } from '../contract';
import type { LerpettePanelSlot } from '../types';
import { createSketch2D, type Sketch2D } from './sketch2d';

/**
 * A flat drawing surface, rendered by three.js through an orthographic camera.
 *
 * Both viewports are the same engine on purpose: one set of ideas about colour,
 * coordinates and materials across the whole site, and a chapter that grows a third
 * dimension keeps everything it already knew. What a reader touches is not three.js
 * though, it is the sketch face in sketch2d.ts, which turns a retained scene back into
 * immediate calls so that drawing a line is drawing a line.
 *
 * The camera is y-up and the sketch maps into it, rather than the camera being flipped
 * to match screen coordinates. A y-flipped orthographic frustum has a negative
 * determinant, which reverses winding order, which makes front-face culling quietly eat
 * everything in the scene with no error anywhere.
 */

export type Viewport2dTarget = Sketch2D;

type Bundle = {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  sketch: ReturnType<typeof createSketch2D>;
};

const bundles = new WeakMap<Sketch2D, Bundle>();

export const viewport2dPanel: LerpettePanel<Viewport2dTarget> = {
  name: 'viewport2d',
  label: 'Viewport',
  hostClass: 'lerpette-panel--canvas',
  cadence: 'frame',
  members: { required: ['draw'], optional: ['build'] },

  create(slot: LerpettePanelSlot, size: ViewSize): Viewport2dTarget {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', `Live drawing for ${slot.lessonTitle}`);
    slot.host.append(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(size.dpr);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, Math.max(size.width, 1), Math.max(size.height, 1), 0, -1, 1);

    const sketch = createSketch2D(scene, slot.setCaption);
    bundles.set(sketch.api, { canvas, renderer, scene, camera, sketch });
    return sketch.api;
  },

  begin(target, size) {
    const bundle = bundles.get(target);
    if (!bundle) {
      return;
    }

    bundle.sketch.begin(size.width, size.height);
  },

  end(target) {
    const bundle = bundles.get(target);
    if (!bundle) {
      return;
    }

    bundle.sketch.end();
    bundle.renderer.render(bundle.scene, bundle.camera);
  },

  resize(target, size) {
    const bundle = bundles.get(target);
    if (!bundle) {
      return;
    }

    bundle.renderer.setPixelRatio(size.dpr);
    // `false` because the driver already wrote the element's CSS size; letting three
    // write it too is how the two end up disagreeing about what a pixel is.
    bundle.renderer.setSize(size.width, size.height, false);

    bundle.camera.right = Math.max(size.width, 1);
    bundle.camera.top = Math.max(size.height, 1);
    bundle.camera.updateProjectionMatrix();
  },

  locate(target, clientX, clientY) {
    const bundle = bundles.get(target);
    if (!bundle) {
      return { x: 0, y: 0 };
    }

    const box = bundle.canvas.getBoundingClientRect();
    return { x: clientX - box.left, y: clientY - box.top };
  },

  destroy(target) {
    const bundle = bundles.get(target);
    if (!bundle) {
      return;
    }

    bundle.sketch.dispose();
    // A browser hands out only a handful of live WebGL contexts, and a reader moving
    // between chapters builds a panel each time, so this has to be given back.
    bundle.renderer.dispose();
    bundle.renderer.forceContextLoss();
    bundles.delete(target);
  }
};
