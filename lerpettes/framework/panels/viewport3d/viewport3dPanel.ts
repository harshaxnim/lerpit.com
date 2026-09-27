import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { LerpettePanel } from '../panel';
import type { ViewSize } from '../contract';
import type { LerpettePanelSlot } from '../types';

/**
 * A lit 3D scene the reader can orbit.
 *
 * This is the one panel whose contract has two halves, and the reason is honest rather
 * than incidental: a scene graph is built once and then moved, so creating meshes and
 * positioning them are different jobs happening at different rates. `build` runs once
 * per build, `draw` runs every frame, and a chapter that tried to do both in `draw`
 * would allocate a mesh sixty times a second.
 *
 * The 2D panel hides this distinction behind a pool because a flat sketch has no
 * persistent objects worth naming. Here the objects are the subject, so they stay.
 */

export type Viewport3dTarget = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Orbit, pan and zoom. Already wired; a chapter rarely touches it. */
  controls: OrbitControls;
  /**
   * The band under the tabs, for a sentence about what the scene is showing. The same
   * call as the 2D panel's, so moving a chapter between them does not rewrite it.
   * The last value set stands; it is not cleared between frames.
   */
  caption(value: string): void;
};

type Bundle = Viewport3dTarget & {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
};

const bundles = new WeakMap<Viewport3dTarget, Bundle>();

export const viewport3dPanel: LerpettePanel<Viewport3dTarget> = {
  name: 'viewport3d',
  label: 'Viewport 3D',
  hostClass: 'lerpette-panel--canvas',
  cadence: 'frame',
  members: { required: ['draw'], optional: ['build'] },

  create(slot: LerpettePanelSlot, size: ViewSize): Viewport3dTarget {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', `Live 3D scene for ${slot.lessonTitle}`);
    slot.host.append(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(size.dpr);

    const scene = new THREE.Scene();
    // Enough light that a chapter which adds a plain mesh sees it, without taking the
    // decision away from one that wants to light the scene itself.
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(4, 6, 5);
    scene.add(key);

    const camera = new THREE.PerspectiveCamera(45, Math.max(size.width, 1) / Math.max(size.height, 1), 0.1, 200);
    camera.position.set(0, 2, 7);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;

    let caption = '';
    const target: Viewport3dTarget = {
      scene,
      camera,
      controls,
      caption(value) {
        // Only when it changed: this runs inside a frame, and rewriting the same text
        // sixty times a second drops the reader's selection every time.
        if (value === caption) {
          return;
        }

        caption = value;
        slot.setCaption(value);
      }
    };
    bundles.set(target, { ...target, canvas, renderer });
    return target;
  },

  end(target) {
    const bundle = bundles.get(target);
    if (!bundle) {
      return;
    }

    // Damping only advances when it is asked to, so this is what makes a flick of the
    // mouse coast to a stop rather than stopping dead.
    bundle.controls.update();
    bundle.renderer.render(bundle.scene, bundle.camera);
  },

  resize(target, size) {
    const bundle = bundles.get(target);
    if (!bundle) {
      return;
    }

    bundle.renderer.setPixelRatio(size.dpr);
    bundle.renderer.setSize(size.width, size.height, false);
    bundle.camera.aspect = Math.max(size.width, 1) / Math.max(size.height, 1);
    bundle.camera.updateProjectionMatrix();
  },

  destroy(target) {
    const bundle = bundles.get(target);
    if (!bundle) {
      return;
    }

    bundle.controls.dispose();
    bundle.renderer.dispose();
    bundle.renderer.forceContextLoss();
    bundles.delete(target);
  }
};
