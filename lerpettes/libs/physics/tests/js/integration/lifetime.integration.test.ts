import { describe, it, expect, beforeAll } from 'vitest';

// @ts-expect-error — generated .d.ts
import factory from '../../../build/physics.js';

let mod: any;
beforeAll(async () => { mod = await factory(); });

describe('lifetime — real wasm', () => {
  it('create/destroy 100 particles in a loop without crashes', () => {
    for (let run = 0; run < 3; run++) {
      const w = new mod.World();
      for (let i = 0; i < 100; i++) {
        w.addParticle(new mod.Particle());
      }
      w.step(0.016);
      w.destroy();
      w.delete();
    }
    expect(true).toBe(true);
  });
});
