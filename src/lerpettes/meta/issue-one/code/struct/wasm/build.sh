#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../../../../../.." && pwd)"
LOCAL_EMCC="$ROOT_DIR/.tools/emsdk/upstream/emscripten/emcc"
EMCC="${EMCC_BIN:-$(command -v emcc || true)}"
if [[ -z "$EMCC" && -x "$LOCAL_EMCC" ]]; then EMCC="$LOCAL_EMCC"; fi
if [[ -z "$EMCC" ]]; then echo "Error: emcc not found" >&2; exit 1; fi

OUT_DIR="$SCRIPT_DIR/../build"
mkdir -p "$OUT_DIR"

"$EMCC" "$SCRIPT_DIR/struct.cpp" \
  -O3 \
  --bind \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sENVIRONMENT=web \
  -sALLOW_MEMORY_GROWTH=1 \
  -o "$OUT_DIR/struct.js"

echo "Built $OUT_DIR/struct.js"
