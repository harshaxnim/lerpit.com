#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LERPETTE_ROOT="$ROOT_DIR/src/lerpettes"
SCRIPT_FILE="$ROOT_DIR/scripts/build-wasm.sh"
LOCAL_EMCC="$ROOT_DIR/.tools/emsdk/upstream/emscripten/emcc"
EMCC="${EMCC_BIN:-$(command -v emcc || true)}"
BUILT_COUNT=0
SKIPPED_COUNT=0

rel() { echo "${1#"$ROOT_DIR"/}"; }

if [[ -z "$EMCC" && -x "$LOCAL_EMCC" ]]; then
  EMCC="$LOCAL_EMCC"
fi

if [[ -z "$EMCC" ]]; then
  echo "Error: emcc was not found." >&2
  echo "Run \"npm run setup\" or install Emscripten manually." >&2
  echo "You can also set EMCC_BIN=/path/to/emcc." >&2
  exit 1
fi

python_is_supported() {
  "$1" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' >/dev/null 2>&1
}

if [[ -z "${EMSDK_PYTHON:-}" ]] || ! python_is_supported "$EMSDK_PYTHON"; then
  for candidate in \
    "$(command -v python3.13 || true)" \
    "$(command -v python3.12 || true)" \
    "$(command -v python3.11 || true)" \
    "$(command -v python3.10 || true)" \
    /opt/homebrew/bin/python3.14 \
    /opt/homebrew/bin/python3.13 \
    /opt/homebrew/bin/python3.12 \
    /opt/homebrew/bin/python3.11 \
    /opt/homebrew/bin/python3.10; do
    [[ -n "$candidate" && -x "$candidate" ]] || continue
    if python_is_supported "$candidate"; then
      export EMSDK_PYTHON="$candidate"
      break
    fi
  done
fi

if [[ -z "${EMSDK_PYTHON:-}" ]]; then
  echo "Error: Emscripten requires Python 3.10+ but none was found on PATH." >&2
  echo "Install Python 3.11+ (e.g. brew install python@3.12) and retry." >&2
  exit 1
fi

needs_rebuild() {
  local src_file="$1"
  local output_js="$2"
  local output_wasm="$3"

  [[ -f "$output_js" ]] || return 0
  [[ -f "$output_wasm" ]] || return 0
  [[ "$src_file" -nt "$output_js" ]] && return 0
  [[ "$src_file" -nt "$output_wasm" ]] && return 0
  [[ "$SCRIPT_FILE" -nt "$output_js" ]] && return 0
  [[ "$SCRIPT_FILE" -nt "$output_wasm" ]] && return 0
  [[ "$EMCC" -nt "$output_js" ]] && return 0
  [[ "$EMCC" -nt "$output_wasm" ]] && return 0

  return 1
}

LIB_ROOT="$ROOT_DIR/src/lib"
LIB_ARGS=()

build_with_emcc() {
  local src_file="$1"
  local output_js="$2"
  local output_tsd="${output_js%.js}.d.ts"

  # Try with --emit-tsd first; fall back without it if tsgen fails
  # (happens when embind bindings span a static lib + the source file)
  "$EMCC" "$src_file" "${LIB_ARGS[@]+"${LIB_ARGS[@]}"}" \
    -O3 \
    --bind \
    -sMODULARIZE=1 \
    -sEXPORT_ES6=1 \
    -sENVIRONMENT=web \
    -sALLOW_MEMORY_GROWTH=1 \
    "-sEXPORTED_RUNTIME_METHODS=HEAP8,HEAPU8,HEAP16,HEAPU16,HEAP32,HEAPU32,HEAPF32,HEAPF64" \
    --emit-tsd "$output_tsd" \
    -o "$output_js" 2>/dev/null || \
  "$EMCC" "$src_file" "${LIB_ARGS[@]+"${LIB_ARGS[@]}"}" \
    -O3 \
    --bind \
    -sMODULARIZE=1 \
    -sEXPORT_ES6=1 \
    -sENVIRONMENT=web \
    -sALLOW_MEMORY_GROWTH=1 \
    "-sEXPORTED_RUNTIME_METHODS=HEAP8,HEAPU8,HEAP16,HEAPU16,HEAP32,HEAPU32,HEAPF32,HEAPF64" \
    -o "$output_js"
}

# Build all libs under src/lib/ first, then collect .a files + include paths.
while IFS= read -r lib_build; do
  [[ -n "$lib_build" ]] || continue
  EMCC_BIN="$EMCC" EMSDK_PYTHON="${EMSDK_PYTHON:-}" bash "$lib_build"
done < <(find "$LIB_ROOT" -path '*/wasm/build.sh' 2>/dev/null | sort)

while IFS= read -r lib_a; do
  [[ -n "$lib_a" ]] || continue
  lib_dir="$(dirname "$(dirname "$lib_a")")"
  LIB_ARGS+=(-Wl,--whole-archive "$lib_a" -Wl,--no-whole-archive -I"$lib_dir/wasm")
done < <(find "$LIB_ROOT" -path '*/build/lib*.a' 2>/dev/null | sort)

found_step_src_dir=0

while IFS= read -r step_src_dir; do
  [[ -n "$step_src_dir" ]] || continue
  found_step_src_dir=1
  step_dir="$(dirname "$step_src_dir")"
  target_dir="$step_dir/build"
  mkdir -p "$target_dir"

  # If the wasm source dir has its own build.sh, delegate to it (used by lerpettes
  # that combine multiple .cpp files and/or link against the physics framework).
  if [[ -x "$step_src_dir/build.sh" ]]; then
    EMCC_BIN="$EMCC" EMSDK_PYTHON="${EMSDK_PYTHON:-}" bash "$step_src_dir/build.sh"
    BUILT_COUNT=$((BUILT_COUNT + 1))
    continue
  fi

  while IFS= read -r step_src; do
    [[ -n "$step_src" ]] || continue

    module_name="$(basename "${step_src%.*}")"
    output_js="$target_dir/$module_name.js"
    output_wasm="$target_dir/$module_name.wasm"

    if needs_rebuild "$step_src" "$output_js" "$output_wasm"; then
      mkdir -p "$target_dir"
      build_with_emcc "$step_src" "$output_js"
      echo "  [build] $(rel "$step_src") → $(rel "$target_dir")/$module_name.{js,wasm}"
      BUILT_COUNT=$((BUILT_COUNT + 1))
    else
      SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
      echo "  [skip]  $(rel "$step_src") (unchanged)"
    fi
  done < <(find "$step_src_dir" -maxdepth 1 -type f \( -name '*.cpp' -o -name '*.cc' -o -name '*.cxx' \) | sort)
done < <(find "$LERPETTE_ROOT" -type d -path '*/code/*/wasm' | sort)

if [[ $found_step_src_dir -eq 0 ]]; then
  echo "No wasm source directories found under src/lerpettes/**/code/**."
fi

echo ""
echo "wasm: $BUILT_COUNT built, $SKIPPED_COUNT skipped"
