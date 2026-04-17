import { describe, it, expect, beforeAll } from 'vitest';

// @ts-expect-error — generated .d.ts
import factory from '../../../build/physics.js';

let mod: any;
beforeAll(async () => { mod = await factory(); });

describe('Particle + World — real wasm', () => {
  it('base Particle does not move on step', () => {
    const w = new mod.World();
    try {
      const p = new mod.Particle();
      w.addParticle(p);
      for (let i = 0; i < 10; i++) w.step(0.1);
      const pos = p.position();
      expect(pos[0]).toBeCloseTo(0, 5);
      expect(pos[1]).toBeCloseTo(0, 5);
      expect(pos[2]).toBeCloseTo(0, 5);
    } finally {
      w.destroy();
      w.delete();
    }
  });

  it('bodyCount reflects addParticle and remove', () => {
    const w = new mod.World();
    try {
      expect(w.bodyCount()).toBe(0);
      const a = new mod.Particle();
      const b = new mod.Particle();
      w.addParticle(a);
      w.addParticle(b);
      expect(w.bodyCount()).toBe(2);
      w.remove(a);
      expect(w.bodyCount()).toBe(1);
    } finally {
      w.destroy();
      w.delete();
    }
  });
});
