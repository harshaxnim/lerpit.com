import { describe, it, expect } from 'vitest';
import { World } from '../../js/world';
import { createFakeModule } from './fakeModule';

describe('World lifetime', () => {
  it('destroy() deletes every tracked handle and the world handle', async () => {
    const fake = createFakeModule();
    const world = await World.create(async () => fake);
    const a = world.addParticle(new fake.TestBody([0, 0, 0], [0, 0, 0]));
    const b = world.addParticle(new fake.TestBody([0, 0, 0], [0, 0, 0]));
    world.destroy();
    expect(a.deleted).toBe(true);
    expect(b.deleted).toBe(true);
    expect(fake._worlds[0]).toMatchObject({ deleted: true, destroyed: true });
  });

  it('destroy() is idempotent', async () => {
    const fake = createFakeModule();
    const world = await World.create(async () => fake);
    world.destroy();
    expect(() => world.destroy()).not.toThrow();
  });

  it('remove() on unknown handle is a no-op', async () => {
    const fake1 = createFakeModule();
    const fake2 = createFakeModule();
    const w1 = await World.create(async () => fake1);
    const w2 = await World.create(async () => fake2);
    const known = w1.addParticle(new fake1.TestBody([0, 0, 0], [0, 0, 0]));
    const stray = w2.addParticle(new fake2.TestBody([0, 0, 0], [0, 0, 0]));
    expect(() => w1.remove(stray)).not.toThrow();
    expect(w1.bodyCount()).toBe(1);
    w1.remove(known);
    expect(w1.bodyCount()).toBe(0);
  });

  it('operations after destroy throw', async () => {
    const fake = createFakeModule();
    const world = await World.create(async () => fake);
    world.destroy();
    expect(() => world.addParticle(new fake.TestBody([0, 0, 0], [0, 0, 0]))).toThrow();
    expect(() => world.step(0.1)).toThrow();
  });
});
