#!/usr/bin/env bash
set -euo pipefail

rm -rf public/wasm
mkdir -p public/wasm

wasm-pack build crates/viz-render-kernel \
  --release \
  --target web \
  --out-dir ../../public/wasm \
  --out-name viz_render_kernel

rm -f public/wasm/package.json
