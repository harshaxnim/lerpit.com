import { defineChapter } from '@lerpit/framework/chapter';

// A starting point: a ball on a spring. Replace it with this chapter's own code.
export default defineChapter({
  caption: 'A particle moving along a function.',
  state: { x: 0, y: 0, t: 0, h: []},
  step(s, dt) {
    s.t += dt;
    s.x = Math.sin(4*s.t);
    s.y = Math.sin(3*s.t);
    s.h.push([s.x, s.y]);
    if (s.h.length > 300) s.h.shift();
  },
  viewport2d: {
    draw(g, s, ctx) {
      const w = ctx.view.width, h=ctx.view.height;
      const scale = Math.min(w,h)/3;
      const px = (x: number) => (w/2 + scale * x);
      const py = (y: number) => (h/2 + scale * y);
      g.path(s.h.map(([x, y]) => [px(x), py(y)]), 0xd17041);
      g.circle(px(s.x), py(s.y), 12, 0xd17041);
    }
  }
});
