#include "test_harness.h"
#include "../../wasm/motion.h"

using namespace physics;

TEST(integrate_euler_updates_velocity_then_position) {
  Particle p;
  p.vel = {1.0f, 0.0f, 0.0f};
  integrate_euler(p, {0.0f, -10.0f, 0.0f}, 0.1f);
  CHECK_APPROX(p.vel[1], -1.0f, 1e-6);
  CHECK_APPROX(p.pos[0], 0.1f, 1e-6);
  // Position used the new velocity: semi-implicit order.
  CHECK_APPROX(p.pos[1], -0.1f, 1e-6);
}

TEST(bounce_in_box_reflects_and_scales_velocity) {
  Particle p;
  p.pos = {0.0f, -1.2f, 0.0f};
  p.vel = {0.0f, -2.0f, 0.0f};
  int hit = bounce_in_box(p, 0.1f, 1.0f, {1.0f, 0.5f, 1.0f});
  CHECK_EQ(hit, 2);
  CHECK_APPROX(p.pos[1], -0.9f, 1e-6);
  CHECK_APPROX(p.vel[1], 1.0f, 1e-6);
}

TEST(bounce_in_box_leaves_inside_bodies_alone) {
  Particle p;
  p.pos = {0.2f, 0.3f, -0.4f};
  p.vel = {1.0f, 1.0f, 1.0f};
  CHECK_EQ(bounce_in_box(p, 0.1f, 1.0f, {1.0f, 1.0f, 1.0f}), 0);
  CHECK_APPROX(p.vel[0], 1.0f, 1e-6);
}
