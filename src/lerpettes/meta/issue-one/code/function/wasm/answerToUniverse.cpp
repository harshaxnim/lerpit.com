#include <emscripten/bind.h>

using namespace emscripten;

int answerToUniverse()
{
    return 42;
}

EMSCRIPTEN_BINDINGS(answerToUniverse_module)
{
  emscripten::function("answerToUniverse", &answerToUniverse);
}