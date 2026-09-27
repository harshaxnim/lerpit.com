import { describe, it, expect } from 'vitest';
import { ensureWorld, disposeWorld } from '../../js/ensureWorld';
import { createFakeModule } from './fakeModule';

describe('ensureWorld', () => {
  it('returns the same world on repeated calls with the same key', async () => {
    const ctx = { shared: new Map<string, unknown>() };
    const fake = createFakeModule();
    const factory = async () => fake;
    const a = await ensureWorld(ctx, factory);
    const b = await ensureWorld(ctx, factory);
    expect(a).toBe(b);
  });

  it('different keys produce different worlds', async () => {
    const ctx = { shared: new Map<string, unknown>() };
    const factory = async () => createFakeModule();
    const a = await ensureWorld(ctx, factory, { key: 'one' });
    const b = await ensureWorld(ctx, factory, { key: 'two' });
    expect(a).not.toBe(b);
  });

  it('concurrent calls resolve to the same world', async () => {
    const ctx = { shared: new Map<string, unknown>() };
    const factory = async () => createFakeModule();
    const [a, b] = await Promise.all([ensureWorld(ctx, factory), ensureWorld(ctx, factory)]);
    expect(a).toBe(b);
  });

  it('disposeWorld destroys and removes from shared', async () => {
    const ctx = { shared: new Map<string, unknown>() };
    const fake = createFakeModule();
    const world = await ensureWorld(ctx, async () => fake);
    disposeWorld(ctx);
    expect(ctx.shared.get('physics:world')).toBeUndefined();
    expect(() => world.step(0.1)).toThrow();
  });
});
