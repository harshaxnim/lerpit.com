import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Pane } from 'tweakpane';
import type { LerpetteRuntimeContext, LerpetteStepRuntime } from '@/lib/lerpettes/types';

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

type RendererBundle = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
};

type StepState = {
  rafHandle: number | null;
  pane: Pane | null;
  paneContainer: HTMLElement | null;
  resetButton: HTMLButtonElement | null;
  frameCallbacks: Array<(nowMs: number) => void>;
  teardownCallbacks: Array<() => void>;
};

const RENDERER_KEY = '3d:renderer';
const STEP_KEY = '3d:step';

function ensureRenderer(ctx: LerpetteRuntimeContext): RendererBundle {
  const existing = ctx.shared.get(RENDERER_KEY) as RendererBundle | undefined;
  if (existing) return existing;

  const scene = new THREE.Scene();
  const { clientWidth, clientHeight } = ctx.host;
  const camera = new THREE.PerspectiveCamera(45, clientWidth / Math.max(clientHeight, 1), 0.1, 100);
  camera.position.set(0, 0, 6);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas: ctx.canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(clientWidth, clientHeight, false);

  scene.add(new THREE.AmbientLight(0xffffff, 2.));

  const controls = new OrbitControls(camera, ctx.canvas);
  controls.enableDamping = true;
  controls.enablePan = false;

  const bundle: RendererBundle = { scene, camera, renderer, controls };
  ctx.shared.set(RENDERER_KEY, bundle);
  return bundle;
}

function teardownStep(ctx: LerpetteRuntimeContext, rb: RendererBundle) {
  const prev = ctx.shared.get(STEP_KEY) as StepState | undefined;
  if (!prev) return;

  if (prev.rafHandle != null) window.cancelAnimationFrame(prev.rafHandle);

  for (const cb of prev.teardownCallbacks) cb();

  if (prev.pane) prev.pane.dispose();
  if (prev.paneContainer && prev.paneContainer.parentNode) {
    prev.paneContainer.parentNode.removeChild(prev.paneContainer);
  }
  if (prev.resetButton && prev.resetButton.parentNode) {
    prev.resetButton.parentNode.removeChild(prev.resetButton);
  }

  const toRemove: THREE.Object3D[] = [];
  rb.scene.traverse((obj: THREE.Object3D) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) toRemove.push(obj);
  });
  for (const obj of toRemove) {
    rb.scene.remove(obj);
    (obj as THREE.Mesh).geometry.dispose();
    ((obj as THREE.Mesh).material as THREE.Material).dispose();
  }

  ctx.shared.delete(STEP_KEY);
}

async function setupStep(
  ctx: LerpetteRuntimeContext,
  rb: RendererBundle,
  setup: (ctx: Setup3DContext) => Promise<void> | void
): Promise<StepState> {
  const state: StepState = {
    rafHandle: null,
    pane: null,
    paneContainer: null,
    resetButton: null,
    frameCallbacks: [],
    teardownCallbacks: []
  };
  ctx.shared.set(STEP_KEY, state);

  const onFrame = (cb: (nowMs: number) => void) => { state.frameCallbacks.push(cb); };
  const onTeardown = (cb: () => void) => { state.teardownCallbacks.push(cb); };

  const controls = () => {
    if (state.pane) return state.pane;
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
    teardownStep(ctx, rb);
    void setupStep(ctx, rb, setup).then((next) => {
      if (paneState && next.pane) next.pane.importState(paneState);
    });
  });
  const label = ctx.host.parentElement?.querySelector('.lerpette-stage__label');
  const activeStep = label?.querySelector('.lerpette-stage__active-step');
  if (label && activeStep) {
    let endGroup = label.querySelector('.lerpette-stage__label-end');
    if (!endGroup) {
      endGroup = document.createElement('span');
      endGroup.className = 'lerpette-stage__label-end';
      label.insertBefore(endGroup, activeStep);
      endGroup.appendChild(activeStep);
    }
    endGroup.insertBefore(resetButton, activeStep);
  } else {
    ctx.host.appendChild(resetButton);
  }
  state.resetButton = resetButton;

  await setup({ scene: rb.scene, camera: rb.camera, controls, onFrame, onTeardown });

  const loop = (nowMs: number) => {
    for (const cb of state.frameCallbacks) cb(nowMs);
    rb.controls.update();
    rb.renderer.render(rb.scene, rb.camera);
    state.rafHandle = window.requestAnimationFrame(loop);
  };
  state.rafHandle = window.requestAnimationFrame(loop);

  return state;
}

export function create3DRuntime(config: Step3DConfig): LerpetteStepRuntime {
  return {
    async mount(ctx) {
      ensureRenderer(ctx);
    },
    async enter(ctx) {
      const rb = ensureRenderer(ctx);
      teardownStep(ctx, rb);
      await setupStep(ctx, rb, config.setup);
      ctx.setCaption(config.caption);
    },
    resize(ctx) {
      const rb = ctx.shared.get(RENDERER_KEY) as RendererBundle | undefined;
      if (!rb) return;
      const { clientWidth, clientHeight } = ctx.host;
      rb.renderer.setSize(clientWidth, clientHeight, false);
      rb.camera.aspect = clientWidth / Math.max(clientHeight, 1);
      rb.camera.updateProjectionMatrix();
    },
    dispose(ctx) {
      const rb = ctx.shared.get(RENDERER_KEY) as RendererBundle | undefined;
      if (rb) {
        teardownStep(ctx, rb);
        rb.controls.dispose();
        rb.renderer.dispose();
        ctx.shared.delete(RENDERER_KEY);
      }
    }
  };
}
