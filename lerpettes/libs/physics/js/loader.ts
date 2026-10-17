import { loadModule } from '@lerpit/framework/wasm/loadModule';
import type { ModuleFactory, PhysicsModule } from './types';

/**
 * Each lerpette supplies the factory that loads its own wasm (the framework's bindings
 * plus that lerpette's subclass). Loaded through the framework's one wasm loader, so a
 * factory is instantiated once per page however many worlds it backs.
 */
export async function loadPhysicsModule(factory: ModuleFactory): Promise<PhysicsModule> {
  return (await loadModule(factory)) as PhysicsModule;
}
