#include <emscripten/bind.h>
#include <iostream>
#include "particle.h"
#include "world.h"
#include "shapes.h"

#include "linalg.h"

using namespace emscripten;
using physics::Particle;
using physics::Sphere;
using physics::World;
using physics::Vec3;

namespace {
double distanceSquared(Vec3 p1, Vec3 p2) {
  return (p1[0] - p2[0]) * (p1[0] - p2[0]) +
         (p1[1] - p2[1]) * (p1[1] - p2[1]) +
         (p1[2] - p2[2]) * (p1[2] - p2[2]);
}
}


namespace lerpette {

class ParticleWorld : public World {
public:
  void setballRestitution(float v) { ballsRestitution = v; }
  void setfloorRestitution(float v) { floorRestitution = v; }

  void step(float dt) override {
    for (int i = 0; i < particles().size(); i++) {
      Particle* p = particles()[i];
      Sphere* s = static_cast<Sphere*>(p);

      // Apply gravity
      p->vel[1] -= 9.81 * dt;

      p->pos[0] += p->vel[0] * dt;
      p->pos[1] += p->vel[1] * dt;
      p->pos[2] += p->vel[2] * dt;

      // Handle collisions with other particles
      for (int j = i+1; j < particles().size(); j++) {
        Particle* p1 = particles()[i];
        Sphere* s1 = static_cast<Sphere*>(p1);
        Particle* p2 = particles()[j];
        Sphere* s2 = static_cast<Sphere*>(p2);
        
        // Test for collision
        float distance = linalg::distance(p1->pos, p2->pos);
        float correction = (s1->radius + s2->radius) - distance;
        if (correction > 0) {
          // Handle collision
          Vec3 normal = linalg::normalize(p2->pos - p1->pos);
          
          // update positions
          p1->pos = p1->pos - normal * correction * 0.5f;
          p2->pos = p2->pos + normal * correction * 0.5f;

          // calculate velocity along the normal
          float v1n = linalg::dot(p1->vel, normal);
          float v2n = linalg::dot(p2->vel, normal);
          
          // assume mass of 1 for now, update velocities after collision
          float newV1n = (v1n + v2n - (v1n - v2n) * ballsRestitution) / 2;
          float newV2n = (v1n + v2n - (v2n - v1n) * ballsRestitution) / 2;

          p1->vel = p1->vel + normal * (newV1n - v1n);
          p2->vel = p2->vel + normal * (newV2n - v2n);          
        }
      }

      // Bounce off the walls
      if (p->pos[0]+(s->radius+0.01) > 1. || p->pos[0]-(s->radius+0.01) < -1.) {
        p->vel[0] *= -wallRestitution;
        if (p->pos[0] > 0) {
          p->pos[0] = 1. - (s->radius+0.01);
        } else {
          p->pos[0] = -1. + (s->radius+0.01);
        }
      }
      if (p->pos[1]+(s->radius+0.01) > 1. || p->pos[1]-(s->radius+0.01) < -1.) {
        p->vel[1] *= -ballsRestitution;
        if (p->pos[1] > 0) {
          p->pos[1] = 1. - (s->radius+0.01);
        } else {
          p->pos[1] = -1. + (s->radius+0.01);
        }
      }
      if (p->pos[2]+(s->radius+0.01) > 1. || p->pos[2]-(s->radius+0.01) < -1.) {
        p->vel[2] *= -wallRestitution;
        if (p->pos[2] > 0) {
          p->pos[2] = 1. - (s->radius+0.01);
        } else {
          p->pos[2] = -1. + (s->radius+0.01);
        }
      }
    }
  }

private:
  float ballsRestitution = 0.35f;
  float floorRestitution = 0.95f;
  float wallRestitution = 0.95f;
};

}

EMSCRIPTEN_BINDINGS(lerpette_particle_step) {
  class_<lerpette::ParticleWorld, base<World>>("ParticleWorld")
    .constructor<>()
    .function("setballRestitution", &lerpette::ParticleWorld::setballRestitution)
    .function("setfloorRestitution", &lerpette::ParticleWorld::setfloorRestitution);
}
