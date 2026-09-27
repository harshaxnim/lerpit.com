// A second panel on the same state. Nothing here knows the viewport exists, and the
// viewport does not know about this: both are handed the same `s` and show it their
// own way. Adding this file is the whole cost of adding a panel to a chapter.

export const readout = {
  draw(out, s, ctx) {
    out.line(`t  = ${ctx.time.toFixed(2)} s`);
    out.line(`x  = ${s.x.toFixed(4)}`);
    out.line(`v  = ${s.v.toFixed(4)}`);
    out.line('');
    out.line(`energy = ${(0.5 * s.v * s.v + 0.5 * s.x * s.x).toFixed(4)}`);
  }
};
