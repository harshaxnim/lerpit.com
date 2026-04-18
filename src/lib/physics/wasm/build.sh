#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
LOCAL_EMCC="$ROOT_DIR/.tools/emsdk/upstream/emscripten/emcc"
EMCC="${EMCC_BIN:-$(command -v emcc || true)}"

if [[ -z "$EMCC" && -x "$LOCAL_EMCC" ]]; then
  EMCC="$LOCAL_EMCC"
fi

if [[ -z "$EMCC" ]]; then
  echo "Error: emcc was not found. Run 'npm run setup' or install Emscripten." >&2
  exit 1
fi

SRC_DIR="$SCRIPT_DIR"
OUT_DIR="$SCRIPT_DIR/../build"
mkdir -p "$OUT_DIR"
OUT_JS="$OUT_DIR/physics.js"
OUT_WASM="$OUT_DIR/physics.wasm"
OUT_TSD="$OUT_DIR/physics.d.ts"

SRC_FILES=(
  "$SRC_DIR/world.cpp"
  "$SRC_DIR/bindings.cpp"
)

LIB_A="$OUT_DIR/libphysics.a"

needs_rebuild() {
  [[ -f "$OUT_JS" && -f "$OUT_WASM" && -f "$LIB_A" ]] || return 0
  [[ "${BASH_SOURCE[0]}" -nt "$OUT_JS" ]] && return 0
  for f in "${SRC_FILES[@]}" "$SRC_DIR"/*.h; do
    [[ -f "$f" ]] || continue
    [[ "$f" -nt "$OUT_JS" ]] && return 0
  done
  return 1
}

if ! needs_rebuild; then
  echo "  [skip] lib/physics (unchanged)"
  exit 0
fi

# Build static library for lerpettes to link against
EMAR="$(dirname "$EMCC")/emar"
"$EMCC" -c "$SRC_DIR/world.cpp" -O3 -std=c++17 -o "$OUT_DIR/world.o"
"$EMCC" -c "$SRC_DIR/bindings.cpp" -O3 -std=c++17 -o "$OUT_DIR/bindings.o"
"$EMAR" rcs "$LIB_A" "$OUT_DIR/world.o" "$OUT_DIR/bindings.o"
rm -f "$OUT_DIR/world.o" "$OUT_DIR/bindings.o"

"$EMCC" "${SRC_FILES[@]}" \
  -lembind \
  -O3 \
  -std=c++17 \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sALLOW_MEMORY_GROWTH=1 \
  -sENVIRONMENT=web,node \
  -sEXPORTED_RUNTIME_METHODS=HEAPF32 \
  --emit-tsd "$OUT_TSD" \
  -o "$OUT_JS"

echo "  [build] lib/physics → libphysics.a + physics.{js,wasm,d.ts}"
