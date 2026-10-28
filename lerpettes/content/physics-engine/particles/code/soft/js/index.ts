import { createStage } from '@lerpit/framework/chapter';
import { colors } from '@lerpit/framework/theme';

type Particle = { x: number; y: number; vx: number; vy: number; fx: number; fy: number; m: number };
type Spring = { p: Particle; q: Particle; rest: number };

const RADIUS = 0.3; // the outer ring
const INNER = 0.1; // the first ring, kept away from the center so its particles don't crowd
const RINGS = 3;
const SPOKES = 9;

// The path the center follows
const BOTTOM = -0.6;
const TOP = 0.6;
const MOVE_TIME = 1; // seconds to go from one end to the other
const HOLD_TIME = 0.6; // seconds to wait at each end

// A web: a center particle and rings of particles round it, one on each spoke. Springs run
// out along each spoke, round each ring, and across both diagonals of each box between two
// rings and two spokes, so a box cannot shear. The center follows the path; the rest are free.
function makeWeb() {
  const center: Particle = { x: 0, y: BOTTOM, vx: 0, vy: 0, fx: 0, fy: 0, m: 1 };
  const rings: Particle[][] = [];
  for (let ring = 0; ring < RINGS; ring += 1) {
    const r = INNER + (ring / (RINGS - 1)) * (RADIUS - INNER);
    const particles: Particle[] = [];
    for (let spoke = 0; spoke < SPOKES; spoke += 1) {
      const angle = Math.PI / 2 + (spoke * 2 * Math.PI) / SPOKES; // the first spoke points up
      particles.push({ x: r * Math.cos(angle), y: BOTTOM + r * Math.sin(angle), vx: 0, vy: 0, fx: 0, fy: 0, m: 1 });
    }
    rings.push(particles);
  }

  const springs: Spring[] = [];
  for (let ring = 0; ring < RINGS; ring += 1) {
    for (let spoke = 0; spoke < SPOKES; spoke += 1) {
      const next = (spoke + 1) % SPOKES;
      const p = rings[ring][spoke];
      springs.push({ p, q: rings[ring][next], rest: 0 }); // round the ring
      if (ring === 0) {
        springs.push({ p, q: center, rest: 0 }); // the spoke's first stretch
        continue;
      }
      const inner = rings[ring - 1];
      springs.push({ p, q: inner[spoke], rest: 0 }); // out along the spoke
      springs.push({ p, q: inner[next], rest: 0 }); // the box's diagonals
      springs.push({ p: rings[ring][next], q: inner[spoke], rest: 0 });
    }
  }

  return { center, points: rings.flat(), springs };
}

// Speeds up from the bottom, stops dead at the top, waits, then the same on the way down.
function centerY(t: number) {
  const period = 2 * (MOVE_TIME + HOLD_TIME);
  const time = t % period;
  const height = TOP - BOTTOM;

  if (time < MOVE_TIME) {
    const u = time / MOVE_TIME;
    return BOTTOM + height * u * u;
  }
  if (time < MOVE_TIME + HOLD_TIME) return TOP;
  if (time < 2 * MOVE_TIME + HOLD_TIME) {
    const u = (time - MOVE_TIME - HOLD_TIME) / MOVE_TIME;
    return TOP - height * u * u;
  }
  return BOTTOM;
}

export default createStage({
  caption: 'A web of springs to simulate soft bodies',

  state: () => ({ ...makeWeb(), k: 400, kd: 1, stepMs: 1.7, leftover: 0, time: 0 }),

  setup(s, ctx) {
    for (const spring of s.springs) {
      spring.rest = Math.hypot(spring.q.x - spring.p.x, spring.q.y - spring.p.y);
    }

    ctx.controls().addBinding(s, 'stepMs', { label: 'Step Size $\\Delta t$ (ms)', min: 0.2, max: 20, step: 0.1 });
    ctx.controls().addBinding(s, 'k', { label: "Spring Constant $k_s$", min: 0, max: 1000, step: 10 });
    ctx.controls().addBinding(s, 'kd', { label: 'Damping Constant $k_d$', min: 0, max: 5, step: 0.1 });
    ctx.readings().fps();
  },

  step(s, dt) {
    // Steps of the same length whatever the frame rate; time short of a whole step waits for the next frame.
    const sdt = s.stepMs / 1000;
    s.leftover += dt;

    while (s.leftover >= sdt) {
      s.leftover -= sdt;

      // Move the center along its path
      s.time += sdt;
      const y = centerY(s.time);
      s.center.vy = (y - s.center.y) / sdt;
      s.center.y = y;

      // Accumulate Forces
      for (const p of s.points) {
        p.fx = 0;
        p.fy = 0;
      }
      for (const { p, q, rest } of s.springs) {
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const length = Math.hypot(dx, dy);
        const dvx = q.vx - p.vx;
        const dvy = q.vy - p.vy;

        const fk = s.k * (length / rest - 1);
        const fd = s.kd * (dvx * dx + dvy * dy) / (rest * length);
        const fx = (fk + fd) * (dx / length);
        const fy = (fk + fd) * (dy / length);

        p.fx += fx;
        p.fy += fy;
        q.fx -= fx;
        q.fy -= fy;
      }

      // Integrate
      for (const p of s.points) {
        const ax = p.fx / p.m;
        const ay = p.fy / p.m;
        p.vx += ax * sdt;
        p.vy += ay * sdt;
        p.x += p.vx * sdt;
        p.y += p.vy * sdt;
      }
    }
  },

  viewport2d: {
    draw(sketch, s) {
      // The center's path
      sketch.line(0, BOTTOM, 0, TOP, { color: colors.gray, width: 1, dotted: true });

      // Springs: red when stretched, blue when squashed
      for (const { p, q, rest } of s.springs) {
        const strain = Math.hypot(q.x - p.x, q.y - p.y) / rest - 1;
        let color = colors.gray;
        if (strain > 0.01) color = colors.red;
        if (strain < -0.01) color = colors.blue;
        sketch.line(p.x, p.y, q.x, q.y, { color, width: 1.5 });
      }

      for (const p of s.points) sketch.circle(p.x, p.y, 2.5, { color: colors.orange });
      sketch.circle(s.center.x, s.center.y, 5, { color: colors.teal });
    },
  },
});
