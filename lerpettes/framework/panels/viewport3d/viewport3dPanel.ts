import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { LerpettePanel, PanelScope } from '../panel';
import type { ViewSize } from '../contract';
import type { LerpettePanelSlot } from '../types';
import { colors as theme } from '../../theme';
import {
  addLights,
  createThreeBundle,
  disposeTree,
  fitCamera,
  orthoFitCamera,
  perspectiveCamera,
  type ThreeBundle
} from '../../three/bundle';

/**
 * A lit 3D scene the reader can orbit.
 *
 * This is the one panel whose view has two halves, and the reason is honest rather
 * than incidental: a scene graph is built once and then moved, so creating meshes and
 * positioning them are different jobs happening at different rates. `build` runs once
 * per run, `draw` runs every frame, and a chapter that tried to do both in `draw`
 * would allocate a mesh sixty times a second.
 *
 * Every chapter gets its own scene, camera and orbit controls on the panel's one GL
 * context (see `scope`), so two 3D chapters in a row never see each other's meshes and
 * each keeps the camera the reader left it at.
 */

export type Viewport3dTarget = {
  scene: THREE.Scene;
  /** Perspective unless `orthographic()` was asked for. */
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  /** Orbit, pan and zoom. Already wired; a chapter rarely touches it. */
  controls: OrbitControls;
  /** The lights the scene starts with. Empty it to light the scene yourself. */
  lights: THREE.Group;
  /** Swap the default studio lights for even, flat light. */
  flatLight(): void;
  /**
   * Switch to an orthographic camera that keeps `halfWidth` either side of the origin
   * and `halfHeight` above and below in view whatever the panel's shape. Orbiting is
   * turned off; a diagram is looked at straight on.
   */
  orthographic(halfWidth: number, halfHeight: number): void;
  /**
   * The x, y and z axes from the origin, `size` long, in red, green and blue. Call it
   * once, in `build`; calling it again replaces them, and `axes(0)` removes them.
   */
  axes(size?: number): void;
  /** The band at the foot of the stage. The last value set stands. */
  caption(value: string): void;
};

type Shared = {
  bundle: ThreeBundle;
  /** The scope on screen, which is what end() renders. */
  current: Viewport3dTarget | null;
  /** The panel's own target, for a chapter that asks for no scope. */
  root: Viewport3dTarget;
  size: ViewSize;
  slot: LerpettePanelSlot;
};

const shared = new WeakMap<Viewport3dTarget, Shared>();

function makeTarget(state: Shared, size: ViewSize): Viewport3dTarget {
  const scene = new THREE.Scene();
  const lights = new THREE.Group();
  lights.name = 'lights';
  addLights(lights, 'studio');
  scene.add(lights);

  const camera = perspectiveCamera(size, { position: [0, 2, 7] });
  const controls = new OrbitControls(camera, state.bundle.canvas);
  controls.enableDamping = true;

  let caption = '';
  let axes: THREE.AxesHelper | null = null;
  const target: Viewport3dTarget = {
    scene,
    camera,
    controls,
    lights,
    flatLight() {
      disposeTree(lights);
      lights.clear();
      addLights(lights, 'flat');
    },
    orthographic(halfWidth, halfHeight) {
      target.controls.dispose();
      target.camera = orthoFitCamera(halfWidth, halfHeight);
      target.controls = new OrbitControls(target.camera, state.bundle.canvas);
      target.controls.enabled = false;
      fitCamera(target.camera, state.size);
    },
    axes(size = 1) {
      if (axes) {
        scene.remove(axes);
        axes.dispose();
        axes = null;
      }
      if (size <= 0) return;
      axes = new THREE.AxesHelper(size);
      axes.setColors(new THREE.Color(theme.red), new THREE.Color(theme.green), new THREE.Color(theme.blue));
      scene.add(axes);
    },
    caption(value) {
      // Only when it changed: this runs inside a frame, and rewriting the same text
      // sixty times a second drops the reader's selection every time.
      if (value === caption) return;
      caption = value;
      state.slot.setCaption(value);
    }
  };
  shared.set(target, state);
  return target;
}

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

    const state = { bundle: createThreeBundle(canvas, size), current: null, size, slot } as unknown as Shared;
    state.root = makeTarget(state, size);
    state.current = state.root;
    return state.root;
  },

  scope(root): PanelScope<Viewport3dTarget> {
    const state = shared.get(root)!;
    const target = makeTarget(state, state.size);
    target.controls.enabled = false;

    const empty = () => {
      // Everything the chapter added; the lights stay, as the scene started with them.
      for (const child of [...target.scene.children]) {
        if (child === target.lights) continue;
        target.scene.remove(child);
        disposeTree(child);
      }
    };

    return {
      target,
      focus() {
        state.current = target;
        target.controls.enabled = !(target.camera instanceof THREE.OrthographicCamera);
        fitCamera(target.camera, state.size);
      },
      blur() {
        target.controls.enabled = false;
        if (state.current === target) state.current = state.root;
      },
      clear: empty,
      release() {
        empty();
        disposeTree(target.lights);
        target.controls.dispose();
        if (state.current === target) state.current = state.root;
        shared.delete(target);
      }
    };
  },

  end(target) {
    const state = shared.get(target);
    const current = state?.current;
    if (!state || !current) return;
    // Damping only advances when it is asked to, so this is what makes a flick of the
    // mouse coast to a stop rather than stopping dead.
    if (current.controls.enabled) current.controls.update();
    state.bundle.render(current.scene, current.camera);
  },

  resize(target, size) {
    const state = shared.get(target);
    if (!state) return;
    state.size = size;
    state.bundle.resize(size);
    if (state.current) fitCamera(state.current.camera, size);
  },

  locate(target, clientX, clientY) {
    const box = shared.get(target)?.bundle.canvas.getBoundingClientRect();
    return box ? { x: clientX - box.left, y: clientY - box.top } : { x: 0, y: 0 };
  },

  destroy(target) {
    const state = shared.get(target);
    if (!state) return;
    disposeTree(state.root.scene);
    state.root.controls.dispose();
    state.bundle.dispose();
    shared.delete(target);
  }
};
