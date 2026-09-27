#include <emscripten/bind.h>

using namespace emscripten;

struct Vec3
{
  double x = 0.;
  double y = 0.;
  double z = 0.;
};

struct Sphere
{
  int index = 0;
  double radius = 2.;
  Vec3 pos;
  Vec3 vel;
};

Sphere mySphere = {0, 2., {1., 2., 3.}, {0., 0.1, 0.}};

EMSCRIPTEN_BINDINGS(sphere_module)
{
  value_object<Vec3>("Vec3")
    .field("x", &Vec3::x)
    .field("y", &Vec3::y)
    .field("z", &Vec3::z);

  value_object<Sphere>("Sphere")
    .field("index", &Sphere::index)
    .field("radius", &Sphere::radius)
    .field("pos", &Sphere::pos)
    .field("vel", &Sphere::vel);

  function("getDefaultSphere", +[]() { return mySphere; });
}
