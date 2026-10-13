#!/usr/bin/env bash
# Rebuild kahu.js and kahu.wasm in the site root. Needs em++ (Emscripten).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v em++ >/dev/null 2>&1; then
  echo "em++ not found. Install Emscripten and retry." >&2
  exit 1
fi

em++ \
  src/wasm_api.cpp \
  src/engine.cpp \
  src/position.cpp \
  src/zobrist.cpp \
  src/nnue.cpp \
  -O3 -std=c++20 \
  -DNDEBUG \
  -fno-rtti \
  -s WASM=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=134217728 \
  -s STACK_SIZE=2097152 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME=createKahu \
  -s EXPORTED_FUNCTIONS='["_kahu_init","_kahu_load_nnue","_kahu_reset","_kahu_set_kfen","_kahu_kfen","_kahu_legal","_kahu_move","_kahu_eval","_kahu_winner","_kahu_stm","_kahu_stop","_kahu_search_ms","_kahu_search_begin","_kahu_search_ply","_kahu_preview","_kahu_clear_tt","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["cwrap","UTF8ToString","HEAPU8"]' \
  -s ENVIRONMENT=web,worker,node \
  -s FILESYSTEM=0 \
  -s NO_EXIT_RUNTIME=1 \
  -o kahu.js

echo "Wrote kahu.js and kahu.wasm"
