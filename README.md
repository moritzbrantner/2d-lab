# viz-engine

An experimental 2D rendering laboratory for Rust/WASM in the browser.

This repository exists to answer rendering questions with representative workloads before those decisions are adopted by product repositories such as `maps` and `flat-stories`.

## Scope

`viz-engine` owns rendering experiments and evidence:

- low-level display-list and renderer boundaries;
- Canvas 2D reference rendering;
- Rust/WASM preparation;
- custom wgpu/WebGPU pipelines;
- retained-geometry experiments;
- general vector renderer comparisons;
- deterministic product-shaped fixtures;
- browser performance instrumentation.

It does **not** own map projection, geographic semantics, vector-editor documents, animation models, chart data, tables, or another product's scene graph. Product repositories adapt their authoritative state into render-ready primitives.

The current `DisplayList` and `BenchmarkWorkload` shapes are **lab-internal workload contracts**, not shared scene APIs. A product must not import them as canonical scene/document/map state; if a stable 2D rendering contract is ever promoted, that should happen deliberately after multiple real consumers prove the same seam.

## Current render paths

All current paths consume the same low-level display list where their semantics overlap:

1. **Canvas 2D / TypeScript prepared** — readable browser reference.
2. **Canvas 2D / Rust-WASM prepared** — the same Canvas rasterization after one batched Rust affine pass.
3. **Custom WebGPU / immediate** — Rust transforms and triangle-fans convex fill-only polygons, uploads the generated vertices every frame, then submits one draw.
4. **Custom WebGPU / retained map geometry** — for scenes with stable local fill geometry and one shared frame transform, triangulates/uploads geometry once and updates only a small frame uniform during steady-state frames. It conservatively verifies geometry values each frame; a real Maps adapter could replace that scan with a Maps-owned geometry revision.
5. **Vello GPU / pinned upstream** — general vector competitor. Vello owns path/stroke preprocessing and GPU rasterization/compositing instead of viz-engine growing those facilities itself.

### Vello pin

The experiment pins Vello GPU to upstream commit:

```text
linebender/vello
60618fc3ff3343aeabbceb25180be6c6319154e3
```

At that revision the upstream package identifies as `vello_gpu 0.2.0` and targets the wgpu 30 generation. The crates.io `vello_gpu` name is not yet a usable release for this implementation, so the git revision is intentionally explicit. This is a lab dependency, not a stability commitment for Flat Stories.

## Workloads

### Map · retained geometry

640 static polygon features share one pan/zoom transform.

This asks a map-specific question:

> How much do we gain when product knowledge lets geometry stay resident and only camera state changes?

It is compatible with Canvas, both custom polygon backends, and Vello.

### Flat Stories · vector animation

45 animated figures contain independently changing transforms, fills and strokes.

This asks the opposite question:

> When general vector semantics are needed every frame, is a mature vector renderer a better foundation than a map-specialized custom pipeline?

It is compatible with Canvas and Vello. The fill-only custom polygon backends reject it rather than silently dropping strokes.

### Filled polygon parity

504 independently transformed fill-only quads remain the simplest common denominator for comparing immediate Canvas, custom WebGPU and Vello without retained-map assumptions.

### Map-like mixed scene

A mixed polygon/road workload keeps open lines and strokes in the benchmark suite. Vello and Canvas can consume it; fill-only custom backends cannot yet.

## Browser lab

The page supports:

- live scene/renderer switching;
- one-renderer 90-frame benchmark;
- a 45-frame **compatible renderer comparison** for the selected scene;
- prepare, upload-call and render/submit timing;
- end-to-end average, p50 and p95;
- draw calls, generated vertices and upload bytes when the backend exposes them.

Vello does not expose equivalent low-level vertex/upload accounting through this adapter, so those fields are shown as `n/a` rather than invented.

Timing categories are CPU-side observations. They are not GPU timestamp-query measurements.

## Run

```sh
bun install
bun run build:wasm
bun run dev
```

WebGPU requires browser WebGPU support and a secure context such as localhost.

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
low-level render list
       |
       +--> Canvas reference
       |
       +--> custom map-oriented GPU experiments
       |
       +--> Vello general-vector experiment
```

The lab is allowed to compare architectures without forcing them behind one production abstraction.

The intended product direction is currently:

```text
Maps
  -> custom rendering where map-specific retained/culling/picking structure
     produces measured leverage
  -> reuse libraries for generic geometry problems when useful

Flat Stories
  -> Vello candidate for general vector rendering
  -> Flat Stories keeps document/rig/animation semantics

viz-engine
  -> benchmark and decision laboratory
  -> no consumer-owned semantics
```

See [ROADMAP.md](ROADMAP.md) for the next experiments.
