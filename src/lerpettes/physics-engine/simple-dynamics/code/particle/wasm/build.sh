#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../../../../../.." && pwd)"
FRAMEWORK_SRC="$ROOT_DIR/src/lib/physics/wasm"

LOCAL_EMCC="$ROOT_DIR/.tools/emsdk/upstream/emscripten/emcc"
EMCC="${EMCC_BIN:-$(command -v emcc || true)}"
if [[ -z "$EMCC" && -x "$LOCAL_EMCC" ]]; then EMCC="$LOCAL_EMCC"; fi
if [[ -z "$EMCC" ]]; then
  echo "Error: emcc not found" >&2
  exit 1
fi

OUT_DIR="$SCRIPT_DIR/../build"
OUT_JS="$OUT_DIR/particle.js"
OUT_WASM="$OUT_DIR/particle.wasm"
OUT_TSD="$OUT_DIR/particle.d.ts"

mkdir -p "$OUT_DIR"

SRC_FILES=(
  "$SCRIPT_DIR/particle_world.cpp"
  "$FRAMEWORK_SRC/world.cpp"
  "$FRAMEWORK_SRC/bindings.cpp"
)

needs_rebuild() {
  [[ -f "$OUT_JS" && -f "$OUT_WASM" ]] || return 0
  [[ "${BASH_SOURCE[0]}" -nt "$OUT_JS" ]] && return 0
  for f in "${SRC_FILES[@]}" "$SCRIPT_DIR"/*.h "$FRAMEWORK_SRC"/*.h; do
    [[ -f "$f" ]] || continue
    [[ "$f" -nt "$OUT_JS" ]] && return 0
  done
  return 1
}

if ! needs_rebuild; then
  echo "Skipped unchanged $OUT_JS"
  exit 0
fi

"$EMCC" "${SRC_FILES[@]}" \
  -lembind \
  -O3 \
  -std=c++17 \
  -I"$FRAMEWORK_SRC" \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sALLOW_MEMORY_GROWTH=1 \
  -sENVIRONMENT=web,node \
  -sEXPORTED_RUNTIME_METHODS=HEAPF32 \
  --emit-tsd "$OUT_TSD" \
  -o "$OUT_JS"

echo "Built $OUT_JS, $OUT_WASM, $OUT_TSD"
