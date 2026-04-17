#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <vector>

using namespace emscripten;

struct Vec3View {
  double* ptr;
  double& x() { return ptr[0]; }
  double& y() { return ptr[1]; }
  double& z() { return ptr[2]; }
};

struct Spheres;

struct SphereView {
  Spheres& data;
  int i;

  int32_t& index();
  double&  r();
  Vec3View pos();
  Vec3View vel();
};

struct Spheres {
  std::vector<int32_t> indices;
  std::vector<double>  radii;
  std::vector<double>  positions;
  std::vector<double>  velocities;

  int count() const { return indices.size(); }
  SphereView view(int i) { return {*this, i}; }

  val getIndices()    { return val(typed_memory_view(indices.size(),    indices.data())); }
  val getRadii()      { return val(typed_memory_view(radii.size(),      radii.data())); }
  val getPositions()  { return val(typed_memory_view(positions.size(),  positions.data())); }
  val getVelocities() { return val(typed_memory_view(velocities.size(), velocities.data())); }
};

int32_t& SphereView::index() { return data.indices[i]; }
double&  SphereView::r()     { return data.radii[i]; }
Vec3View SphereView::pos()   { return {&data.positions[i * 3]}; }
Vec3View SphereView::vel()   { return {&data.velocities[i * 3]}; }

Spheres spheres = {
  {0, 1, 2},
  {1.0, 2.0, 0.5},
  {0.,0.,0.,  3.,0.,0.,  0.,5.,0.},
  {0.1,0.,0., 0.,0.2,0., 0.,0.,0.3},
};

EMSCRIPTEN_BINDINGS(soa_module) {
  class_<Spheres>("Spheres")
    .function("count",         &Spheres::count)
    .function("getIndices",    &Spheres::getIndices)
    .function("getRadii",      &Spheres::getRadii)
    .function("getPositions",  &Spheres::getPositions)
    .function("getVelocities", &Spheres::getVelocities);

  function("getSpheres", +[]() -> Spheres* { return &spheres; }, allow_raw_pointers());
}
