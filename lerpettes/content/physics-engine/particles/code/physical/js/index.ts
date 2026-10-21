import { createStage } from '@lerpit/framework/chapter';
import { colors } from '@lerpit/framework/theme';
import { Trail } from '@lerpit/framework/trail';

type Particle = { x: number; y: number; vx: number; vy: number; fx: number, fy: number; r: number; m: number; c: string; trail: Trail };

const TRAIL_COUNT = 1000;

const STAR_MASS = 110;
const STAR_GAP = 0.12;
const PLANET_MASS = 2;
const PLANET_DISTANCE = 0.45;

const SOFTENING = 0.01;


function start(s: { particles: Particle[]; G: number }) {
  function orbitSpeed(G: number, mass: number, distance: number) {
    return Math.sqrt((G * mass) / distance);
  }
  const starSpeed = 0.5 * orbitSpeed(s.G, 2 * STAR_MASS, STAR_GAP);
  const planetSpeed = orbitSpeed(s.G, 2 * STAR_MASS, PLANET_DISTANCE);
  const drift = (PLANET_MASS * planetSpeed) / (2 * STAR_MASS);

  s.particles = [
    { x: STAR_GAP / 1.5, y: 0, vx: drift, vy: -starSpeed, fx: 0, fy: 0, r: 12, m: STAR_MASS, c: colors.orange, trail: Trail.create(TRAIL_COUNT) },
    { x: -STAR_GAP / 1.5, y: 0, vx: drift, vy: starSpeed, fx: 0, fy: 0, r: 12, m: STAR_MASS, c: colors.orange, trail: Trail.create(TRAIL_COUNT) },
    { x: 0, y: PLANET_DISTANCE, vx: -planetSpeed, vy: 0, fx: 0, fy: 0, r: 7, m: PLANET_MASS, c: colors.blue, trail: Trail.create(TRAIL_COUNT) },
  ];
}

export default createStage({
  caption: 'Three body problem. Particles under gravity\n$$\\frac{G\\,m_1\\,m_2}{r^2}$$',

  state: { particles: [] as Particle[], substeps: 4, G: 0.001 },

  setup(s, ctx) {
    start(s);

    ctx.controls().addBinding(s, 'substeps', { label: 'Sub-steps', min: 1, max: 50, step: 1 });

    ctx.readings().fps();
    const f = (v: number) => v.toFixed(2);
    for (let i = 0; i < s.particles.length; i++) {
      ctx.readings().text(`p${i + 1}`, () => {
        const p = s.particles[i];
        return `r ${p.r} | m ${p.m} x ${f(p.x)}  y ${f(p.y)}  |v| ${f(Math.hypot(p.vx, p.vy))}`;
      });
    }
  },

  step(s, dt) {
    const sdt = dt / s.substeps;

    for (let i = 0; i < s.substeps; i += 1) {
      // Accumulate forces on every body from the current state
      for (let pi = 0; pi < s.particles.length; pi += 1) {
        const p = s.particles[pi];
        p.fx = 0, p.fy=0;
        for (let qi = 0; qi < s.particles.length; qi += 1) {
          if (qi === pi) continue;
          const q = s.particles[qi];
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const r2 = dx * dx + dy * dy + SOFTENING * SOFTENING;
          const r = Math.sqrt(r2);
          const f = (s.G * q.m * p.m) / r2;
          p.fx += f * (dx / r);
          p.fy += f * (dy / r);
        }
      }

      // Symplectic Euler: velocity first, then position with the new velocity.
      for (let pi = 0; pi < s.particles.length; pi += 1) {
        const p = s.particles[pi];
        
        const ax = p.fx/p.m;
        const ay = p.fy/p.m;
        
        p.vx += ax * sdt;
        p.vy += ay * sdt;
        
        p.x += p.vx * sdt;
        p.y += p.vy * sdt;
      }
    }

    for (const p of s.particles) Trail.push(p.trail, p.x, p.y);
  },

  viewport2d: {
    draw(sketch, s) {
      for (const p of s.particles) sketch.trail(p.trail, { color: p.c, width: 2 });
      for (const p of s.particles) sketch.circle(p.x, p.y, p.r, p.c);
    },
  },
});
