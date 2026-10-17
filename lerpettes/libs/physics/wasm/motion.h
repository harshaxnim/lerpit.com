#pragma once

#include "particle.h"

namespace physics {

/*
 * Two moves nearly every early chapter makes: integrate a body forward by one step, and
 * keep it inside a box by reflecting what crosses a wall. They are here so a lesson that
 * is about something else (collisions, constraints) can call them in one line; a lesson
 * that is about integration should still write its own, since that is the subject.
 *
 * Header-only and data-only, like the rest of the framework: nothing here is bound to
 * JavaScript, so including it costs a lesson nothing until it calls one.
 */

/** Explicit (forward) Euler: velocity first from the acceleration, then position. */
inline void integrate_euler(Particle& p, const Vec3& acceleration, float dt) {
  p.vel += acceleration * dt;
  p.pos += p.vel * dt;
}

/**
 * Keep a body of `radius` inside the cube [-half, half]^3. A body past a wall is put
 * back on it and its velocity along that axis is reversed and scaled by that axis's
 * restitution (1 keeps all the speed, 0 stops it dead).
 *
 * Returns which walls were hit, as bits 0-2 for x, y, z, so a caller can count bounces
 * or play a sound without re-testing.
 */
inline int bounce_in_box(Particle& p, float radius, float half, const Vec3& restitution) {
  int hit = 0;
  const float limit = half - radius;
  for (int axis = 0; axis < 3; ++axis) {
    if (p.pos[axis] > limit) {
      p.pos[axis] = limit;
      p.vel[axis] = -p.vel[axis] * restitution[axis];
      hit |= 1 << axis;
    } else if (p.pos[axis] < -limit) {
      p.pos[axis] = -limit;
      p.vel[axis] = -p.vel[axis] * restitution[axis];
      hit |= 1 << axis;
    }
  }
  return hit;
}

}
