# @moritzbrantner/viz-engine

Experimental renderer-agnostic visualization engine layer backed by a
Rust/WASM density kernel.

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
- The engine owns registered datasets and cached chart density indexes.
- The backend computes chart/render data through JavaScript or
  `@mb-rust/dense-data-wasm`.
- Renderers consume returned renderable data.
- React hooks coordinate lifecycle and small UI state only.

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

GitHub Actions checks formatting, types, tests, and the package build. The WASM
backend is supplied by `@mb-rust/dense-data-wasm`, which wraps the Rust
`dense-data` crate.

## Non-Goals

This MVP is not a D3 clone and not a primary renderer. It is a small proof of
concept for a shared JS/WASM visualization backend. Higher-level chart packages
can build on top of this package instead of owning the data kernel.

Not included:

- a full D3 replacement
- a full renderer or DOM-selection API
- map/GeoJSON support
- WebGL/WebGPU buffers or typed-array render buffers
- worker scheduling
- advanced label layout migration
- a giant scene graph

The API is experimental and may change before `1.0`.

## Development

Run the example project with:

```sh
bun dev
```

The Vite app in `examples/` renders the current engine through React, including
binned series, histogram, heatmap, frame stats, and hit testing.
