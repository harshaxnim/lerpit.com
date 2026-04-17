#include <emscripten/bind.h>

using namespace emscripten;

int otherFavouriteNumber = 69;

EMSCRIPTEN_BINDINGS(otherFavouriteNumber_module)
{
  emscripten::constant("otherFavouriteNumberAddress", (uintptr_t)&otherFavouriteNumber);
}