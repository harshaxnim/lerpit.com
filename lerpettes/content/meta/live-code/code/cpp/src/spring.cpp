// lerpit:decls:hide:start
// The names the page calls every frame. Keep them as they are.
extern "C" {
  float spring_force(float x, float v);   // lives in forces.cpp

  void  reset_state(float x0);
  void  step(float dt);
  float get_x();
  float get_v();
}
// lerpit:decls:hide:end

static float X = 1.0f;
static float V = 0.0f;

void reset_state(float x0) { X = x0; V = 0.0f; }

// lerpit:integrate:edit:start
// void step(float dt) {
//   // Advance X and V by dt, using spring_force for the acceleration.
// }
// lerpit:integrate:edit:solution
void step(float dt) {
  float a = spring_force(X, V);
  V += a * dt;
  X += V * dt;
}
// lerpit:integrate:edit:end

float get_x() { return X; }
float get_v() { return V; }
