import { createStage } from '@lerpit/framework/chapter';

// The particles lesson's teleportation chapter, as written there.
export default createStage({
  state: { x: 0, y: 0, t: 0, h: [] as Array<[number, number]> },
  step(s, dt) {
    s.t += dt;
    s.x = Math.sin(4 * s.t);
    s.y = Math.sin(3 * s.t);
    s.h.push([s.x, s.y]);
    if (s.h.length > 300) s.h.shift();
  },
  viewport2d: {
    draw(sketch, s, ctx) {
      const w = ctx.view.width, h = ctx.view.height;
      const scale = Math.min(w, h) / 3;
      const px = (x: number) => w / 2 + scale * x;
      const py = (y: number) => h / 2 + scale * y;
      sketch.pixels.path(s.h.map(([x, y]) => [px(x), py(y)] as [number, number]), { color: 0xd17041 });
      sketch.pixels.circle(px(s.x), py(s.y), 12, { color: 0xd17041 });
    }
  }
});
