#include <emscripten/bind.h>

float lerp_f32(float a, float b, float t) {
  return a + (b - a) * t;
}

EMSCRIPTEN_BINDINGS(lerp_demo_module) {
  emscripten::function("lerp_f32", &lerp_f32);
}
