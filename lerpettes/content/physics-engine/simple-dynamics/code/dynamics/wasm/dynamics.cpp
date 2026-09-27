#include <emscripten/bind.h>
#include "particle.h"
#include "shapes.h"
#include "world.h"

using namespace emscripten;
using physics::Particle;
using physics::Sphere;
using physics::World;

namespace lerpette {

class ParticleWorld : public World {
public:
  void step(float dt) override {
    for (Particle* p : particles()) {
      Sphere* s = static_cast<Sphere*>(p);
      p->pos[0] += p->vel[0] * dt;
      p->pos[1] += p->vel[1] * dt;
      p->pos[2] += p->vel[2] * dt;

      if (p->pos[0]+(s->radius+0.01) > 1.) {
        p->vel[0] *= -1.;
      }
      if (p->pos[0]-(s->radius+0.01) < -1.) {
        p->vel[0] *= -1.;
      }
    }
  }
};

}

EMSCRIPTEN_BINDINGS(lerpette_particle_step) {
  class_<lerpette::ParticleWorld, base<World>>("ParticleWorld")
    .constructor<>();
}
