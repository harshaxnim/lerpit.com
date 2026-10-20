import { createStage } from '@lerpit/framework/chapter';
import { colors } from '@lerpit/framework/theme';
import { wrap } from '@lerpit/framework/math';
import { Trail } from '@lerpit/framework/trail';

type Particle = { x: number; y: number; trail: Trail };

// Shared parameters
const RADIUS = 7;
const TRAIL_COUNT = 1000; // points of history per particle: ten seconds at 60 steps a second
const WRAP = false;

// Velocity vector field
const velocityField = (x: number, y: number, maxSpeed: number, t: number=1.) =>
{
  const speed = maxSpeed / Math.SQRT2;
  return [-speed*y, speed*x];
}

export default createStage({
  caption: 'Particles drifting along:\n$v = s\\,(-y, x)$',
  
  state: { maxSpeed:2, count: 2, particles: [] as Particle[] },

  setup(s, ctx) {
    const spread = () => {
      s.particles = [];
      for (let i = 0; i < s.count; i++) {
        const x = 0 + ((i + 0.5) / s.count) * 2 - 1;
        const y = 0 + ((i * 0.618034 + 0.5) % 1) * 2 - 1;
        s.particles.push({ x: x * ctx.view.halfWidth, y: y * ctx.view.halfHeight, trail: Trail.create(TRAIL_COUNT) });
      }
    };
    spread();
    ctx.controls().addBinding(s, 'maxSpeed', { label: 'Max Speed', min: 1e-6, max: 5, step: .1 });
    ctx.controls().addBinding(s, 'count', { label: 'Particles', min: 1, max: 200, step: 1 }).on('change', spread);
  },
  
  step(s, dt, ctx) {
    // Wrap a radius beyond each edge, so a particle leaves and enters fully off screen.
    const margin = ctx.view.width ? RADIUS / (ctx.view.width / 2) : 0;
    for (const p of s.particles) {
      const [vx, vy] = velocityField(p.x, p.y, s.maxSpeed, ctx.time);
      const x = p.x + vx * dt, y = p.y + vy * dt;
      p.x = WRAP ? wrap(x, ctx.view.halfWidth + margin) : x;
      p.y = WRAP ? wrap(y, ctx.view.halfHeight + margin) : y;
      // A wrap jumps across the screen; drop the old trail rather than streak across it.
      if (p.x !== x || p.y !== y) Trail.clear(p.trail);
      Trail.push(p.trail, p.x, p.y);
    }
  },
  
  viewport2d: {
    draw(sketch, s, ctx) {
      
      // Vector field
      const SPACING = 0.05;
      // Arrow length per unit of speed; at speed 0 every arrow is zero length anyway.
      const reach = (0.3 * SPACING) / s.maxSpeed;
      const { halfWidth, halfHeight } = ctx.view;
      for (let x = -halfWidth + SPACING / 2; x < halfWidth; x += SPACING) {
        for (let y = -halfHeight + SPACING / 2; y < halfHeight; y += SPACING) {
          const [vx, vy] = velocityField(x, y, s.maxSpeed, ctx.time);
          sketch.arrow(x - vx * reach, y - vy * reach, x + vx * reach, y + vy * reach, colors.gray, 1);
          sketch.circle(x - vx * reach, y - vy * reach, 1, colors.orange);
        }
      }

      // Particles
      for (const p of s.particles) sketch.trail(p.trail, { color: colors.orange, width: 1, fade: false });
      for (const p of s.particles) sketch.circle(p.x, p.y, RADIUS, colors.orange);
    },
  },
});
