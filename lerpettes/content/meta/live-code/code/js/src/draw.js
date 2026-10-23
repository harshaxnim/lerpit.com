// The picture. `sketch` is the drawing surface for the viewport2d panel, and every call
// takes effect this frame only. There is no scene to set up and nothing to clean up.
// `sketch.pixels` takes pixels, origin at the top left, y downwards, which suits a
// strip chart pinned to the panel's edges.

// lerpit:trail:highlight:start
// Ten seconds of history at sixty frames a second. The history itself is `s.past`, in
// the state, so a restart clears it along with everything else.
const TRAIL = 600;
// lerpit:trail:highlight:end

// lerpit:paint:highlight:start
export const viewport2d = {
  draw(sketch, s, ctx) {
    const midY = ctx.view.height / 2;
    const scale = Math.min(ctx.view.height / 2 - 16, 90);
    const clamp = (x) => Math.max(-2, Math.min(2, x));

    sketch.pixels.line(0, midY, ctx.view.width, midY, { color: 0x5183ad, width: 1 });

    const past = s.past;
    past.push(s.x);
    if (past.length > TRAIL) past.shift();

    const stride = ctx.view.width / (TRAIL - 1);
    const trail = past.map((x, i) => [
      ctx.view.width - (past.length - 1 - i) * stride,
      midY - clamp(x) * scale
    ]);
    sketch.pixels.path(trail, { color: 0x2e6da4, width: 1.5 });

    const bobY = midY - clamp(s.x) * scale;
    sketch.pixels.line(48, midY, 48, bobY, { color: 0x20313f, width: 1.4 });
    sketch.pixels.circle(48, bobY, 11, { color: 0xd17041 });

    sketch.caption(`x = ${s.x.toFixed(3)}`);
  }
};
// lerpit:paint:highlight:end
