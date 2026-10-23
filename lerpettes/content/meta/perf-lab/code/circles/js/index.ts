import { createStage } from '@lerpit/framework/chapter';
import { randomColor } from '@lerpit/framework/theme';

const N = 1000;
// Picked once, by index, from the collection's palette (control.toml's `palette`).
const COLORS = Array.from({ length: N }, (_, i) => randomColor(i, { from: 'collection' }));

// A thousand circles on Lissajous paths, each with its own phase.
export default createStage({
  state: { t: 0 },
  step(s, dt) {
    s.t += dt;
  },
  viewport2d: {
    draw(sketch, s, ctx) {
      const w = ctx.view.width, h = ctx.view.height;
      for (let i = 0; i < N; i += 1) {
        const a = s.t * (0.5 + (i % 7) * 0.1) + i;
        sketch.pixels.circle(w / 2 + Math.sin(a * 1.3) * w * 0.45, h / 2 + Math.cos(a) * h * 0.45, 3 + (i % 5), { color: COLORS[i] });
      }
    }
  }
});
