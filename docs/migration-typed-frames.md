# Typed Frame Migration

Typed frames are the preferred render contract for new integrations.

## Current Compatibility Policy

- `frameFormat: "typed"` is the supported option for typed-array output.
- Omitting `frameFormat` also returns typed frames.
- `outputMode: "compact"` has been removed in the model-cleanup release.
- `compact*` frame fields have been removed in the model-cleanup release.
- `VizCompact*` exported type names have been removed in the model-cleanup release.
- Public `getCompact*` index methods have been removed in the model-cleanup release.
- Use the corresponding `typed*` fields for render workloads.

## Migration Table

### Frame Options And Fields

| Old                     | New                    |
| ----------------------- | ---------------------- |
| `outputMode: "compact"` | `frameFormat: "typed"` |
| `compactSeries`         | `typedSeries`          |
| `compactHistogram`      | `typedHistogram`       |
| `compactHeatmap`        | `typedHeatmap`         |
| `compactRollingSeries`  | `typedRollingSeries`   |

### Public Types And Index Methods

| Old                           | New                         |
| ----------------------------- | --------------------------- |
| `VizCompactDensitySeries`     | `VizTypedDensitySeries`     |
| `VizCompactHistogram`         | `VizTypedHistogram`         |
| `VizCompactHeatmap`           | `VizTypedHeatmap`           |
| `VizCompactRollingSeries`     | `VizTypedRollingSeries`     |
| `VizCompactOhlcvBars`         | `VizTypedOhlcvBars`         |
| `VizCompactFinanceReturns`    | `VizTypedFinanceReturns`    |
| `getCompactChartSeries()`     | `getTypedBinnedSeries()`    |
| `getCompactHistogram()`       | `getTypedHistogram()`       |
| `getCompactHeatmap()`         | `getTypedHeatmap()`         |
| `getCompactRollingSeries()`   | `getTypedRollingSeries()`   |
| `getCompactBars()`            | `getTypedBars()`            |
| `getCompactDownsampledBars()` | `getTypedDownsampledBars()` |
| `getCompactReturns()`         | `getTypedReturns()`         |

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
