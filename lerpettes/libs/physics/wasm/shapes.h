#pragma once

#include "particle.h"

namespace physics {

/**
 * Basic shape primitives provided by the framework. Data-only — all motion
 * and interaction logic lives in the lerpette's World subclass.
 *
 * To add a new primitive: declare its data struct here (inheriting Particle
 * if it should participate in the default position-SoA renderer path),
 * then bind it in bindings.cpp. No other framework file needs to change.
 *
 * Constraints (springs, hinges, distance constraints) will follow the same
 * pattern once designed — they won't inherit Particle; they'll be a peer
 * data category tracked by World independently.
 */

struct Sphere : Particle {
  float radius{1.0f};

  Sphere() = default;
  Sphere(Vec3 start, Vec3 velocity, float r) {
    pos = start;
    vel = velocity;
    radius = r;
  }

  float getRadius() const { return radius; }
};

}
