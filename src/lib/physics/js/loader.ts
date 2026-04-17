import type { ModuleFactory, PhysicsModule } from './types';

/**
 * Framework is loader-agnostic: each lerpette supplies its own factory
 * that loads its own wasm (which includes framework bindings + that
 * lerpette's subclass bindings).
 *
 * Cached per factory-reference so multiple Worlds in the same lerpette
 * share one module instantiation.
 */
const cache = new WeakMap<ModuleFactory, Promise<PhysicsModule>>();

export async function loadPhysicsModule(factory: ModuleFactory): Promise<PhysicsModule> {
  const cached = cache.get(factory);
  if (cached) return cached;
  const pending = factory();
  cache.set(factory, pending);
  return pending;
}

export function __clearPhysicsModuleCache(): void {
  // WeakMap has no clear(); tests create fresh factory references instead.
}
