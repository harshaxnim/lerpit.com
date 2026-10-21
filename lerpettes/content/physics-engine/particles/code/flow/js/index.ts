import { createStage } from '@lerpit/framework/chapter';
import { colors } from '@lerpit/framework/theme';
import { Trail } from '@lerpit/framework/trail';

type Particle = { x: number; y: number; trail: Trail };
type View = { halfWidth: number; halfHeight: number };

// Shared parameters
const RADIUS = 7;
const TRAIL_COUNT = 1000; // points of history per particle: ten seconds at 60 steps a second
const ESCAPE = 1.5; // once every particle is this many half-views out, start over

const spread = (s: { count: number; particles: Particle[] }, view: View) => {
  s.particles = [];
  for (let i = 0; i < s.count; i++) {
    const x = 0 + ((i + 0.5) / s.count) * 2 - 1;
    const y = 0 + ((i * 0.618034 + 0.5) % 1) * 2 - 1;
    s.particles.push({ x: x * view.halfWidth, y: y * view.halfHeight, trail: Trail.create(TRAIL_COUNT) });
  }
};

// Velocity vector field
const velocityField = (x: number, y: number, maxSpeed: number, t: number=1.) =>
{
  const speed = maxSpeed / Math.SQRT2;
  return [-speed*y, speed*x];
}

export default createStage({
  caption: 'Particles drifting along:\n$v = s\\,(-y, x)$',
  
  state: { maxSpeed:2, count: 2, particles: [] as Particle[], substeps: 1},

  setup(s, ctx) {
    spread(s, ctx.view);

    ctx.controls().addBinding(s, 'substeps', {label: 'Sub-steps', min: 1, max: 50, step: 1});
    ctx.controls().addBinding(s, 'maxSpeed', { label: 'Max Speed', min: 1e-6, max: 5, step: .1 });
    ctx.controls().addBinding(s, 'count', { label: 'Particles', min: 1, max: 200, step: 1 }).on('change', () => spread(s, ctx.view));

    ctx.readings().fps();
  },
  
  step(s, dt, ctx) {
    const { halfWidth, halfHeight } = ctx.view;
    let escaped = true;
    for (const p of s.particles) {
      for (let i = 0; i < s.substeps; i += 1)
      {
        const [vx, vy] = velocityField(p.x, p.y, s.maxSpeed, ctx.time);
        const sdt = dt/s.substeps;
        p.x += vx * sdt, p.y += vy * sdt;
      }
      Trail.push(p.trail, p.x, p.y);
      if (Math.abs(p.x) <= ESCAPE * halfWidth && Math.abs(p.y) <= ESCAPE * halfHeight) escaped = false;
    }
    // Explicit Euler spirals every particle outward; once they are all well off screen, start over.
    if (escaped) spread(s, ctx.view);
  },
  
  viewport2d: {
    draw(sketch, s, ctx) {
      
      // Vector field
      const SPACING = 0.05;
      // Arrow length per unit of speed; at speed 0 every arrow is zero length anyway.
      const reach = (0.5 * SPACING) / s.maxSpeed;
      const { halfWidth, halfHeight } = ctx.view;
      for (let x = -halfWidth + SPACING / 2; x < halfWidth; x += SPACING) {
        for (let y = -halfHeight + SPACING / 2; y < halfHeight; y += SPACING) {
          const [vx, vy] = velocityField(x, y, s.maxSpeed, ctx.time);
          sketch.arrow(x - vx * reach, y - vy * reach, x + vx * reach, y + vy * reach, colors.gray, 1);
          sketch.circle(x - vx * reach, y - vy * reach, .5, colors.orange);
        }
      }

      // Particles
      for (const p of s.particles) sketch.trail(p.trail, { color: colors.orange, width: 2, fade: false });
      for (const p of s.particles) sketch.circle(p.x, p.y, RADIUS, colors.orange);
    },
  },
});
