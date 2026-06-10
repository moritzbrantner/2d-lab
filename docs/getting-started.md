# Getting Started

## Install

```sh
bun add @moritzbrantner/viz-engine
```

React is optional. Use the core entrypoint when you are building a renderer,
worker, or server integration that does not need React hooks.

## Choose An Entrypoint

| Import path                            | What it includes                                                                                            |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `@moritzbrantner/viz-engine`           | Core data/frame engine APIs without React.                                                                  |
| `@moritzbrantner/viz-engine/core`      | Explicit core engine creation, frame hydration, transfer helpers, density index helpers, and types.         |
| `@moritzbrantner/viz-engine/core/lazy` | Async engine creation with lazy WASM loading.                                                               |
| `@moritzbrantner/viz-engine/worker`    | Worker client and host APIs.                                                                                |
| `@moritzbrantner/viz-engine/react`     | `VizEngineProvider`, `useVizEngine`, `useVizDataset`, `useVizLayer`, `useVizFrame`, and `useVizTypedFrame`. |

## Compute A Frame

```ts
import { createVizEngine } from "@moritzbrantner/viz-engine/core";

const points = [
  { id: "a", x: 0, y: 2 },
  { id: "b", x: 10, y: 4 },
  { id: "c", x: 20, y: 3 },
];

const engine = createVizEngine({ backend: "auto" });
const datasetId = engine.addDataset({ kind: "xy", points });

engine.addLayer({
  datasetId,
  kind: "binned-series",
  targetBinCount: 24,
});

const frame = engine.computeFrame({
  viewport: { height: 320, width: 800, xDomain: [0, 24] },
});
```

The returned frame is renderer-facing data. The engine does not draw SVG,
Canvas, WebGL, or DOM nodes for you.

## Compute A Table Frame

Tables use the same dataset/layer/frame flow, but with a table viewport. The
engine prepares renderer-neutral rows and columns; a tables package owns DOM
rendering and virtualization.

```ts
const datasetId = engine.addDataset({
  kind: "table",
  rows: [
    { id: "a", name: "Ada", score: 10 },
    { id: "b", name: "Ben", score: 5 },
  ],
  rowIdKey: "id",
});

engine.addLayer({
  datasetId,
  kind: "table",
  query: {
    rowLimit: 50,
    sort: [{ columnId: "score", direction: "desc" }],
  },
});

const frame = engine.computeFrame({
  viewport: { kind: "table", rowOffset: 0, rowLimit: 50 },
});
```

## Update Existing State

Use stable ids when the renderer lifecycle should keep the same dataset or
layer registration.

```ts
engine.updateDataset(datasetId, { kind: "xy", points: nextPoints });
engine.updateLayer(layerId, {
  datasetId,
  kind: "binned-series",
  targetBinCount: 180,
});
```

## Compute Only Some Layers

```ts
const frame = engine.computeFrame({
  layerIds: [mainSeriesLayerId, heatmapLayerId],
  viewport,
});

console.log(frame.stats.renderedLayerCount, frame.stats.cacheHitCount);
```

## Cache And Resources

Render-layer caching is enabled by default. You can disable it or bound it when
creating an engine:

```ts
const engine = createVizEngine({
  backend: "auto",
  cache: {
    enabled: true,
    maxEntriesPerLayer: 4,
    maxTotalEntries: 32,
  },
});
```

Inspect or clear cache state explicitly:

```ts
console.log(engine.getCacheStats());

engine.clearCache();
engine.clearCache({ layerId });
engine.clearCache({ datasetId });
```

Use `dispose()` when an engine is permanently finished. It clears datasets,
layers, frame cache, and disposable WASM resources. Future mutating or compute
calls throw `VizDisposedError`.

```ts
console.log(engine.getResourceStats());
engine.dispose();
```

## Next Steps

- Use [frame formats](frame-formats.md) to choose typed or object frames.
- Use [table data](table-data.md) for table datasets, filters, sorting, and row windows.
- Use [backends](backends.md) to understand JS, WASM, and auto selection.
- Use [errors and diagnostics](errors-and-diagnostics.md) for stable error codes and frame diagnostics.
- Use [lazy WASM](lazy-wasm.md) when the embedded WASM payload should not be in the default import.
- Use [worker handoff](worker-handoff.md) for off-main-thread frame computation.
