#include <emscripten/bind.h>
#include <vector>

using namespace emscripten;

struct Vec3 {
  double x = 0., y = 0., z = 0.;
};

struct Sphere {
  int index = 0;
  double radius = 1.;
  Vec3 pos;
  Vec3 vel;
};

std::vector<Sphere> spheres = {
  {0, 1.0, {0., 0., 0.}, {0.1, 0., 0.}},
  {1, 2.0, {3., 0., 0.}, {0., 0.2, 0.}},
  {2, 0.5, {0., 5., 0.}, {0., 0., 0.3}},
};

EMSCRIPTEN_BINDINGS(aos_module) {
  value_object<Vec3>("Vec3")
    .field("x", &Vec3::x)
    .field("y", &Vec3::y)
    .field("z", &Vec3::z);

  value_object<Sphere>("Sphere")
    .field("index", &Sphere::index)
    .field("radius", &Sphere::radius)
    .field("pos", &Sphere::pos)
    .field("vel", &Sphere::vel);

  register_vector<Sphere>("SphereVector");

  function("getSpheres", +[]() { return spheres; });
  function("getSphereCount", +[]() -> int { return spheres.size(); });
}
