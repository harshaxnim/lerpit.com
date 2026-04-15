#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EMSDK_DIR="$ROOT_DIR/.tools/emsdk"
LOCAL_EMCC="$EMSDK_DIR/upstream/emscripten/emcc"
EMSDK_PYTHON_BIN=""

if command -v emcc >/dev/null 2>&1; then
  echo "Found system emcc at $(command -v emcc)"
  echo "Setup complete."
  exit 0
fi

if [[ -x "$LOCAL_EMCC" ]]; then
  echo "Found local emcc at $LOCAL_EMCC"
  echo "Setup complete."
  exit 0
fi

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git is required to install emsdk." >&2
  exit 1
fi

python_is_supported() {
  local candidate="$1"
  "$candidate" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' >/dev/null 2>&1
}

pick_python() {
  local candidates=(
    "${EMSDK_PYTHON:-}"
    "$(command -v python3.12 || true)"
    "$(command -v python3.11 || true)"
    "$(command -v python3.10 || true)"
    "/opt/homebrew/bin/python3.12"
    "/opt/homebrew/bin/python3.11"
    "/opt/homebrew/bin/python3.10"
    "/usr/local/bin/python3.12"
    "/usr/local/bin/python3.11"
    "/usr/local/bin/python3.10"
  )

  for candidate in "${candidates[@]}"; do
    [[ -n "$candidate" ]] || continue
    [[ -x "$candidate" ]] || continue

    if python_is_supported "$candidate"; then
      EMSDK_PYTHON_BIN="$candidate"
      return 0
    fi
  done

  return 1
}

if ! pick_python; then
  echo "Error: Emscripten setup requires Python 3.10+ but no supported interpreter was found." >&2
  echo "Install Python 3.11+ and rerun setup." >&2
  echo "On macOS/Homebrew: brew install python@3.11" >&2
  echo "Then: EMSDK_PYTHON=\$(command -v python3.11) npm run setup" >&2
  exit 1
fi

echo "Using Python for emsdk: $EMSDK_PYTHON_BIN"

mkdir -p "$ROOT_DIR/.tools"

if [[ ! -d "$EMSDK_DIR" ]]; then
  echo "Cloning emsdk into $EMSDK_DIR"
  git clone https://github.com/emscripten-core/emsdk.git "$EMSDK_DIR"
fi

cd "$EMSDK_DIR"

echo "Installing latest Emscripten toolchain..."
EMSDK_PYTHON="$EMSDK_PYTHON_BIN" ./emsdk install latest
EMSDK_PYTHON="$EMSDK_PYTHON_BIN" ./emsdk activate latest

if [[ ! -x "$LOCAL_EMCC" ]]; then
  echo "Error: emcc was not found at $LOCAL_EMCC after setup." >&2
  exit 1
fi

echo "Installed local emcc at $LOCAL_EMCC"
echo "Setup complete."
