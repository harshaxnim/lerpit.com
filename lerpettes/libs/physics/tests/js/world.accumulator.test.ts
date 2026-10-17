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

describe('World.advanceBy', () => {
  it('steps in fixed 1/120 s steps and carries the remainder', async () => {
    const { world, fake } = await makeWorld();
    const body = world.addParticle(new fake.TestBody([0, 0, 0], [0, 0, 0]));
    world.advanceBy(STEP * 1.5);
    expect(body.updateCallCount).toBe(1);
    world.advanceBy(STEP * 0.5);
    expect(body.updateCallCount).toBe(2);
  });

  it('ignores zero, negative and non-finite dt', async () => {
    const { world, fake } = await makeWorld();
    const body = world.addParticle(new fake.TestBody([0, 0, 0], [0, 0, 0]));
    world.advanceBy(0);
    world.advanceBy(-1);
    world.advanceBy(Number.NaN);
    expect(body.updateCallCount).toBe(0);
  });

  it('clamps a huge dt rather than spiralling', async () => {
    const { world, fake } = await makeWorld();
    const body = world.addParticle(new fake.TestBody([0, 0, 0], [0, 0, 0]));
    world.advanceBy(10);
    expect(body.updateCallCount).toBeLessThanOrEqual(30);
  });
});
