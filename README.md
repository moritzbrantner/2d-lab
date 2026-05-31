# @moritzbrantner/viz-engine

Experimental renderer-agnostic visualization engine layer backed by
JavaScript fallbacks and local Rust/WASM XY kernels.

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
engine.addLayer({
  datasetId,
  kind: "rolling-series",
  statistic: "mean",
  windowSize: 24,
  xDomain: [0, 1_440],
});

const frame = engine.computeFrame({
  viewport: { height: 320, width: 800, xDomain: [0, 1_440] },
});
```

Financial OHLCV data can use the same frame API:

```ts
const startMs = 1_717_113_600_000;
const endMs = 1_717_200_000_000;
const bars = [
  { timestamp: startMs, open: 100, high: 104, low: 99, close: 103, volume: 125_000 },
  { timestamp: endMs, open: 103, high: 108, low: 101, close: 106, volume: 148_000 },
];

const datasetId = engine.addDataset({
  kind: "finance-ohlcv",
  instrument: { symbol: "AAPL", assetClass: "equity", currency: "USD" },
  bars,
});

engine.addLayer({
  datasetId,
  kind: "finance-candles",
  targetBarCount: 180,
  xDomain: [startMs, endMs],
});
```

## Architecture

- React describes datasets, layers, and viewports.
- The TypeScript engine owns registered datasets, backend loading, cached
  indexes, frame assembly, hit testing, and renderer-facing data shapes.
- `viz-engine-core` is the future Rust source of truth for reusable
  XY data/math/indexing logic.
- `viz-engine-wasm` exposes selected Rust APIs to the browser through
  `wasm-bindgen`.
- JavaScript fallbacks currently own geo computation such as map clustering,
  GeoJSON viewport filtering, heat features, and flow filtering until the geo
  WASM package is published and wired in.
- Renderers consume returned renderable data.
- React hooks coordinate lifecycle and small UI state only.

## Rust-first engine direction

The package boundary is:

```txt
viz-engine-core: local Rust XY computation
viz-engine-wasm: local browser binding for XY computation
finance-data: reusable Rust financial market-data core in rust-packages
finance-statistics: reusable Rust return/risk/statistics crate in rust-packages
@moritzbrantner/viz-engine: TypeScript runtime wrapper
charts/maps/future packages: visuals
```

The rule is:

```txt
Rust crates own computation.
TypeScript owns integration.
charts/maps/future packages own visuals.
```

The current Rust MVP supports XY datasets, binned series, histograms, heatmaps,
rolling series statistics, series bounds, and simple x-based hit testing. Geo
point clustering, geo heat features, GeoJSON viewport filtering, and flow
filtering/aggregation are currently JavaScript-backed in this package. Financial
OHLCV modeling, validation, downsampling, provider-neutral data contracts, and
derived return/risk helpers live in the reusable `finance-data` and
`finance-statistics` Rust crates under
`/home/moenarch/moritzbrantner/rust-packages`; `viz-engine` exposes those
concepts as renderer-facing finance datasets and layers. React lifecycle,
renderer-facing frame assembly, dynamic backend selection, and fallback routing
remain in TypeScript.

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
Dataset, layer, viewport, and frame dependency inputs are identity-sensitive:
memoize objects and arrays passed to these hooks with React's memo helpers when
they are derived during render. The example app follows this pattern for layer
objects and frame dependencies.

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
- complete map projection or clipping
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

Do not commit package-manager overrides for sibling checkouts. If a future geo
WASM package is wired in before it is published, link or install it locally in
your checkout and keep that configuration out of version control.

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
