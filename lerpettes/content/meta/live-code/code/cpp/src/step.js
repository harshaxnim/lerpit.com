// The wasm keeps its own state inside itself, so this is where its numbers come out
// into a plain object the drawing can read. `wasm` is the module you just compiled.

export const state = { x: 1, v: 0 };

// lerpit:bridge:edit:start
// export function step(s, dt, wasm) {
//   // Advance the module by dt, then copy x and v across.
// }
// lerpit:bridge:edit:solution
export function step(s, dt, wasm) {
  wasm.step(dt);
  s.x = wasm.get_x();
  s.v = wasm.get_v();
}
// lerpit:bridge:edit:end
