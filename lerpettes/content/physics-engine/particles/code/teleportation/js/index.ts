import { createStage } from '@lerpit/framework/chapter';
import { colors } from '@lerpit/framework/theme';
import { Trail } from '@lerpit/framework/trail';

// A starting point: a ball on a spring. Replace it with this chapter's own code.
export default createStage({
  caption: 'A particle on the function:\n$(x,y) = (sin(4t), sin(3t))$',
  state: { x: 0, y: 0, t: 0, h: Trail.create(500) },
  setup(s, ctx) {
    ctx.monitors().text('pos', ()=>`(${s.x.toFixed(1)}, ${s.y.toFixed(1)})`).fps();
  },
  step(s, dt) {
    s.t += dt;
    s.x = Math.sin(4*s.t);
    s.y = Math.sin(3*s.t);
    Trail.push(s.h, s.x, s.y);
  },
  viewport2d: {
    draw(sketch, s, ctx) {
      // The curve spans -1..1 both ways; shrink it to fit the panel's shorter side.
      const k = 0.65 * Math.min(1, ctx.view.halfHeight);
      sketch.trail(s.h.points.map(([x, y]) => [k * x, k * y]), { color: colors.orange, width: 1 });
      sketch.circle(k * s.x, k * s.y, 12, colors.orange);
    }
  }
});
