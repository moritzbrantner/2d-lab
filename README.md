# viz-engine

An experimental 2D rendering laboratory for Rust/WASM in the browser.

This repository exists to answer rendering questions with representative workloads before those decisions are adopted by product repositories such as `maps` and `flat-stories`.

## Scope

`viz-engine` owns rendering experiments:

- low-level display-list and renderer boundaries;
- Rust/WASM geometry preparation;
- Canvas 2D reference rendering;
- WebGPU/wgpu rendering experiments;
- tessellation, batching, clipping, text, image and compositing experiments;
- deterministic scene fixtures and rendering benchmarks;
- browser debug views for understanding renderer behavior.

It does **not** own map projection, geographic semantics, vector-editor documents, animation models, chart data, tables, or another product's scene graph. Product repositories adapt their authoritative state into render-ready primitives.

## Current render paths

All current paths consume the same low-level display list:

1. **Canvas 2D / TypeScript prepared** — TypeScript flattens commands, applies affine transforms, then Canvas rasterizes the resulting screen-space paths.
2. **Canvas 2D / Rust-WASM prepared** — the same flattened buffers cross into Rust once per frame, Rust applies the transforms, then the same Canvas drawing code rasterizes them.
3. **WebGPU / Rust-WASM convex polygons** — Rust applies affine transforms, triangle-fans closed convex fill-only polygons, packs position/color vertices, uploads one vertex buffer and submits one triangle-list draw call.

The WebGPU path deliberately rejects open paths, strokes, concave polygons, non-hex paint and debug bounds. Those features should arrive through measured tessellation/rendering slices rather than silent approximation.

## Scenes

- **Filled polygon parity** — 504 independently transformed fill-only quads. This is the first scene supported by both Canvas and WebGPU and is the primary parity/performance workload for the GPU baseline.
- **Map-like scene** — many polygons and road polylines under pan/zoom-style transforms.
- **Vector-animation scene** — many transformed vector figures as a stand-in for flat illustration/animation workloads.

## Metrics

The browser lab records:

- end-to-end average, p50 and p95 frame time;
- CPU preparation time;
- GPU upload-call time;
- Canvas draw or WebGPU encode/submit/present time;
- draw calls;
- generated GPU vertices;
- uploaded bytes per frame;
- WASM calls per frame.

The WebGPU timings are CPU-side preparation/upload/submit observations, not GPU timestamp-query measurements.

## Run

```sh
bun install
bun run dev
```

The TypeScript path works immediately. To enable the Rust/WASM and WebGPU renderers locally:

```sh
bun run build:wasm
bun run dev
```

WebGPU requires a browser with WebGPU support and a secure context such as localhost.

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
       +--> Rust transform/tessellation --> wgpu/WebGPU
```

The display list is intentionally small and rendering-oriented. If a proposed primitive contains words such as "map", "character", "chart", "dataset", or "table", it probably belongs in the caller instead.

See [ROADMAP.md](ROADMAP.md) for the experiment sequence.
