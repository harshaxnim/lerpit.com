import { force } from './forces.js';

// Where the bob starts: one unit above the rest line, not moving.
export const state = { x: 1, v: 0 };

// Advance the state one step. Called about 60 times a second.
// s = { x, v }   dt = seconds since the last step
// lerpit:step:edit:start
// export function step(s, dt) {
//   // Use force(s) for the acceleration, then move v and x.
// }
// lerpit:step:edit:hint
// Acceleration changes the velocity, and velocity changes the position.
// Both by dt.
// lerpit:step:edit:solution
export function step(s, dt) {
  const a = force(s);
  s.v += a * dt;
  s.x += s.v * dt;
}
// lerpit:step:edit:end
