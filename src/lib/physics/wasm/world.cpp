#include "world.h"
#include <algorithm>

namespace physics {

Particle* World::addParticle(Particle* p) {
  if (!p) return nullptr;
  bodies_.push_back(p);
  return p;
}

void World::remove(Particle* p) {
  if (!p) return;
  auto it = std::find(bodies_.begin(), bodies_.end(), p);
  if (it == bodies_.end()) return;
  bodies_.erase(it);
  delete p;
}

void World::destroy() {
  for (Particle* p : bodies_) {
    delete p;
  }
  bodies_.clear();
}

}
