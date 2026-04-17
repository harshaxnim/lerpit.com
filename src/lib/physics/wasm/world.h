#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>
#include "particle.h"

namespace physics {

class World {
public:
  World() = default;
  virtual ~World() { destroy(); }

  World(const World&) = delete;
  World& operator=(const World&) = delete;

  Particle* addParticle(Particle* p);
  void remove(Particle* p);
  void destroy();

  virtual void step(float dt) { (void)dt; }

  std::size_t bodyCount() const { return bodies_.size(); }
  const std::vector<Particle*>& particles() const { return bodies_; }

private:
  std::vector<Particle*> bodies_;
};

}
