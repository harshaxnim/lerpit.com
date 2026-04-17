#include "test_harness.h"
#include "../../wasm/shapes.h"

using namespace physics;

TEST(sphere_stores_position_velocity_radius) {
  Sphere s({1.0f, 2.0f, 3.0f}, {0.5f, -0.25f, 0.0f}, 2.5f);
  CHECK_APPROX(s.pos[0], 1.0f, 1e-6);
  CHECK_APPROX(s.pos[1], 2.0f, 1e-6);
  CHECK_APPROX(s.vel[0], 0.5f, 1e-6);
  CHECK_APPROX(s.getRadius(), 2.5f, 1e-6);
}

TEST(sphere_is_a_particle) {
  // Contract: a Sphere* is accepted anywhere a Particle* is expected.
  // This keeps the World / renderer path uniform across shape types.
  Sphere s{};
  Particle* p = &s;
  p->pos = {9.0f, 0.0f, 0.0f};
  CHECK_APPROX(s.pos[0], 9.0f, 1e-6);
}
