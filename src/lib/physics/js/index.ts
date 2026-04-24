export { World } from './world';
export { bindMesh, unbindMesh, syncMeshes } from './renderer';
export { ensureWorld, disposeWorld } from './ensureWorld';
export { loadPhysicsModule } from './loader';
export { create3DPhysicsRuntime } from './create3DPhysicsRuntime';
export type { Setup3DPhysicsContext, Step3DPhysicsConfig } from './create3DPhysicsRuntime';
export type { Vec3, NativeParticle, NativeSphere, NativeWorld, PhysicsModule, ModuleFactory } from './types';
