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

# These sources are C++. emcc links as C, so from Emscripten 4 on it fails with
# "undefined symbol: typeinfo for float"; em++ links libc++/libc++abi.
EMXX="${EMXX_BIN:-$(dirname "$EMCC")/em++}"
if [[ ! -x "$EMXX" ]]; then
  EMXX="$(command -v em++ || true)"
fi

if [[ -z "$EMXX" || ! -x "$EMXX" ]]; then
  echo "Error: em++ was not found next to $EMCC." >&2
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
  echo "  [skip] libs/physics (unchanged)"
  exit 0
fi

# Build static library for lerpettes to link against
EMAR="$(dirname "$EMXX")/emar"
"$EMXX" -c "$SRC_DIR/world.cpp" -O3 -std=c++17 -o "$OUT_DIR/world.o"
"$EMXX" -c "$SRC_DIR/bindings.cpp" -O3 -std=c++17 -o "$OUT_DIR/bindings.o"
"$EMAR" rcs "$LIB_A" "$OUT_DIR/world.o" "$OUT_DIR/bindings.o"
rm -f "$OUT_DIR/world.o" "$OUT_DIR/bindings.o"

LINK_ARGS=(
  -lembind
  -O3
  -std=c++17
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sALLOW_MEMORY_GROWTH=1
  -sENVIRONMENT=web,node
  -sEXPORTED_RUNTIME_METHODS=HEAPF32
)

# --emit-tsd is best-effort, same as the lerpette step modules in scripts/build-wasm.sh.
# It runs emscripten's bundled tsc with cwd inside the emsdk; because npm run setup
# installs the emsdk at .tools/emsdk *inside this repo*, TypeScript walks up, finds the
# project's own tsconfig.json and fails with TS5112. Only the jsdoc path does this, and
# only EXPORTED_RUNTIME_METHODS takes it, so the module itself is unaffected: we just
# lose physics.d.ts and the module imports untyped.
if "$EMXX" "${SRC_FILES[@]}" "${LINK_ARGS[@]}" --emit-tsd "$OUT_TSD" -o "$OUT_JS" >/dev/null 2>&1; then
  echo "  [build] libs/physics → libphysics.a + physics.{js,wasm,d.ts}"
else
  "$EMXX" "${SRC_FILES[@]}" "${LINK_ARGS[@]}" -o "$OUT_JS"
  echo "  [build] libs/physics → libphysics.a + physics.{js,wasm} (no .d.ts: tsd generation failed)"
fi
