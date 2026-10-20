import { createStage } from '@lerpit/framework/chapter';
import { colors } from '@lerpit/framework/theme';

// Shared parameters
const RADIUS = 10;
// The ceiling never moves — only the mass does — so it is a constant, not state.
const ANCHOR_Y = 0.3;
const CEILING_HALF_WIDTH = 0.2;
const HATCH_COUNT = 5;
const HATCH_LEN = 0.045;
// Kept odd, so the zigzag's interior points (SPRING_COILS - 1, even) end on
// the opposite side from where they started — a mirrored, centred coil
// rather than one that leans to whichever side it happened to start on.
const SPRING_COILS = 17;
const SPRING_AMPLITUDE = 0.045;
// A short straight run before the first coil and after the last, so the zigzag
// doesn't run flush into the ceiling or the mass.
const SPRING_LEAD = 0.035;

export default createStage({
  caption: 'A mass hanging from a spring:\n$F = k(\\Delta l) - mg$',

  // A shorter rest length than a free-floating spring would use: this one
  // reads better compact, with the coil doing the work rather than bare wire.
  state: { mass: 1, k: 20, length: 0.3, gravity: 3, y: ANCHOR_Y - 0.3, v: 0, substeps: 1 },

  setup(s, ctx) {
    ctx.controls().addBinding(s, 'mass', { label: 'Mass', min: 0.2, max: 4, step: 0.1 });
    ctx.controls().addBinding(s, 'k', { label: 'Spring k', min: 1, max: 60, step: 1 });
    ctx.controls().addBinding(s, 'length', { label: 'Rest length', min: 0.1, max: 1, step: 0.02 });
    ctx.controls().addBinding(s, 'gravity', { label: 'Gravity', min: 0, max: 10, step: 0.1 });
    ctx.controls().addBinding(s, 'substeps', { label: 'Sub-steps', min: 1, max: 50, step: 1 });

    ctx.monitors().graph('y', () => s.y).fps();
  },

  step(s, dt) {
    for (let i = 0; i < s.substeps; i += 1) {
      const sdt = dt / s.substeps;
      // Hooke's law pulls the mass back toward the ceiling by however far the
      // spring is stretched past its rest length; gravity pulls it down.
      const stretch = ANCHOR_Y - s.y - s.length;
      const a = (s.k * stretch - s.mass * s.gravity) / s.mass;
      // Semi-implicit Euler: the velocity update comes first, and the new velocity
      // is what moves the mass. Plain Euler would let a spring's energy grow with
      // every step rather than oscillate around one value.
      s.v += a * sdt;
      s.y += s.v * sdt;
    }
  },

  viewport2d: {
    draw(sketch, s) {
      // The ceiling: a solid bar with hatching above it (the solid side), the
      // textbook symbol for a fixed support — hatching below would read as ground.
      sketch.line(-CEILING_HALF_WIDTH, ANCHOR_Y, CEILING_HALF_WIDTH, ANCHOR_Y, colors.charcoal, 2.5);
      for (let i = 0; i <= HATCH_COUNT; i += 1) {
        const x = -CEILING_HALF_WIDTH + (i / HATCH_COUNT) * (2 * CEILING_HALF_WIDTH);
        sketch.line(x, ANCHOR_Y, x - HATCH_LEN, ANCHOR_Y + HATCH_LEN, colors.charcoal, 1.5);
      }

      // The spring: a zigzag between the ceiling and the mass, the textbook symbol
      // for a Hookean spring.
      const span = Math.max(0, ANCHOR_Y - s.y);
      const lead = Math.min(SPRING_LEAD, span / 2);
      const points: [number, number][] = [[0, ANCHOR_Y], [0, ANCHOR_Y - lead]];
      for (let i = 1; i < SPRING_COILS; i += 1) {
        const y = ANCHOR_Y - lead - ((span - 2 * lead) * i) / SPRING_COILS;
        points.push([i % 2 === 1 ? SPRING_AMPLITUDE : -SPRING_AMPLITUDE, y]);
      }
      points.push([0, s.y + lead], [0, s.y]);
      sketch.path(points, colors.blue, 2);

      // The mass.
      sketch.circle(0, s.y, RADIUS, colors.orange);
    },
  },
});
