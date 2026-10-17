import type * as THREE from 'three';
import { create3DRuntime, type Setup3DContext } from '@lerpit/framework/runtimes/create3DRuntime';
import type { LerpetteStepRuntime } from '@lerpit/framework/types';
import { syncMeshes } from './renderer';
import { World } from './world';
import type { ModuleFactory, NativeWorld, PhysicsModule } from './types';

/**
 * A physics chapter: the 3D preset plus a World, advanced by the chapter's own clock
 * in fixed steps and copied onto its meshes after every frame.
 *
 * `Native` is the world class the chapter's C++ defines, so the setters a lesson adds
 * (`setFloorRestitution`, say) are typed rather than reached through a cast.
 */

export type Setup3DPhysicsContext<Native extends NativeWorld = NativeWorld> = Omit<Setup3DContext, 'camera'> & {
  world: World<Native>;
  module: PhysicsModule;
  camera: THREE.PerspectiveCamera;
};

export type Step3DPhysicsConfig<Native extends NativeWorld = NativeWorld> = {
  caption: string;
  /** Loads this chapter's module: `async () => (await import('../build/x.js')).default()`. */
  factory?: ModuleFactory;
  /** Builds the world, for a chapter whose C++ subclasses World. */
  construct?: (m: PhysicsModule) => Native;
  setup: (ctx: Setup3DPhysicsContext<Native>) => Promise<void> | void;
};

const defaultFactory: ModuleFactory = async () => {
  const mod = (await import('../build/physics.js')).default;
  return (await mod()) as PhysicsModule;
};

export function create3DPhysicsRuntime<Native extends NativeWorld = NativeWorld>(
  config: Step3DPhysicsConfig<Native>
): LerpetteStepRuntime<any> {
  const factory = config.factory ?? defaultFactory;

  return create3DRuntime({
    caption: config.caption,
    setup: async (ctx3d) => {
      const world = await World.create<Native>(factory, config.construct);

      ctx3d.onFrame((dt) => {
        world.advanceBy(dt);
        syncMeshes(world);
      });
      ctx3d.onTeardown(() => world.destroy());

      await config.setup({ ...ctx3d, world, module: world.module });
      // Meshes start where their bodies are, not at the origin for a frame.
      syncMeshes(world);
    }
  });
}
