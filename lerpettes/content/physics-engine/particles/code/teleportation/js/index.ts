import { createStage } from '@lerpit/framework/chapter';
import { colors } from '@lerpit/framework/theme';
import { Trail } from '@lerpit/framework/trail';

// A starting point: a ball on a spring. Replace it with this chapter's own code.
export default createStage({
  caption: 'A particle on the function:\n$(x,y) = (sin(4t), sin(3t))$',
  state: { x: 0, y: 0, t: 0, h: Trail.create(500), skip: 0, count: 0 },
  setup(s, ctx) {
    let previous = s.skip;
    const clearMaybe = () => {
      if (previous > 0 && s.skip === 0) {
        Trail.clear(s.h);
      }
      previous = s.skip;
    };
    ctx.controls().addBinding(s, 'skip', { label: 'Step Size', min: 1, max: 10, step: 1 }).on('change', clearMaybe);
    ctx.readings().text('pos', ()=>`(${s.x.toFixed(1)}, ${s.y.toFixed(1)})`);
    ctx.readings().fps();
  },
  step(s, dt) {
    s.t += dt;
    if (s.count < (s.skip-1)) {
      s.count += 1;
      return;
    }
    s.count = 0;
    s.x = Math.sin(4*s.t);
    s.y = Math.sin(3*s.t);
    Trail.push(s.h, s.x, s.y);
  },
  viewport2d: {
    draw(sketch, s, ctx) {
      const k = 0.65 * Math.min(1, ctx.view.halfHeight);
      if (s.skip == 0)
      {
        sketch.trail(s.h.points.map(([x, y]) => [k * x, k * y] as [number, number]), { color: colors.orange, width: 2, fade: true});
      }
      else
      {
        sketch.trail(s.h.points.map(([x, y]) => [k * x, k * y] as [number, number]), { color: colors.orange, width: 2, fade: true, style: 'dots'});
      }

      sketch.circle(k * s.x, k * s.y, 12, { color: colors.orange });
    }
  }
});