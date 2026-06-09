# React Bindings

React bindings live at the explicit React subpath.

```tsx
import {
  VizEngineProvider,
  useVizDataset,
  useVizLayer,
  useVizTypedFrame,
} from "@moritzbrantner/viz-engine/react";
```

## Provider

```tsx
function App({ children }: { children: React.ReactNode }) {
  return <VizEngineProvider backend="auto">{children}</VizEngineProvider>;
}
```

You can also pass an existing engine:

```tsx
const engine = createVizEngine({ backend: "js" });

<VizEngineProvider engine={engine}>{children}</VizEngineProvider>;
```

## Dataset And Layer Lifecycle

```tsx
const datasetId = useVizDataset({ kind: "xy", points }, { lifecycle: "update" });
const layerId = useVizLayer(
  datasetId
    ? {
        datasetId,
        kind: "binned-series",
        targetBinCount: 120,
      }
    : null,
  { lifecycle: "update" },
);
```

`lifecycle: "update"` keeps ids stable and calls `updateDataset` or
`updateLayer` when input identities change. The default lifecycle recreates
registrations when inputs change.

## Compute A Typed Frame

```tsx
const frame = useVizTypedFrame({
  layerIds: layerId ? [layerId] : [],
  viewport: { height: 320, width: 800, xDomain: [0, 100] },
});
```

Memoize large datasets, layer objects, and viewport objects in React renderers
that update frequently.
