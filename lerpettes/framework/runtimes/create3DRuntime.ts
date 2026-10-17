import type * as THREE from 'three';
import type { Pane } from 'tweakpane';
import type { Readings } from '../monitors/readings';
import type { LerpetteCtx } from '../panels/contract';
import type { Viewport3dTarget } from '../panels/viewport3d/viewport3dPanel';
import type { ControlsOptions } from '../stage/chrome';
import type { LerpetteStepRuntime } from '../types';
import { createChapterRuntime } from './createChapterRuntime';

/**
 * A three.js scene set up by one function. A preset on the chapter runtime: the chapter
 * draws on the `viewport3d` panel in a scene of its own, and the stage gives it
 * controls, readings and restart like any other chapter.
 *
 * The scene starts the way this preset always has: flat even light, the camera six
 * units back on z, orbit without pan. `setup` changes any of it.
 */

export type Setup3DContext = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** The stage's controls card. Starts folded unless { expanded: true }. */
  controls: (options?: ControlsOptions) => Pane;
  /** The stage's readings card. See monitors/readings.ts. */
  monitors: () => Readings;
  /** Every frame, with the frame's `dt` and the run's time, both in seconds. */
  onFrame: (cb: (dt: number, time: number) => void) => void;
  /** When the run ends: restart, a new chapter on another stack, the page going away. */
  onTeardown: (cb: () => void) => void;
};

export type { ControlsOptions };

export type Step3DConfig = {
  caption: string;
  setup: (ctx: Setup3DContext) => Promise<void> | void;
};

type State = {
  frames: Array<(dt: number, time: number) => void>;
  teardowns: Array<() => void>;
};

export function create3DRuntime(config: Step3DConfig): LerpetteStepRuntime<any> {
  return createChapterRuntime<State>({
    panels: ['viewport3d'],
    caption: config.caption,
    restart: true,
    state: () => ({ frames: [], teardowns: [] }),

    step(s, dt, ctx) {
      for (const cb of s.frames) cb(dt, ctx.time);
    },

    dispose(s) {
      for (const cb of s.teardowns) cb();
    },

    viewport3d: {
      async build(target: Viewport3dTarget, s: State, ctx: LerpetteCtx) {
        target.flatLight();
        const camera = target.camera as THREE.PerspectiveCamera;
        camera.fov = 45;
        camera.near = 0.1;
        camera.far = 100;
        camera.position.set(0, 0, 6);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        target.controls.target.set(0, 0, 0);
        target.controls.enablePan = false;

        await config.setup({
          scene: target.scene,
          camera,
          controls: (options) => ctx.controls(options),
          monitors: () => ctx.monitors(),
          onFrame: (cb) => s.frames.push(cb),
          onTeardown: (cb) => s.teardowns.push(cb)
        });
        // OrbitControls keeps its own copy of where the camera looks; a setup that
        // moved the camera would otherwise be yanked back on the first drag.
        target.controls.update();
      }
    }
  });
}
