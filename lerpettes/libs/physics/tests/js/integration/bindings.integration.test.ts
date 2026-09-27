import { describe, it, expect, beforeAll } from 'vitest';

// @ts-expect-error — generated .d.ts
import factory from '../../../build/physics.js';

let mod: any;
beforeAll(async () => { mod = await factory(); });

describe('framework bindings — real wasm', () => {
  it('exposes World and Particle constructors', () => {
    expect(typeof mod.World).toBe('function');
    expect(typeof mod.Particle).toBe('function');
  });

  it('World instance exposes framework methods', () => {
    const w = new mod.World();
    try {
      expect(typeof w.addParticle).toBe('function');
      expect(typeof w.remove).toBe('function');
      expect(typeof w.step).toBe('function');
      expect(typeof w.destroy).toBe('function');
      expect(typeof w.bodyCount).toBe('function');
    } finally {
      w.delete();
    }
  });

  it('Particle has position() and velocity() getters', () => {
    const p = new mod.Particle();
    try {
      expect(p.position()).toHaveLength(3);
      expect(p.velocity()).toHaveLength(3);
    } finally {
      p.delete();
    }
  });
});
