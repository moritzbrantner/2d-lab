# @moritzbrantner/viz-engine

Experimental renderer-agnostic visualization engine layer backed by
JavaScript fallbacks, legacy WASM kernels, and the new Rust-first
`viz-engine-core` direction.

`createVizEngine` lets multiple chart layers share datasets and density indexes,
then returns a render frame that SVG, Canvas, WebGL, React chart components, or
server-side renderers can consume.

```ts
import { createVizEngine } from "@moritzbrantner/viz-engine";

const engine = createVizEngine({ backend: "auto" });
const datasetId = engine.addDataset({ kind: "xy", points });

engine.addLayer({
  datasetId,
  kind: "binned-series",
  targetBinCount: 120,
  valueMode: "average",
  xDomain: [0, 1_440],
});
engine.addLayer({
  bucketCount: 48,
  datasetId,
  kind: "histogram",
});

const frame = engine.computeFrame({
  viewport: { height: 320, width: 800, xDomain: [0, 1_440] },
});
```

## Architecture

- React describes datasets, layers, and viewports.
- The TypeScript engine owns registered datasets, backend loading, cached
  indexes, frame assembly, hit testing, and renderer-facing data shapes.
- `viz-engine-core` is the future Rust source of truth for reusable
  data/math/geometry/indexing logic.
- `viz-engine-wasm` exposes selected Rust APIs to the browser through
  `wasm-bindgen`.
- Existing JavaScript and legacy `@mb-rust/*-wasm` backends remain available
  while Rust coverage grows.
- Renderers consume returned renderable data.
- React hooks coordinate lifecycle and small UI state only.

## Rust-first engine direction

The package boundary is:

```txt
viz-engine-core: Rust computation
viz-engine-wasm: browser binding
@moritzbrantner/viz-engine: TypeScript runtime wrapper
charts/maps/future packages: visuals
```

The rule is:

```txt
Rust owns computation.
TypeScript owns integration.
charts/maps/future packages own visuals.
```

The current Rust MVP supports XY datasets, binned series, histograms, heatmaps,
series bounds, and simple x-based hit testing. Geo datasets, GeoJSON, flows,
React lifecycle, renderer-facing frame assembly, dynamic backend selection, and
fallback routing remain in TypeScript or existing WASM packages for now.

Do not move React, DOM, Leaflet, Recharts, SVG rendering, Canvas rendering, UI
controls, or renderer integrations into Rust.

## React

The React bindings are intentionally thin:

- `VizEngineProvider`
- `useVizEngine`
- `useVizDataset`
- `useVizLayer`
- `useVizFrame`

They register datasets and layers, then ask the engine for render frames. The
engine keeps ownership of large point arrays, indexes, and computed data.

## CI

GitHub Actions checks formatting, types, tests, and the package build. The
normal package build generates the local `viz-engine-wasm` wrapper before
bundling TypeScript.

## Non-Goals

This MVP is not a D3 clone, not a DOM-selection model, and not a primary
renderer. It is a small proof of concept for a shared JS/Rust/WASM visualization
backend. Higher-level chart packages can build on top of this package instead
of owning the data kernel.

Not included:

- a full D3 replacement
- a DOM-selection model
- a primary SVG, Canvas, WebGL, or WebGPU renderer
- a complete map engine
- complete GeoJSON projection, clipping, or simplification
- WebGL/WebGPU buffers or typed-array render buffers
- worker scheduling
- React/browser integration in Rust
- Leaflet, Recharts, or three integration in Rust
- a forced WASM-only package
- a giant scene graph

The API is experimental and may change before `1.0`.

## Development

Run the example project with:

```sh
bun dev
```

The Vite app in `examples/` renders the current engine through React, including
binned series, histogram, heatmap, frame stats, and hit testing.

Useful validation commands:

```sh
bun run check-types
bun run test
bun run build
cargo test --workspace
bun run build:wasm
bun run test:wasm
```
