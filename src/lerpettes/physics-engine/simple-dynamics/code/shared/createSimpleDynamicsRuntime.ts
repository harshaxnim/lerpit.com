import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { LerpetteRuntimeContext, LerpetteStepRuntime } from '@/lib/lerpettes/types';
import {
  syncMeshes,
  type ModuleFactory,
  type NativeWorld,
  type PhysicsModule,
  World
} from '@/lib/physics/js';

export type SetupContext = {
  world: World;
  module: PhysicsModule;
  scene: THREE.Scene;
};

type StepConfig = {
  caption: string;
  factory?: ModuleFactory;
  construct?: (m: PhysicsModule) => NativeWorld;
  setup: (ctx: SetupContext) => void;
};

type RendererBundle = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
};

type StepState = {
  world: World;
  rafHandle: number | null;
};

const RENDERER_KEY = 'simple-dynamics:renderer';
const STEP_KEY = 'simple-dynamics:step';

// Default factory: loads the framework-only wasm (base World, empty step).
const defaultFactory: ModuleFactory = async () => {
  const mod = (await import('@/lib/physics/build/physics.js')).default;
  return (await mod()) as PhysicsModule;
};

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

  const toRemove: THREE.Object3D[] = [];
  rb.scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) toRemove.push(obj);
  });
  for (const obj of toRemove) {
    rb.scene.remove(obj);
    (obj as THREE.Mesh).geometry.dispose();
    ((obj as THREE.Mesh).material as THREE.Material).dispose();
  }

  prev.world.destroy();
  ctx.shared.delete(STEP_KEY);
}

async function setupStep(
  ctx: LerpetteRuntimeContext,
  rb: RendererBundle,
  factory: ModuleFactory,
  construct: ((m: PhysicsModule) => NativeWorld) | undefined,
  setup: (ctx: SetupContext) => void
): Promise<StepState> {
  const module = await (await factory());
  const nativeWorld = construct ? construct(module) : new module.World();
  const world = await World.create(
    async () => module,
    () => nativeWorld
  );

  setup({ world, module, scene: rb.scene });

  const state: StepState = { world, rafHandle: null };
  ctx.shared.set(STEP_KEY, state);

  const loop = (nowMs: number) => {
    world.advance(nowMs);
    syncMeshes(world);
    rb.controls.update();
    rb.renderer.render(rb.scene, rb.camera);
    state.rafHandle = window.requestAnimationFrame(loop);
  };
  state.rafHandle = window.requestAnimationFrame(loop);

  return state;
}

export function createSimpleDynamicsRuntime(config: StepConfig): LerpetteStepRuntime {
  const factory = config.factory ?? defaultFactory;
  const construct = config.construct;

  return {
    async mount(ctx) {
      ensureRenderer(ctx);
    },
    async enter(ctx) {
      const rb = ensureRenderer(ctx);
      teardownStep(ctx, rb);
      await setupStep(ctx, rb, factory, construct, config.setup);
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
