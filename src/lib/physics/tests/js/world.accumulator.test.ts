import { describe, it, expect } from 'vitest';
import { World } from '../../js/world';
import { createFakeModule } from './fakeModule';

const STEP = 1 / 120;

async function makeWorld() {
  const fake = createFakeModule();
  return { world: await World.create(async () => fake), fake };
}

describe('World.advance accumulator', () => {
  it('primes last timestamp on first call, does no stepping', async () => {
    const { world, fake } = await makeWorld();
    world.advance(0);
    world.addParticle(new fake.TestBody([0, 0, 0], [0, 0, 0]));
    expect((fake._worlds[0] as unknown as { bodies: Array<{ updateCallCount: number }> }).bodies[0].updateCallCount).toBe(0);
  });

  it('steps exactly once when dt equals STEP', async () => {
    const { world, fake } = await makeWorld();
    const body = world.addParticle(new fake.TestBody([0, 0, 0], [0, 0, 0]));
    world.advance(0);
    world.advance(STEP * 1000);
    expect(body.updateCallCount).toBe(1);
  });

  it('steps twice when dt equals 2 * STEP', async () => {
    const { world, fake } = await makeWorld();
    const body = world.addParticle(new fake.TestBody([0, 0, 0], [0, 0, 0]));
    world.advance(0);
    world.advance(2 * STEP * 1000);
    expect(body.updateCallCount).toBe(2);
  });

  it('clamps huge frame deltas (no spiral of death)', async () => {
    const { world, fake } = await makeWorld();
    const body = world.addParticle(new fake.TestBody([0, 0, 0], [0, 0, 0]));
    world.advance(0);
    world.advance(10_000); // 10 seconds
    expect(body.updateCallCount).toBeLessThanOrEqual(30); // 0.25s / STEP
  });

  it('leftover accumulator carries across frames', async () => {
    const { world, fake } = await makeWorld();
    const body = world.addParticle(new fake.TestBody([0, 0, 0], [0, 0, 0]));
    world.advance(0);
    world.advance(STEP * 500);
    expect(body.updateCallCount).toBe(0);
    world.advance(STEP * 1000);
    expect(body.updateCallCount).toBe(1);
  });
});
