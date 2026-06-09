# Typed Frame Migration

Typed frames are the preferred render contract for new integrations.

## Current Compatibility Policy

- `frameFormat: "typed"` is the supported option for typed-array output.
- Omitting `frameFormat` also returns typed frames.
- `outputMode: "compact"` remains as a deprecated alias during the pre-1.0
  period.
- `compact*` fields remain as deprecated aliases for the corresponding `typed*`
  fields during the pre-1.0 period.
- The aliases will not be removed in the next minor release.

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
