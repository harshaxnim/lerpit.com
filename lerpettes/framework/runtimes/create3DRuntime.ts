import * as THREE from 'three';
import { RotateCcw } from 'lucide-static';
import { Pane } from 'tweakpane';
import { createReadingsCard, type Readings, type ReadingsCard } from '@lerpit/framework/monitors/readings';
import type { ReadingsView } from '@lerpit/framework/monitors/view';
import { canvasViewportPanel } from '@lerpit/framework/panels';
import type { LerpetteRuntimeContext, LerpetteStepRuntime } from '@lerpit/framework/types';
import { createFrameLoop } from './frameLoop';
import { threeScene, type ThreeSceneTarget } from './threeScene';

/**
 * A three.js scene, one step at a time.
 *
 * The renderer, the camera, the pixel ratio, the resize and the frame loop all belong
 * to createFrameLoop and threeScene now. What is left here is the part that is
 * genuinely about a 3D *step*: its two corner cards (controls with the restart button
 * on the right, readings on the left), and tearing one step's meshes down before the
 * next builds its own.
 */

export type Setup3DContext = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /**
   * What the reader sets: a tweakpane in the top-right card, beside restart. The card
   * starts folded to its title; pass { expanded: true } for a step whose controls are
   * the point of it.
   */
  controls: (options?: ControlsOptions) => Pane;
  /** What the step reports: graphs, numbers, vectors, in the top-left card. See monitors/readings.ts. */
  monitors: () => Readings;
  onFrame: (cb: (nowMs: number) => void) => void;
  onTeardown: (cb: () => void) => void;
};

export type ControlsOptions = {
  /** Start with the controls showing rather than folded. */
  expanded?: boolean;
};

export type Step3DConfig = {
  caption: string;
  setup: (ctx: Setup3DContext) => Promise<void> | void;
};

type StepState = {
  pane: Pane | null;
  card: HTMLElement | null;
  readings: ReadingsCard | null;
  frameCallbacks: Array<(nowMs: number) => void>;
  teardownCallbacks: Array<() => void>;
};

const STEP_KEY = '3d:step';
// What the reader made of the two cards, kept so a restart puts them back as they were.
// A new chapter clears them (see enter): it starts as its own code asks.
const CONTROLS_COLLAPSED_KEY = '3d:controls-collapsed';
const READINGS_KEY = '3d:readings';

let controlsIds = 0;

function teardownStep(ctx: LerpetteRuntimeContext, target: ThreeSceneTarget | null) {
  const prev = ctx.shared.get(STEP_KEY) as StepState | undefined;
  if (!prev) {
    return;
  }

  for (const cb of prev.teardownCallbacks) {
    cb();
  }

  prev.pane?.dispose();
  prev.card?.remove();
  prev.readings?.remove();

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
    // After the step's own callbacks, so readings see this frame's state.
    current.readings?.tick(nowMs);
  });

  async function setupStep(ctx: LerpetteRuntimeContext, target: ThreeSceneTarget) {
    const state: StepState = {
      pane: null,
      card: null,
      readings: null,
      frameCallbacks: [],
      teardownCallbacks: []
    };
    ctx.shared.set(STEP_KEY, state);
    current = state;

    // The controls card is there for every step, because restart is. It grows its
    // title, which is also its fold toggle, and a body only once the step asks for
    // controls.
    const card = document.createElement('div');
    card.className = 'lerpette-stage__card';
    const head = document.createElement('div');
    head.className = 'lerpette-stage__card-head';
    card.appendChild(head);
    state.card = card;

    const restart = document.createElement('button');
    restart.type = 'button';
    restart.className = 'lerpette-stage__icon';
    restart.setAttribute('aria-label', 'Restart');
    restart.title = 'Restart';
    restart.innerHTML = RotateCcw;
    restart.querySelector('svg')?.setAttribute('aria-hidden', 'true');
    restart.addEventListener('click', () => {
      const paneState = state.pane?.exportState();
      teardownStep(ctx, target);
      void setupStep(ctx, target).then(() => {
        if (paneState && current?.pane) {
          current.pane.importState(paneState);
        }
      });
    });
    head.appendChild(restart);
    ctx.surface.tray.appendChild(card);

    const controls = (options: ControlsOptions = {}) => {
      if (state.pane) {
        return state.pane;
      }

      const container = document.createElement('div');
      container.className = 'lerpette-stage__card-body lerpette-stage__controls';
      container.id = `lerpette-controls-${++controlsIds}`;
      card.appendChild(container);

      const title = document.createElement('button');
      title.type = 'button';
      title.className = 'lerpette-stage__card-title';
      title.textContent = 'Controls';
      title.setAttribute('aria-controls', container.id);
      const setCollapsed = (collapsed: boolean) => {
        card.classList.toggle('is-collapsed', collapsed);
        title.setAttribute('aria-expanded', String(!collapsed));
        title.title = collapsed ? 'Show controls' : 'Hide controls';
        ctx.shared.set(CONTROLS_COLLAPSED_KEY, collapsed);
      };
      title.addEventListener('click', () => setCollapsed(!card.classList.contains('is-collapsed')));
      head.prepend(title);
      const restored = ctx.shared.get(CONTROLS_COLLAPSED_KEY) as boolean | undefined;
      setCollapsed(restored ?? !options.expanded);

      state.pane = new Pane({ container });
      return state.pane;
    };

    const monitors = () => {
      if (!state.readings) {
        const restored = (ctx.shared.get(READINGS_KEY) as ReadingsView | undefined) ?? null;
        state.readings = createReadingsCard(ctx.surface.monitors, restored, (view) => ctx.shared.set(READINGS_KEY, view));
      }
      return state.readings.readings;
    };

    await config.setup({
      scene: target.scene,
      camera: target.camera,
      controls,
      monitors,
      onFrame: (cb) => state.frameCallbacks.push(cb),
      onTeardown: (cb) => state.teardownCallbacks.push(cb)
    });
    state.readings?.settle();
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
      // A chapter starts as its own code asks, not as the reader left the last one.
      ctx.shared.delete(CONTROLS_COLLAPSED_KEY);
      ctx.shared.delete(READINGS_KEY);
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
