import * as THREE from 'three';
import { Pane } from 'tweakpane';
import { create3DRuntime } from '@/lib/lerpettes/runtimes/create3DRuntime';
import type { LerpetteStepRuntime } from '@/lib/lerpettes/types';
import { syncMeshes } from './renderer';
import { World } from './world';
import type { ModuleFactory, NativeWorld, PhysicsModule } from './types';

export type Setup3DPhysicsContext = {
  world: World;
  module: PhysicsModule;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: () => Pane;
  onFrame: (cb: (nowMs: number) => void) => void;
  onTeardown: (cb: () => void) => void;
};

export type Step3DPhysicsConfig = {
  caption: string;
  factory?: ModuleFactory;
  construct?: (m: PhysicsModule) => NativeWorld;
  setup: (ctx: Setup3DPhysicsContext) => Promise<void> | void;
};

const defaultFactory: ModuleFactory = async () => {
  const mod = (await import('../build/physics.js')).default;
  return (await mod()) as PhysicsModule;
};

export function create3DPhysicsRuntime(config: Step3DPhysicsConfig): LerpetteStepRuntime {
  const factory = config.factory ?? defaultFactory;
  const construct = config.construct;

  return create3DRuntime({
    caption: config.caption,
    setup: async (ctx3d) => {
      const module = await factory();
      const nativeWorld = construct ? construct(module) : new module.World();
      const world = await World.create(async () => module, () => nativeWorld);

      ctx3d.onFrame((nowMs) => {
        world.advance(nowMs);
        syncMeshes(world);
      });
      ctx3d.onTeardown(() => {
        world.destroy();
      });

      await config.setup({
        ...ctx3d,
        world,
        module
      });
    }
  });
}
