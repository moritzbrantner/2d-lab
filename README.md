# @moritzbrantner/viz-engine

Experimental renderer-agnostic visualization engine layer backed by
JavaScript fallbacks and Rust/WASM kernels for XY, geo, and finance domains.

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

Backend selection can also be scoped by domain:

```ts
const engine = createVizEngine({
  backend: { xy: "auto", geo: "wasm", finance: "wasm" },
});
```

`backend: "js"` forces all domains to JavaScript. `backend: "wasm"` requests
Rust/WASM for XY, geo, and finance indexes. `backend: "auto"` keeps JS
fallbacks available while using Rust/WASM where the published packages are
installed. Explicit per-domain settings win over the global backend option.

For high-frequency rendering, typed-array frame payloads are the default:

```ts
const typedFrame = engine.computeFrame({
  viewport: { height: 320, width: 800, xDomain: [0, 1_440] },
});
```

Typed cartesian layers expose fields such as `typedSeries`, `typedHistogram`,
`typedHeatmap`, and `typedRollingSeries`. The older `outputMode: "compact"` and
`compact*` field names remain as deprecated aliases during the pre-1.0
migration.

Typed geo layers add renderer-friendly payloads alongside the existing object
fields: `typedGeoClusters`, `typedGeoPoints`, `typedGeoHeat`,
`typedGeoScalarField`, and `typedGeoFlows`. GeoJSON remains object-shaped because
arbitrary geometries and properties are best consumed as GeoJSON.

Request object-shaped layers only when debugging, inspecting data, or using a
renderer that has not migrated yet:

```ts
const objectFrame = engine.computeFrame({
  frameFormat: "objects",
  viewport: { height: 320, width: 800, xDomain: [0, 1_440] },
});

const hydratedFrame = engine.hydrateFrame(typedFrame);
```

Renderer integrations can compute a subset of registered layers without
re-registering state:

```ts
const frame = engine.computeFrame({
  frameFormat: "typed",
  layerIds: [mainSeriesLayerId, heatmapLayerId],
  viewport: { height: 320, width: 800, xDomain: [0, 1_440] },
});

console.log(frame.stats.renderedLayerCount, frame.stats.cacheHitCount);
```

Datasets and layers can also be updated without changing ids:

```ts
engine.updateDataset(datasetId, { kind: "xy", x, y });
engine.updateLayer(layerId, {
  datasetId,
  kind: "binned-series",
  targetBinCount: 240,
});
```

For worker handoff, collect transferables from typed frames:

```ts
import { getVizFrameTransferables } from "@moritzbrantner/viz-engine";

worker.postMessage(frame, getVizFrameTransferables(frame));
```

Large XY datasets can avoid object allocation by providing typed arrays:

```ts
const datasetId = engine.addDataset({
  kind: "xy",
  x: new Float64Array(xValues),
  y: new Float64Array(yValues),
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

engine.addLayer({
  datasetId,
  kind: "finance-returns",
  method: "log",
  priceMode: "adjusted",
  targetPointCount: 240,
  xDomain: [startMs, endMs],
});
```

Finance WASM-backed indexes use the embedded `moritzbrantner-finance-data`
bindings for bounds, OHLC range queries, semantic downsampling, returns,
compact returns, and risk summaries. JavaScript fallbacks preserve the same
public layer contracts.

Geo point datasets can also produce scalar fields through inverse-distance
weighting:

```ts
const geoDatasetId = engine.addDataset({
  kind: "geo-points",
  points: [
    { id: "a", longitude: 13, latitude: 52, metrics: { temperature: 18 } },
    { id: "b", longitude: 13.2, latitude: 52.1, metrics: { temperature: 22 } },
  ],
});

engine.addLayer({
  datasetId: geoDatasetId,
  fieldColumns: 128,
  fieldRows: 96,
  interpolationK: 8,
  kind: "geo-scalar-field",
  valueMetric: "temperature",
});

const geoFrame = engine.computeFrame({
  viewport: {
    bounds: [12.8, 51.8, 13.4, 52.3],
    center: [13.1, 52.05],
    display: "flat",
    height: 480,
    kind: "geo",
    width: 640,
    zoom: 10,
  },
});
```

## Architecture

- React describes datasets, layers, and viewports.
- The TypeScript engine owns registered datasets, backend loading, cached
  indexes, frame assembly, hit testing, and renderer-facing data shapes.
- `moritzbrantner-viz-engine-core` is the future Rust source of truth for reusable
  XY data/math/indexing logic.
- `moritzbrantner-viz-engine-wasm` exposes selected Rust APIs for XY, geo, and
  finance backends to the browser through `wasm-bindgen`.
- JavaScript fallbacks remain for geo computation, GeoJSON viewport filtering,
  heat features, flow filtering, finance series, and XY layers.
- Embedded `moritzbrantner-geo-viz` bindings back geo point clustering, heat
  features, GeoJSON filtering, flow filtering, nearest-point lookup, and
  scalar-field grids when geo uses the WASM backend.
- Embedded `moritzbrantner-finance-data` bindings back finance bounds, OHLC
  range queries, downsampling, returns, and risk summaries when finance uses
  the WASM backend.
- Renderers consume returned renderable data. They can request object-shaped
  frame layers for ergonomics or use the default typed-array layers for lower
  overhead.
- React hooks coordinate lifecycle and small UI state only.

## Rust-first engine direction

The package boundary is:

```txt
moritzbrantner-viz-engine-core: local Rust XY computation
moritzbrantner-viz-engine-wasm: local browser binding for XY computation
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
rolling series statistics, series bounds, geo viewport indexes, scalar-field
grids, finance OHLCV downsampling, returns, risk summaries, and simple x-based
hit testing. React lifecycle, renderer-facing frame assembly, dynamic backend
selection, and fallback routing remain in TypeScript.

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

`useVizFrame` now accepts an options object:

```ts
const frame = useVizFrame({
  frameFormat: "typed",
  viewport,
  dependencies: [datasetId, layerId],
});
```

The legacy `useVizFrame(viewport, dependencies)` signature still works during
the migration window and returns typed frames by default.

By default, `useVizDataset` and `useVizLayer` recreate registrations when input
identity changes. Renderer integrations that want stable ids can opt into update
lifecycle mode:

```ts
const datasetId = useVizDataset(dataset, { lifecycle: "update" });
const layerId = useVizLayer(layer, { lifecycle: "update" });
```

Hit testing can use the last computed frame or an explicit frame and can be
restricted to selected layers:

```ts
const hit = engine.hitTest({
  frame,
  layerIds: [layerId],
  maxDistancePx: 12,
  mode: "nearest-point",
  viewport,
  x: pointerX,
  y: pointerY,
});
```

## CI

GitHub Actions checks formatting, types, tests, and the package build. The
normal package build generates the local `moritzbrantner-viz-engine-wasm` wrapper before
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

Do not commit package-manager overrides for sibling checkouts. The published
package embeds the WASM bindings for XY, geo, and finance backends.

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

Release checklist:

```sh
cd ../rust-packages
cargo package --allow-dirty -p moritzbrantner-video-analysis-core
cargo package --allow-dirty -p moritzbrantner-numbers-core
cargo package --allow-dirty -p moritzbrantner-dense-data
cargo package --allow-dirty -p moritzbrantner-maps-kernels-core
cargo package --allow-dirty -p moritzbrantner-finance-statistics
cargo package --allow-dirty -p moritzbrantner-finance-data
cargo package --allow-dirty -p moritzbrantner-geo-core
cargo package --allow-dirty -p moritzbrantner-geo-io-geojson
cargo package --allow-dirty -p moritzbrantner-geo-clustering
cargo package --allow-dirty -p moritzbrantner-geo-viz
cd ../viz-engine
cargo package --allow-dirty -p moritzbrantner-viz-engine-core
cargo package --allow-dirty -p moritzbrantner-viz-engine-wasm
bun run format:check
bun run check-types
bun run test
bun run build
npm pack --dry-run
```

Run the two `wasm-pack` package builds sequentially; concurrent builds can race
inside `wasm-opt` output files on some local setups.

## Benchmarks

The benchmark suite in `bench/` compares the engine's data-kernel work against
similar data libraries such as D3 array utilities, Supercluster, simple-statistics,
and downsample. Start with:

```sh
bun run bench:quick
```

See `bench/README.md` for the full Bun and browser benchmark workflow.
