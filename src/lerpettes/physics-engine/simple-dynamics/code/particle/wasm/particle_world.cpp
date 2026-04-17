// Lerpette-specific World subclass. Uses the framework's built-in
// Sphere shape; all motion logic — here, explicit Euler — lives in step().
// The framework has no opinion about how particles move.
#include <emscripten/bind.h>
#include "particle.h"
#include "world.h"

using namespace emscripten;
using physics::Particle;
using physics::World;

namespace lerpette {

class ParticleWorld : public World {
public:
  void step(float dt) override {
    for (Particle* p : particles()) {
      // p->pos[0] += p->vel[0] * dt;
      // p->pos[1] += p->vel[1] * dt;
      // p->pos[2] += p->vel[2] * dt;
    }
  }
};

}

EMSCRIPTEN_BINDINGS(lerpette_particle_step) {
  class_<lerpette::ParticleWorld, base<World>>("ParticleWorld")
    .constructor<>();
}
