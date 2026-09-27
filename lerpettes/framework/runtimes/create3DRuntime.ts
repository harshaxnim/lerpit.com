import * as THREE from 'three';
import { Pane } from 'tweakpane';
import { canvasViewportPanel } from '@lerpit/framework/panels';
import type { LerpetteRuntimeContext, LerpetteStepRuntime } from '@lerpit/framework/types';
import { createFrameLoop } from './frameLoop';
import { threeScene, type ThreeSceneTarget } from './threeScene';

/**
 * A three.js scene, one step at a time.
 *
 * The renderer, the camera, the pixel ratio, the resize and the frame loop all belong
 * to createFrameLoop and threeScene now. What is left here is the part that is
 * genuinely about a 3D *step*: a tweakpane, a restart button, and tearing one step's
 * meshes down before the next builds its own.
 */

export type Setup3DContext = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: () => Pane;
  onFrame: (cb: (nowMs: number) => void) => void;
  onTeardown: (cb: () => void) => void;
};

export type Step3DConfig = {
  caption: string;
  setup: (ctx: Setup3DContext) => Promise<void> | void;
};

type StepState = {
  pane: Pane | null;
  paneContainer: HTMLElement | null;
  resetButton: HTMLButtonElement | null;
  frameCallbacks: Array<(nowMs: number) => void>;
  teardownCallbacks: Array<() => void>;
};

const STEP_KEY = '3d:step';

function teardownStep(ctx: LerpetteRuntimeContext, target: ThreeSceneTarget | null) {
  const prev = ctx.shared.get(STEP_KEY) as StepState | undefined;
  if (!prev) {
    return;
  }

  for (const cb of prev.teardownCallbacks) {
    cb();
  }

  prev.pane?.dispose();
  prev.paneContainer?.remove();
  prev.resetButton?.remove();

  if (target) {
    const toRemove: THREE.Object3D[] = [];
    target.scene.traverse((obj: THREE.Object3D) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        toRemove.push(obj);
      }
    });

    for (const obj of toRemove) {
      target.scene.remove(obj);
      (obj as THREE.Mesh).geometry.dispose();
      ((obj as THREE.Mesh).material as THREE.Material).dispose();
    }
  }

  ctx.shared.delete(STEP_KEY);
}

export function create3DRuntime(config: Step3DConfig): LerpetteStepRuntime {
  let current: StepState | null = null;

  const loop = createFrameLoop(threeScene, () => {
    if (!current) {
      return;
    }

    // An absolute timestamp, because that is what the physics lessons advance their
    // world with and what this signature has always promised them.
    const nowMs = performance.now();
    for (const cb of current.frameCallbacks) {
      cb(nowMs);
    }
  });

  async function setupStep(ctx: LerpetteRuntimeContext, target: ThreeSceneTarget) {
    const state: StepState = {
      pane: null,
      paneContainer: null,
      resetButton: null,
      frameCallbacks: [],
      teardownCallbacks: []
    };
    ctx.shared.set(STEP_KEY, state);
    current = state;

    const controls = () => {
      if (state.pane) {
        return state.pane;
      }

      const container = document.createElement('div');
      container.className = 'lerpette-stage__controls';
      ctx.host.appendChild(container);
      state.paneContainer = container;
      state.pane = new Pane({ container });
      return state.pane;
    };

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'lerpette-stage__reset';
    resetButton.setAttribute('aria-label', 'Restart');
    resetButton.title = 'Restart';
    resetButton.innerHTML =
      '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" ' +
      'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M2.5 8a5.5 5.5 0 1 0 1.7-3.97"/>' +
      '<path d="M2.5 2.5v3h3"/>' +
      '</svg>';
    resetButton.addEventListener('click', () => {
      const paneState = state.pane?.exportState();
      teardownStep(ctx, target);
      void setupStep(ctx, target).then(() => {
        if (paneState && current?.pane) {
          current.pane.importState(paneState);
        }
      });
    });
    ctx.surface.tray.appendChild(resetButton);
    state.resetButton = resetButton;

    await config.setup({
      scene: target.scene,
      camera: target.camera,
      controls,
      onFrame: (cb) => state.frameCallbacks.push(cb),
      onTeardown: (cb) => state.teardownCallbacks.push(cb)
    });
  }

  return {
    panel: canvasViewportPanel,

    mount(ctx) {
      // Builds the renderer and paints one frame, so the panel is never empty while
      // the step's own setup is still resolving.
      loop.sync(ctx);
    },

    async enter(ctx) {
      loop.sync(ctx);
      const target = loop.current();
      if (!target) {
        return;
      }

      teardownStep(ctx, target);
      await setupStep(ctx, target);
      ctx.setCaption(config.caption);
      loop.start(ctx);
    },

    exit(ctx) {
      loop.stop();
      teardownStep(ctx, loop.current());
      current = null;
    },

    resize(ctx) {
      loop.sync(ctx);
    },

    dispose(ctx) {
      teardownStep(ctx, loop.current());
      current = null;
      loop.release(ctx);
    }
  };
}
