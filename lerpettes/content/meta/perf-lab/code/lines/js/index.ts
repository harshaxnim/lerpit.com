import { createStage } from '@lerpit/framework/chapter';

const N = 3000;
const COLORS = Array.from({ length: 100 }, (_, i) => `hsl(${(i * 3.6) | 0}, 60%, 45%)`);

// Three thousand spokes turning, in a hundred colours.
export default createStage({
  state: { t: 0 },
  step(s, dt) {
    s.t += dt;
  },
  viewport2d: {
    draw(sketch, s, ctx) {
      const cx = ctx.view.width / 2, cy = ctx.view.height / 2;
      const r = Math.min(cx, cy) * 0.9;
      for (let i = 0; i < N; i += 1) {
        const a = (i / N) * Math.PI * 2 + s.t * 0.3;
        const k = 0.3 + 0.7 * ((i * 37) % 100) / 100;
        sketch.pixels.line(cx, cy, cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k, COLORS[i % 100], 1);
      }
    }
  }
});
