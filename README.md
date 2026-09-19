# viz-engine

An experimental 2D rendering laboratory for Rust/WASM in the browser.

This repository exists to answer rendering questions with representative workloads before those decisions are adopted by product repositories such as `maps` and `flat-stories`.

## Scope

`viz-engine` owns rendering experiments:

- low-level display-list and renderer boundaries;
- Rust/WASM geometry preparation;
- Canvas 2D reference rendering;
- future WebGPU/wgpu rendering;
- tessellation, batching, clipping, text, image and compositing experiments;
- deterministic scene fixtures and rendering benchmarks;
- browser debug views for understanding renderer behavior.

It does **not** own map projection, geographic semantics, vector-editor documents, animation models, chart data, tables, or another product's scene graph. Product repositories adapt their authoritative state into render-ready primitives.

## Current slice

The reset starts with two render paths over the exact same prepared-geometry semantics:

1. **Canvas 2D / TypeScript prepared** — TypeScript flattens commands, applies affine transforms, then Canvas rasterizes the resulting screen-space paths.
2. **Canvas 2D / Rust-WASM prepared** — the same flattened buffers cross into Rust once per frame, Rust applies the transforms, then the same Canvas drawing code rasterizes them.

This is intentionally not the final renderer architecture. It gives the lab a deterministic reference implementation, a compact typed-array ABI, and a first measurable Rust/WASM boundary before adding GPU complexity.

Two deterministic fixtures exercise different shapes of work:

- **Map-like scene** — many polygons and road polylines under pan/zoom-style transforms.
- **Vector-animation scene** — many transformed vector figures as a stand-in for flat illustration/animation workloads.

## Run

```sh
bun install
bun run dev
```

The TypeScript path works immediately. To enable the Rust/WASM renderer locally:

```sh
bun run build:wasm
bun run dev
```

Validation:

```sh
bun run check
cargo check --workspace --target wasm32-unknown-unknown
```

## Architecture rule

```text
product-owned model
       |
       | adapter owned by the product
       v
low-level display list
       |
       +--> TypeScript geometry prep --> Canvas 2D
       |
       +--> Rust/WASM geometry prep --> Canvas 2D
       |
       +--> future wgpu/WebGPU renderer
```

The display list is intentionally small and rendering-oriented. If a proposed primitive contains words such as "map", "character", "chart", "dataset", or "table", it probably belongs in the caller instead.

See [ROADMAP.md](ROADMAP.md) for the experiment sequence.
