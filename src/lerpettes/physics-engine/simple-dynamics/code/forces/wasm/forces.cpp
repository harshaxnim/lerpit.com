#include <emscripten/bind.h>
#include "particle.h"
#include "world.h"
#include "shapes.h"

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

      // Apply gravity
      p->vel[1] -= 9.81 * dt;

      // Bounce off the walls
      if (p->pos[0]+(s->radius+0.01) > 1. || p->pos[0]-(s->radius+0.01) < -1.) {
        p->vel[0] *= -.95;
        if (p->pos[0] > 0) {
          p->pos[0] = 1. - (s->radius+0.01);
        } else {
          p->pos[0] = -1. + (s->radius+0.01);
        }
      }
      if (p->pos[1]+(s->radius+0.01) > 1. || p->pos[1]-(s->radius+0.01) < -1.) {
        p->vel[1] *= -.95;
        if (p->pos[1] > 0) {
          p->pos[1] = 1. - (s->radius+0.01);
        } else {
          p->pos[1] = -1. + (s->radius+0.01);
        }
      }
      if (p->pos[2]+(s->radius+0.01) > 1. || p->pos[2]-(s->radius+0.01) < -1.) {
        p->vel[2] *= -.95;
        if (p->pos[2] > 0) {
          p->pos[2] = 1. - (s->radius+0.01);
        } else {
          p->pos[2] = -1. + (s->radius+0.01);
        }
      }
    }
  }
};

}

EMSCRIPTEN_BINDINGS(lerpette_particle_step) {
  class_<lerpette::ParticleWorld, base<World>>("ParticleWorld")
    .constructor<>();
}
