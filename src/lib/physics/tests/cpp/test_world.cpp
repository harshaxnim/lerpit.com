#include "test_harness.h"
#include "../../wasm/world.h"

using namespace physics;

namespace {

struct EulerWorld : World {
  int stepCallCount = 0;

  void step(float dt) override {
    ++stepCallCount;
    for (Particle* p : particles()) {
      p->pos[0] += p->vel[0] * dt;
      p->pos[1] += p->vel[1] * dt;
      p->pos[2] += p->vel[2] * dt;
    }
  }
};

}

TEST(world_starts_empty) {
  World w;
  CHECK_EQ(w.bodyCount(), 0u);
}

TEST(world_addParticle_tracks_and_returns_pointer) {
  World w;
  auto* a = new Particle();
  auto* ret = w.addParticle(a);
  CHECK(ret == a);
  CHECK_EQ(w.bodyCount(), 1u);
  w.addParticle(new Particle());
  CHECK_EQ(w.bodyCount(), 2u);
}

TEST(world_addParticle_null_is_noop) {
  World w;
  CHECK(w.addParticle(nullptr) == nullptr);
  CHECK_EQ(w.bodyCount(), 0u);
}

TEST(world_remove_decrements_and_deletes) {
  World w;
  auto* a = new Particle();
  auto* b = new Particle();
  w.addParticle(a);
  w.addParticle(b);
  w.remove(a);
  CHECK_EQ(w.bodyCount(), 1u);
  w.remove(b);
  CHECK_EQ(w.bodyCount(), 0u);
}

TEST(world_remove_unknown_is_noop) {
  World w;
  Particle stray;
  w.remove(&stray);
  w.remove(nullptr);
  CHECK_EQ(w.bodyCount(), 0u);
}

TEST(base_world_step_is_noop) {
  World w;
  auto* p = new Particle();
  p->vel = {1.0f, 2.0f, 3.0f};
  w.addParticle(p);
  w.step(0.5f);
  CHECK_APPROX(p->pos[0], 0.0f, 1e-6);
  CHECK_APPROX(p->pos[1], 0.0f, 1e-6);
  CHECK_APPROX(p->pos[2], 0.0f, 1e-6);
}

TEST(subclass_step_dispatches_through_virtual) {
  EulerWorld w;
  auto* a = new Particle();
  a->vel = {0.0f, 1.0f, 0.0f};
  w.addParticle(a);

  World& base = w;
  for (int i = 0; i < 10; ++i) base.step(0.1f);

  CHECK_EQ(w.stepCallCount, 10);
  CHECK_APPROX(a->pos[1], 1.0f, 1e-5);
}

TEST(subclass_step_updates_particle_pos_directly) {
  EulerWorld w;
  auto* a = new Particle();
  a->vel = {1.0f, 0.0f, 0.0f};
  w.addParticle(a);
  auto* b = new Particle();
  b->pos = {10.0f, 0.0f, 0.0f};
  b->vel = {0.0f, 1.0f, 0.0f};
  w.addParticle(b);

  w.step(1.0f);

  CHECK_APPROX(a->pos[0], 1.0f, 1e-6);
  CHECK_APPROX(a->pos[1], 0.0f, 1e-6);
  CHECK_APPROX(b->pos[0], 10.0f, 1e-6);
  CHECK_APPROX(b->pos[1], 1.0f, 1e-6);
}

TEST(world_destroy_clears_bodies) {
  World w;
  w.addParticle(new Particle());
  w.addParticle(new Particle());
  w.destroy();
  CHECK_EQ(w.bodyCount(), 0u);
}
