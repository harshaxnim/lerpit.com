import * as THREE from 'three';
import type { LerpetteRuntimeContext, LerpetteStepRuntime } from '@/lib/lerpettes/types';
import {
  bindMesh,
  disposeWorld,
  ensureWorld,
  syncMeshes,
  type ModuleFactory,
  type NativeSphere,
  type PhysicsModule,
  type World
} from '@/lib/physics/js';

type LerpetteModule = PhysicsModule & {
  ParticleWorld: new () => PhysicsModule extends { World: new () => infer W } ? W : never;
};

type SceneBundle = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  sphere: NativeSphere;
  mesh: THREE.Mesh;
  rafHandle: number | null;
};

type StepConfig = {
  runtimeLabel: string;
  caption: string;
};

const SCENE_KEY = 'simple-dynamics:scene';

const lerpetteFactory: ModuleFactory = async () => {
  // @ts-expect-error — generated .d.ts for lerpette wasm
  const mod = (await import('../particle/build/particle.js')).default;
  return (await mod()) as PhysicsModule;
};

async function ensureScene(ctx: LerpetteRuntimeContext): Promise<SceneBundle> {
  const existing = ctx.shared.get(SCENE_KEY) as SceneBundle | undefined;
  if (existing) return existing;

  const world: World = await ensureWorld(ctx, lerpetteFactory, {
    construct: (m) => new (m as LerpetteModule).ParticleWorld()
  });
  const module = world.module as LerpetteModule;

  const scene = new THREE.Scene();
  const { clientWidth, clientHeight } = ctx.host;
  const camera = new THREE.PerspectiveCamera(45, clientWidth / Math.max(clientHeight, 1), 0.1, 100);
  camera.position.set(0, 0, 6);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas: ctx.canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(clientWidth, clientHeight, false);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(2, 3, 4);
  scene.add(dir);

  const sphere = new module.Sphere([0, 0, 0], [0, 0.1, 0], 0.5);
  world.addParticle(sphere);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 32, 32),
    new THREE.MeshStandardMaterial({ color: '#D17041' })
  );
  scene.add(mesh);
  bindMesh(sphere, mesh);

  const bundle: SceneBundle = { scene, camera, renderer, sphere, mesh, rafHandle: null };
  ctx.shared.set(SCENE_KEY, bundle);

  const loop = (nowMs: number) => {
    world.advance(nowMs);
    syncMeshes(world);
    renderer.render(scene, camera);
    bundle.rafHandle = window.requestAnimationFrame(loop);
  };
  bundle.rafHandle = window.requestAnimationFrame(loop);

  return bundle;
}

export function createSimpleDynamicsRuntime(config: StepConfig): LerpetteStepRuntime {
  return {
    async mount(ctx) {
      await ensureScene(ctx);
    },
    async enter(ctx) {
      await ensureScene(ctx);
      ctx.setRuntimeLabel(config.runtimeLabel);
      ctx.setCaption(config.caption);
    },
    resize(ctx) {
      const bundle = ctx.shared.get(SCENE_KEY) as SceneBundle | undefined;
      if (!bundle) return;
      const { clientWidth, clientHeight } = ctx.host;
      bundle.renderer.setSize(clientWidth, clientHeight, false);
      bundle.camera.aspect = clientWidth / Math.max(clientHeight, 1);
      bundle.camera.updateProjectionMatrix();
    },
    dispose(ctx) {
      const bundle = ctx.shared.get(SCENE_KEY) as SceneBundle | undefined;
      if (bundle?.rafHandle != null) {
        window.cancelAnimationFrame(bundle.rafHandle);
      }
      if (bundle) {
        bundle.mesh.geometry.dispose();
        (bundle.mesh.material as THREE.Material).dispose();
        bundle.renderer.dispose();
        ctx.shared.delete(SCENE_KEY);
      }
      disposeWorld(ctx);
    }
  };
}
