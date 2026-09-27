// lerpit:consts:highlight:start
const k = 8;          // spring stiffness
const damping = 0.02;
// lerpit:consts:highlight:end

// lerpit:force:edit:start
// // Acceleration for the current state. Try another force law.
// export function force(s) {
//   return 0;
// }
// lerpit:force:edit:solution
export function force(s) {
  return -k * s.x - damping * s.v;
}
// lerpit:force:edit:end
