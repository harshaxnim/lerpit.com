import { createStage } from '@lerpit/framework/chapter';
import { colors } from '@lerpit/framework/theme';

const RADIUS = 10;

// Visual Parameters
//  Ground
const ANCHOR_Y = 0.35;
const CEILING_HALF_WIDTH = 0.2;
const HATCH_COUNT = 10;
const HATCH_LEN = 0.045;

//  Spring
const SPRING_COILS = 15;
const SPRING_AMPLITUDE = 0.045;
const SPRING_LEAD = 0.035;

export default createStage({
  caption: 'A mass attached to a spring\n$F = -k(l-l_0)$',

  state: { mass: 1, k: 20, restLength: 0.3, y: ANCHOR_Y - 0.2, v: 0, integrationScheme: 'symplectic', substeps: 3 },

  setup(s, ctx) {
    ctx.controls().addBinding(s, 'integrationScheme', {
      label: 'Scheme',
      options: { 'Symplectic Euler': 'symplectic', 'Explicit Euler': 'explicit' },
    });
    ctx.controls().addBinding(s, 'substeps', { label: 'Sub-steps', min: 1, max: 50, step: 1 });

    const energy = () => {
      const stretch = ANCHOR_Y - s.y - s.restLength;
      return 0.5 * s.k * stretch * stretch + 0.5 * s.mass * s.v * s.v;
    };
    ctx.readings().graph('E', energy, { digits: 2, keepInView: 0 });
    ctx.readings().graph('y', () => s.y);
    ctx.readings().fps();
  },

  step(s, dt) {
    for (let i = 0; i < s.substeps; i += 1) {
      const sdt = dt / s.substeps;
      // Hooke's law pulls the mass back toward the ceiling by however far the
      // spring is stretched past its rest length; gravity pulls it down.
      const stretch = ANCHOR_Y - s.y - s.restLength;
      const a = (s.k * stretch) / s.mass;
      if (s.integrationScheme === 'explicit') {
        // Explicit Euler: the mass moves with the velocity it had at the start of
        // the step, so the spring's energy grows a little every step.
        s.y += s.v * sdt;
        s.v += a * sdt;
      } else {
        // Symplectic Euler: the velocity update comes first, and the new velocity
        // is what moves the mass, so the energy oscillates around one value.
        s.v += a * sdt;
        s.y += s.v * sdt;
      }
    }
  },

  viewport2d: {
    draw(sketch, s) {
      // The ceiling: a solid bar with hatching above it (the solid side), the
      // textbook symbol for a fixed support — hatching below would read as ground.
      sketch.line(-CEILING_HALF_WIDTH, ANCHOR_Y, CEILING_HALF_WIDTH, ANCHOR_Y, colors.charcoal, 2.5);
      for (let i = 0; i <= HATCH_COUNT; i += 1) {
        const x = -CEILING_HALF_WIDTH + (i / HATCH_COUNT) * (2 * CEILING_HALF_WIDTH);
        sketch.line(x, ANCHOR_Y, x + HATCH_LEN/3, ANCHOR_Y + HATCH_LEN, colors.charcoal, 1.5);
      }

      // The spring: a zigzag between the ceiling and the mass, the textbook symbol
      // for a Hookean spring. The span is signed, so a mass pushed above the ceiling
      // still gets a coil, just pointing up, and drawn in cyan to mark the flip.
      // It hooks onto the edge of the mass facing the ceiling, not its centre: the
      // radius is in pixels, so it is turned into units first.
      const radius = RADIUS / (sketch.px(1) - sketch.px(0));
      const facing = Math.sign(ANCHOR_Y - s.y) || 1;
      const end = s.y + facing * radius;
      const span = ANCHOR_Y - end;
      const lead = Math.sign(span) * Math.min(SPRING_LEAD, Math.abs(span) / 2);
      const points: [number, number][] = [[0, ANCHOR_Y], [0, ANCHOR_Y - lead]];
      for (let i = 1; i < SPRING_COILS; i += 1) {
        const y = ANCHOR_Y - lead - ((span - 2 * lead) * i) / SPRING_COILS;
        points.push([i % 2 === 1 ? SPRING_AMPLITUDE : -SPRING_AMPLITUDE, y]);
      }
      points.push([0, end + lead], [0, end]);
      sketch.path(points, facing < 0 ? colors.light.cyan : colors.blue, 2);

      // The mass.
      sketch.circle(0, s.y, RADIUS, colors.orange);
    },
  },
});
