# Typed Frame Migration

Typed frames are the preferred render contract for new integrations.

## Current Compatibility Policy

- `frameFormat: "typed"` is the supported option for typed-array output.
- Omitting `frameFormat` also returns typed frames.
- `outputMode: "compact"` has been removed in the model-cleanup release.
- `compact*` frame fields have been removed in the model-cleanup release.
- Use the corresponding `typed*` fields for render workloads.

## Migration Table

| Old                     | New                    |
| ----------------------- | ---------------------- |
| `outputMode: "compact"` | `frameFormat: "typed"` |
| `compactSeries`         | `typedSeries`          |
| `compactHistogram`      | `typedHistogram`       |
| `compactHeatmap`        | `typedHeatmap`         |
| `compactRollingSeries`  | `typedRollingSeries`   |

## Recommended Pattern

```ts
const frame = engine.computeFrame({
  frameFormat: "typed",
  viewport,
});

for (const layer of frame.layers) {
  if (layer.kind === "binned-series") {
    drawSeries(layer.typedSeries);
  }
}
```

Use `engine.hydrateFrame(frame)` only for debugging or compatibility layers.
