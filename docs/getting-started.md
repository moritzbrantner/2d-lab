# Getting Started

## Install

```sh
bun add @moritzbrantner/viz-engine
```

React is optional. Use the core entrypoint when you are building a renderer,
worker, or server integration that does not need React hooks.

## Choose An Entrypoint

| Import path                        | What it includes                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `@moritzbrantner/viz-engine/core`  | Engine creation, frame hydration, worker transfer helpers, density index helpers, and all public types.     |
| `@moritzbrantner/viz-engine/react` | `VizEngineProvider`, `useVizEngine`, `useVizDataset`, `useVizLayer`, `useVizFrame`, and `useVizTypedFrame`. |
| `@moritzbrantner/viz-engine`       | Backward-compatible root export. Prefer explicit subpaths for new code.                                     |

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

## Next Steps

- Use [frame formats](frame-formats.md) to choose typed or object frames.
- Use [backends](backends.md) to understand JS, WASM, and auto selection.
- Use [worker handoff](worker-handoff.md) for off-main-thread frame computation.
