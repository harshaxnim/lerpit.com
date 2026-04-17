#include <emscripten/bind.h>
#include "shapes.h"
#include "world.h"

using namespace emscripten;
using physics::Particle;
using physics::Sphere;
using physics::Vec3;
using physics::World;

EMSCRIPTEN_BINDINGS(physics_framework) {
  value_array<Vec3>("Vec3")
    .element(emscripten::index<0>())
    .element(emscripten::index<1>())
    .element(emscripten::index<2>());

  class_<Particle>("Particle")
    .constructor<>()
    .function("position", +[](const Particle& p) { return p.pos; })
    .function("velocity", +[](const Particle& p) { return p.vel; });

  class_<Sphere, base<Particle>>("Sphere")
    .constructor<>()
    .constructor<Vec3, Vec3, float>()
    .function("getRadius", &Sphere::getRadius);

  class_<World>("World")
    .constructor<>()
    .function("addParticle", &World::addParticle, allow_raw_pointers())
    .function("remove", &World::remove, allow_raw_pointers())
    .function("step", &World::step)
    .function("destroy", &World::destroy)
    .function("bodyCount", &World::bodyCount);
}
