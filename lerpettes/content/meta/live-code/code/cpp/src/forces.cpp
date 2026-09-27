// The force law for the spring. Compiled to WebAssembly in the reader's tab.

// lerpit:consts:highlight:start
static const float K = 8.0f;    // spring stiffness
static const float D = 0.02f;   // damping
// lerpit:consts:highlight:end

// lerpit:force:edit:start
// extern "C" float spring_force(float x, float v) {
//   return 0.0f;    // your turn: what pulls the bob back?
// }
// lerpit:force:edit:hint
// Hooke's law: the force is proportional to the displacement and opposes it.
// Damping takes away a little more, proportional to the velocity.
// lerpit:force:edit:solution
extern "C" float spring_force(float x, float v) {
  return -K * x - D * v;
}
// lerpit:force:edit:end
