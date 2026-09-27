import type { ModuleFactory, NativeWorld, PhysicsModule } from './types';
import { World } from './world';

type SharedContext = { shared: Map<string, unknown> };

const DEFAULT_KEY = 'physics:world';

export type EnsureWorldOptions = {
  /** Override the native World constructor (e.g. a lerpette subclass). */
  construct?: (module: PhysicsModule) => NativeWorld;
  key?: string;
};

/**
 * Idempotent world factory keyed on ctx.shared. Each lerpette supplies its
 * own `factory` — the one that loads its lerpette-specific wasm module —
 * and optionally a `construct` callback to build a subclass.
 */
export async function ensureWorld(
  ctx: SharedContext,
  factory: ModuleFactory,
  options: EnsureWorldOptions = {}
): Promise<World> {
  const key = options.key ?? DEFAULT_KEY;
  const existing = ctx.shared.get(key);
  if (existing instanceof World) return existing;

  const pending = ctx.shared.get(`${key}:pending`);
  if (pending instanceof Promise) return pending as Promise<World>;

  const creation = World.create(factory, options.construct).then((world) => {
    ctx.shared.set(key, world);
    ctx.shared.delete(`${key}:pending`);
    return world;
  });
  ctx.shared.set(`${key}:pending`, creation);
  return creation;
}

export function disposeWorld(ctx: SharedContext, key: string = DEFAULT_KEY): void {
  const world = ctx.shared.get(key);
  if (world instanceof World) {
    world.destroy();
    ctx.shared.delete(key);
  }
  ctx.shared.delete(`${key}:pending`);
}
