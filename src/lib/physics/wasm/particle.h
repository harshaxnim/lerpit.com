#pragma once

#include <array>

namespace physics {

using Vec3 = std::array<float, 3>;

/**
 * Data-only base class. Derive for lerpette-specific bodies (e.g. to add
 * radius, mass, charge). No simulation logic lives here — the World decides
 * how to advance its particles.
 */
struct Particle {
  Vec3 pos{0.0f, 0.0f, 0.0f};
  Vec3 vel{0.0f, 0.0f, 0.0f};

  Particle() = default;
  virtual ~Particle() = default;
};

}
