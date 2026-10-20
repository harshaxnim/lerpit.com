// The wasm keeps its own state inside itself, so this is where its numbers come out
// into a plain object the drawing can read. `ctx.wasm` is the module you just compiled.

// `past` is the drawing's history of x, empty again on every run.
export const state = { x: 1, v: 0, past: [] };

// lerpit:bridge:edit:start
// export function step(s, dt, ctx) {
//   // Advance the module by dt, then copy x and v across.
// }
// lerpit:bridge:edit:solution
export function step(s, dt, ctx) {
  ctx.wasm.step(dt);
  s.x = ctx.wasm.get_x();
  s.v = ctx.wasm.get_v();
}
// lerpit:bridge:edit:end
