#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LERPETTE_ROOT="$ROOT_DIR/src/lerpettes"
SEED_DIR="$ROOT_DIR/public/wasm"
TMP_DIR="$(mktemp -d "/tmp/lerpit-wasm.XXXXXX")"
SCRIPT_FILE="$ROOT_DIR/scripts/build-wasm.sh"
DEFAULT_CLANG="$(command -v clang || true)"
WASM_CLANG=""
DEFAULT_WASM_LD="$(command -v wasm-ld || true)"
WASM_LD=""
HAS_WASM_TOOLCHAIN=0
FALLBACK_NOTICE_EMITTED=0
BUILT_COUNT=0
SKIPPED_COUNT=0

trap 'rm -rf "$TMP_DIR"' EXIT

if [[ -n "${WASM_CLANG_BIN:-}" ]]; then
  WASM_CLANG="$WASM_CLANG_BIN"
elif [[ -x /opt/homebrew/opt/llvm/bin/clang ]]; then
  WASM_CLANG="/opt/homebrew/opt/llvm/bin/clang"
elif [[ -x /usr/local/opt/llvm/bin/clang ]]; then
  WASM_CLANG="/usr/local/opt/llvm/bin/clang"
else
  WASM_CLANG="$DEFAULT_CLANG"
fi

if [[ -n "${WASM_LD_BIN:-}" ]]; then
  WASM_LD="$WASM_LD_BIN"
elif [[ -x "$(dirname "$WASM_CLANG")/wasm-ld" ]]; then
  WASM_LD="$(dirname "$WASM_CLANG")/wasm-ld"
elif [[ -x /opt/homebrew/opt/lld/bin/wasm-ld ]]; then
  WASM_LD="/opt/homebrew/opt/lld/bin/wasm-ld"
elif [[ -x /usr/local/opt/lld/bin/wasm-ld ]]; then
  WASM_LD="/usr/local/opt/lld/bin/wasm-ld"
else
  WASM_LD="$DEFAULT_WASM_LD"
fi

compiler_supports_wasm() {
  local compiler="$1"
  local probe_log="$TMP_DIR/clang-probe.log"
  local linker_dir=""

  [[ -n "$compiler" ]] || return 1
  if [[ -n "$WASM_LD" ]]; then
    linker_dir="$(dirname "$WASM_LD")"
  fi

  printf 'float lerp_f32(float a, float b, float t) { return a + (b - a) * t; }\n' |
    PATH="${linker_dir:+$linker_dir:}$PATH" "$compiler" \
      --target=wasm32 \
      -O0 \
      -nostdlib \
      -Wl,--no-entry \
      -Wl,--export=lerp_f32 \
      -x c \
      - \
      -o "$TMP_DIR/probe.wasm" \
      >/dev/null 2>"$probe_log"
}

emit_fallback_notice() {
  local seed_file="$1"

  if [[ $FALLBACK_NOTICE_EMITTED -eq 1 ]]; then
    return
  fi

  FALLBACK_NOTICE_EMITTED=1

  if [[ -n "$WASM_CLANG" && -z "$WASM_LD" ]]; then
    echo "Found a wasm-capable clang at \"$WASM_CLANG\", but no wasm-ld linker was available." >&2
    echo "Install lld and set WASM_LD_BIN if it is not on PATH." >&2
    echo "Fell back to seed binary from $seed_file" >&2
  elif [[ "$WASM_CLANG" == "$DEFAULT_CLANG" ]]; then
    echo "Local clang cannot target wasm32; copied fallback seed binary from $seed_file" >&2
    echo "Install LLVM and set WASM_CLANG_BIN if you want local Wasm recompilation." >&2
  else
    echo "Configured compiler \"$WASM_CLANG\" could not build wasm32; copied fallback seed binary from $seed_file" >&2
  fi
}

artifact_matches_seed() {
  local output_file="$1"
  local seed_file="$2"

  [[ -f "$output_file" ]] || return 1
  [[ -f "$seed_file" ]] || return 1
  cmp -s "$output_file" "$seed_file"
}

needs_rebuild() {
  local src_file="$1"
  local output_file="$2"
  local seed_file="$3"

  [[ -f "$output_file" ]] || return 0
  [[ "$src_file" -nt "$output_file" ]] && return 0
  [[ "$SCRIPT_FILE" -nt "$output_file" ]] && return 0

  if [[ $HAS_WASM_TOOLCHAIN -eq 1 ]]; then
    [[ -n "$WASM_CLANG" && "$WASM_CLANG" -nt "$output_file" ]] && return 0
    [[ -n "$WASM_LD" && "$WASM_LD" -nt "$output_file" ]] && return 0
    artifact_matches_seed "$output_file" "$seed_file" && return 0
  else
    [[ -f "$seed_file" && "$seed_file" -nt "$output_file" ]] && return 0
  fi

  return 1
}

build_artifact() {
  local src_file="$1"
  local module_name
  local seed_file
  local artifact_file
  local compile_log
  local artifact_key
  local linker_dir=""

  module_name="$(basename "${src_file%.c}")"
  seed_file="$SEED_DIR/$module_name.wasm"
  artifact_key="$(printf '%s' "$src_file" | cksum | awk '{print $1}')"
  artifact_file="$TMP_DIR/$artifact_key-$module_name.wasm"
  compile_log="$TMP_DIR/$artifact_key-$module_name.stderr.log"
  if [[ -n "$WASM_LD" ]]; then
    linker_dir="$(dirname "$WASM_LD")"
  fi

  if [[ $HAS_WASM_TOOLCHAIN -eq 1 ]] && PATH="${linker_dir:+$linker_dir:}$PATH" "$WASM_CLANG" \
    --target=wasm32 \
    -O3 \
    -nostdlib \
    -Wl,--no-entry \
    -Wl,--export=lerp_f32 \
    "$src_file" \
    -o "$artifact_file" \
    >/dev/null 2>"$compile_log"; then
    echo "Compiled fresh Wasm from $src_file with $WASM_CLANG" >&2
  elif [[ -f "$seed_file" ]]; then
    cp "$seed_file" "$artifact_file"
    emit_fallback_notice "$seed_file"
  else
    if [[ -f "$compile_log" ]]; then
      cat "$compile_log" >&2
    fi
    echo "Failed to compile $src_file and no fallback seed binary was found at $seed_file." >&2
    exit 1
  fi

  printf '%s\n' "$artifact_file"
}

copy_artifact() {
  local artifact_file="$1"
  local output_file="$2"

  mkdir -p "$(dirname "$output_file")"
  cp "$artifact_file" "$output_file"
  echo "Built $output_file"
}

if compiler_supports_wasm "$WASM_CLANG"; then
  HAS_WASM_TOOLCHAIN=1
fi

found_step_src_dir=0

while IFS= read -r step_src_dir; do
  [[ -n "$step_src_dir" ]] || continue
  found_step_src_dir=1
  step_dir="$(dirname "$step_src_dir")"
  target_dir="$step_dir/wasm"

  while IFS= read -r step_src; do
    [[ -n "$step_src" ]] || continue
    module_name="$(basename "${step_src%.c}")"
    output_file="$target_dir/$module_name.wasm"
    seed_file="$SEED_DIR/$module_name.wasm"

    if needs_rebuild "$step_src" "$output_file" "$seed_file"; then
      artifact_file="$(build_artifact "$step_src")"
      copy_artifact "$artifact_file" "$output_file"
      BUILT_COUNT=$((BUILT_COUNT + 1))
    else
      SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
      echo "Skipped unchanged $output_file"
    fi
  done < <(find "$step_src_dir" -maxdepth 1 -type f -name '*.c' | sort)
done < <(find "$LERPETTE_ROOT" -type d -path '*/code/*/wasm-src' | sort)

if [[ $found_step_src_dir -eq 0 ]]; then
  echo "No wasm-src directories found under src/lerpettes/**/code/**."
  exit 0
fi

echo "Wasm build complete: $BUILT_COUNT built, $SKIPPED_COUNT skipped."
