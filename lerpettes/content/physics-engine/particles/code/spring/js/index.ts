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
  caption: 'A mass attached to a spring\n$F = -k(x-x_0)$',

  state: { mass: 1, k: 20, b: 0, restLength: 0.3, y: ANCHOR_Y - 0.2, v: 0, integrationScheme: 'symplectic', substeps: 3 },

  setup(s, ctx) {
    ctx.controls().addBinding(s, 'integrationScheme', {
      label: 'Scheme',
      options: { 'Symplectic Euler': 'symplectic', 'Explicit Euler': 'explicit' },
      pinned: true
    });
    ctx.controls().addBinding(s, 'substeps', { label: 'Sub-steps', min: 1, max: 50, step: 1 });
    ctx.controls().addBinding(s, 'k', { label: 'Spring Constant k', min: 0, max: 50, step: 1 } );
    ctx.controls().addBinding(s, 'b', { label: 'Damping Constant b', min: 0, max: 1, step: .1 } );

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
      
      // Accumulate Forces
      const stretch = s.y - (ANCHOR_Y - s.restLength);
      const fk = -s.k * stretch;
      const fd = -s.b * s.v;
      const a = (fk + fd) / s.mass;
      
      // Integrate
      if (s.integrationScheme === 'explicit') {
        s.y += s.v * sdt;
        s.v += a * sdt;
      } else if (s.integrationScheme === 'symplectic') {
        s.v += a * sdt;
        s.y += s.v * sdt;
      }
    }
  },

  viewport2d: {
    draw(sketch, s) {
      // The ceiling
      sketch.line(-CEILING_HALF_WIDTH, ANCHOR_Y, CEILING_HALF_WIDTH, ANCHOR_Y, { color: colors.charcoal, width: 2.5 });
      for (let i = 0; i <= HATCH_COUNT; i += 1) {
        const x = -CEILING_HALF_WIDTH + (i / HATCH_COUNT) * (2 * CEILING_HALF_WIDTH);
        sketch.line(x, ANCHOR_Y, x + HATCH_LEN/3, ANCHOR_Y + HATCH_LEN, { color: colors.charcoal, width: 1.5 });
      }

      // Spring
      const radius = (RADIUS * sketch.scale) / sketch.unit;
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
      sketch.path(points, { color: facing < 0 ? colors.light.cyan : colors.blue, width: 2 });

      // Rest Length dotted line
      sketch.line(-CEILING_HALF_WIDTH, ANCHOR_Y - s.restLength, CEILING_HALF_WIDTH, ANCHOR_Y - s.restLength, { color: colors.gray, width: 1, dotted: true });

      // The mass
      sketch.circle(0, s.y, RADIUS, { color: colors.orange });
    },
  },
});
