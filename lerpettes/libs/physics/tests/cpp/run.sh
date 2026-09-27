#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/.build"
mkdir -p "$BUILD_DIR"

CXX="${CXX:-c++}"

"$CXX" \
  -std=c++17 -O0 -g -Wall -Wextra -Wpedantic \
  -I"$SCRIPT_DIR/../../wasm" \
  "$SCRIPT_DIR"/main.cpp \
  "$SCRIPT_DIR"/test_world.cpp \
  "$SCRIPT_DIR"/test_shapes.cpp \
  "$SCRIPT_DIR/../../wasm/world.cpp" \
  -o "$BUILD_DIR/physics_tests"

"$BUILD_DIR/physics_tests"
