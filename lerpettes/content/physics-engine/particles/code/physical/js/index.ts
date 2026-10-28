import { createStage } from '@lerpit/framework/chapter';
import { colors } from '@lerpit/framework/theme';
import { Trail } from '@lerpit/framework/trail';

type Particle = { x: number; y: number; vx: number; vy: number; fx: number, fy: number; r: number; m: number; c: string; trail: Trail };

const TRAIL_COUNT = 1000;

const MASS = 652.794;

const SOFTENING = 0.01;


function start(s: { particles: Particle[]; G: number }) {
  s.particles = [
    { x: -0.193661, y: 0, vx: -1.129754, vy: 1.489734, fx: 0, fy: 0, r: 7, m: MASS, c: colors.orange, trail: Trail.create(TRAIL_COUNT) },
    { x: 0.598131, y: 0, vx: 0.079315, vy: -0.438826, fx: 0, fy: 0, r: 7, m: MASS, c: colors.blue, trail: Trail.create(TRAIL_COUNT) },
    { x: -0.40447, y: 0, vx: 1.050439, vy: -1.050907, fx: 0, fy: 0, r: 7, m: MASS, c: colors.teal, trail: Trail.create(TRAIL_COUNT) },
  ];
}

export default createStage({
  caption: 'A solution to the three body problem\n\nThree particles with carefully crafted initial conditions under gravity\n$$\\frac{G\\,m_1\\,m_2}{r^2}$$',

  state: { particles: [] as Particle[], stepMs: 0.3, leftover: 0, G: 0.001, trail: true, field: false },

  setup(s, ctx) {
    start(s);

    ctx.controls().addBinding(s, 'stepMs', { label: 'Step Size $\\Delta t$ (ms)', min: 0.1, max: 20, step: 0.1 });
    ctx.controls().addBinding(s, 'trail', { label: 'Trail'});
    ctx.controls().addBinding(s, 'field', { label: 'Acceleration field' });

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
    // Steps of the same length whatever the frame rate; time short of a whole step waits for the next frame.
    const sdt = s.stepMs / 1000;
    s.leftover += dt;

    while (s.leftover >= sdt) {
      s.leftover -= sdt;

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
    draw(sketch, s, ctx) {
      // Acceleration field: the pull a test mass would feel at each grid point
      if (s.field) {
        const SPACING = 0.05;
        // Gravity runs from near zero to huge close to a body, so lengths saturate at half the spacing.
        const A0 = (s.G * MASS) / 0.25;
        const { halfWidth, halfHeight } = ctx.view;
        for (let x = -halfWidth + SPACING / 2; x < halfWidth; x += SPACING) {
          for (let y = -halfHeight + SPACING / 2; y < halfHeight; y += SPACING) {
            let ax = 0, ay = 0;
            for (const q of s.particles) {
              const dx = q.x - x;
              const dy = q.y - y;
              const r2 = dx * dx + dy * dy + SOFTENING * SOFTENING;
              const r = Math.sqrt(r2);
              const a = (s.G * q.m) / r2;
              ax += a * (dx / r);
              ay += a * (dy / r);
            }
            const a = Math.hypot(ax, ay);
            const reach = (0.5 * SPACING) / (a + A0);
            sketch.arrow(x - ax * reach, y - ay * reach, x + ax * reach, y + ay * reach, { color: colors.gray, width: 1 });
            sketch.circle(x - ax * reach, y - ay * reach, .5, { color: colors.orange });
          }
        }
      }

      if (s.trail) for (const p of s.particles) sketch.trail(p.trail, { color: p.c, width: 2 });
      for (const p of s.particles) sketch.circle(p.x, p.y, p.r, { color: p.c });
    },
  },
});
