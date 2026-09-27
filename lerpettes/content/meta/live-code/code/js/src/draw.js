// The picture. `g` is the sketch surface for the viewport2d panel: pixels, origin at
// the top left, y downwards, and every call takes effect this frame only. There is no
// scene to set up and nothing to clean up.

// lerpit:trail:highlight:start
// Ten seconds of history at sixty frames a second.
const TRAIL = 600;
const past = [];
// lerpit:trail:highlight:end

// lerpit:paint:highlight:start
export const viewport2d = {
  draw(g, s, ctx) {
    const midY = ctx.view.height / 2;
    const scale = Math.min(ctx.view.height / 2 - 16, 90);
    const clamp = (x) => Math.max(-2, Math.min(2, x));

    g.line(0, midY, ctx.view.width, midY, 0x5183ad, 1);

    past.push(s.x);
    if (past.length > TRAIL) past.shift();

    const stride = ctx.view.width / (TRAIL - 1);
    const trail = past.map((x, i) => [
      ctx.view.width - (past.length - 1 - i) * stride,
      midY - clamp(x) * scale
    ]);
    g.path(trail, 0x2e6da4, 1.5);

    const bobY = midY - clamp(s.x) * scale;
    g.line(48, midY, 48, bobY, 0x20313f, 1.4);
    g.circle(48, bobY, 11, 0xd17041);

    g.caption(`x = ${s.x.toFixed(3)}`);
  }
};
// lerpit:paint:highlight:end
