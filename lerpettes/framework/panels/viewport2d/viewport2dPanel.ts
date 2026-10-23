import * as THREE from 'three';
import type { LerpettePanel, PanelScope } from '../panel';
import type { ViewSize } from '../contract';
import type { LerpettePanelSlot } from '../types';
import { createThreeBundle, disposeTree, type ThreeBundle } from '../../three/bundle';
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
 *
 * Every chapter gets its own scene and sketch on the panel's one GL context (see
 * `scope`), so what a chapter adds to `sketch.scene` (a textured mesh, say) never shows
 * through in the next chapter on the same panels.
 */

export type Viewport2dTarget = Sketch2D;

/** The canvas and its GL context, shared by every chapter's scope on this panel. */
type Surface = {
  canvas: HTMLCanvasElement;
  three: ThreeBundle;
  camera: THREE.OrthographicCamera;
  slot: LerpettePanelSlot;
  /** The canvas shows nothing: the last frame rendered drew nothing. */
  blank: boolean;
};

type Bundle = {
  surface: Surface;
  scene: THREE.Scene;
  sketch: ReturnType<typeof createSketch2D>;
};

const bundles = new WeakMap<Sketch2D, Bundle>();

function makeBundle(surface: Surface): Bundle {
  const scene = new THREE.Scene();
  const sketch = createSketch2D(scene, surface.slot.setCaption);
  const bundle = { surface, scene, sketch };
  bundles.set(sketch.api, bundle);
  return bundle;
}

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

    const surface: Surface = {
      canvas,
      three: createThreeBundle(canvas, size),
      camera: new THREE.OrthographicCamera(0, Math.max(size.width, 1), Math.max(size.height, 1), 0, -1, 1),
      slot,
      blank: false
    };
    return makeBundle(surface).sketch.api;
  },

  scope(root): PanelScope<Viewport2dTarget> {
    const bundle = makeBundle(bundles.get(root)!.surface);
    // What the sketch put in the scene itself; anything else is the chapter's.
    const own = new Set(bundle.scene.children);

    const empty = () => {
      for (const child of [...bundle.scene.children]) {
        if (own.has(child)) continue;
        bundle.scene.remove(child);
        disposeTree(child);
      }
    };

    return {
      target: bundle.sketch.api,
      focus() {
        // The canvas still shows the last chapter's frame, so this one's first frame is
        // rendered even if it draws nothing.
        bundle.surface.blank = false;
      },
      blur() {},
      clear: empty,
      release() {
        empty();
        bundle.sketch.dispose();
        bundles.delete(bundle.sketch.api);
      }
    };
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

    // A frame that drew nothing after one that drew nothing changes no pixel. Rendering
    // it anyway still hands the compositor a new canvas frame sixty times a second, so a
    // chapter that has not drawn yet costs real CPU. A chapter that adds its own objects
    // to the scene is never skipped: what it draws is not visible from here.
    const { surface } = bundle;
    const drew = bundle.sketch.end();
    const ownObjectsOnly = bundle.scene.children.length === bundle.sketch.objectCount();
    if (!drew && surface.blank && ownObjectsOnly) {
      return;
    }

    surface.blank = !drew && ownObjectsOnly;
    surface.three.render(bundle.scene, surface.camera);
  },

  resize(target, size) {
    const bundle = bundles.get(target);
    if (!bundle) {
      return;
    }

    const { surface } = bundle;
    surface.three.resize(size);

    surface.camera.right = Math.max(size.width, 1);
    surface.camera.top = Math.max(size.height, 1);
    surface.camera.updateProjectionMatrix();
  },

  locate(target, clientX, clientY) {
    const bundle = bundles.get(target);
    if (!bundle) {
      return { x: 0, y: 0 };
    }

    const box = bundle.surface.canvas.getBoundingClientRect();
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
    bundle.surface.three.dispose();
    bundles.delete(target);
  }
};
