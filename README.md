# @moritzbrantner/viz-engine

Experimental renderer-agnostic visualization engine layer for
`@moritzbrantner/charts`.

`createVizEngine` lets multiple chart layers share datasets and density indexes,
then returns a render frame that SVG, Canvas, WebGL, Recharts, or server-side
renderers can consume.

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
- The backend computes chart/render data.
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

GitHub Actions checks formatting, types, tests, and the package build. Because
this package currently depends on the private sibling repository
`moritzbrantner/charts` through `file:../charts`, the repository needs a
`CHARTS_REPO_TOKEN` Actions secret with read access to `moritzbrantner/charts`.

## Non-Goals

This MVP is not a D3 clone and not a primary renderer. It is a small proof of
concept for a shared JS/WASM visualization backend.

Not included:

- a full D3 replacement
- a full renderer or DOM-selection API
- map/GeoJSON support
- WebGL/WebGPU buffers or typed-array render buffers
- worker scheduling
- advanced label layout migration
- a giant scene graph

The API is experimental and may change before `1.0`.
