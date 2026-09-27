#include <emscripten/bind.h>
#include <vector>

using namespace emscripten;

std::vector<int32_t> fibArray = {1, 1, 2, 3, 5, 8, 13, 21};

EMSCRIPTEN_BINDINGS(fibPointer_module)
{
  emscripten::function("getFibArray", +[](){ return val(typed_memory_view(fibArray.size(), fibArray.data())); });
}