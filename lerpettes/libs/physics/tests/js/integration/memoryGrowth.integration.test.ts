import { describe, it, expect, beforeAll } from 'vitest';

// @ts-expect-error — generated .d.ts
import factory from '../../../build/physics.js';

let mod: any;
beforeAll(async () => { mod = await factory(); });

describe('memory growth — real wasm', () => {
  it('particle position() still works after many allocations', () => {
    const w = new mod.World();
    try {
      const particles = [];
      for (let i = 0; i < 5000; i++) {
        particles.push(new mod.Particle());
        w.addParticle(particles[i]);
      }
      const pos = particles[0].position();
      expect(Number.isFinite(pos[0])).toBe(true);
    } finally {
      w.destroy();
      w.delete();
    }
  });
});
