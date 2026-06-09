# Frame Formats

`computeFrame` supports typed-array frames and object-shaped frames.

## Typed Frames

Typed frames are the default. They are better for high-frequency rendering,
worker transfer, and WASM-backed compute paths.

```ts
const frame = engine.computeFrame({ viewport });
```

Cartesian typed layers expose fields such as:

- `typedSeries`
- `typedHistogram`
- `typedHeatmap`
- `typedRollingSeries`

Geo typed layers expose:

- `typedGeoClusters`
- `typedGeoPoints`
- `typedGeoHeat`
- `typedGeoScalarField`
- `typedGeoFlows`

Finance typed layers expose:

- `typedCandles`
- `typedFinanceLine`
- `typedReturns`

Table typed layers expose:

- `typedTable`

GeoJSON remains object-shaped because arbitrary geometry and properties are
best consumed as GeoJSON.

## Object Frames

Object frames are useful when debugging, inspecting values, or adapting a
renderer that has not moved to typed arrays yet.

```ts
const frame = engine.computeFrame({
  frameFormat: "objects",
  viewport,
});
```

## Hydrating Typed Frames

Typed frames can be hydrated back into object-shaped layers for inspection.

```ts
const typedFrame = engine.computeFrame({ viewport });
const objectFrame = engine.hydrateFrame(typedFrame);
```

## Compatibility Aliases

The deprecated `outputMode: "compact"` option and `compact*` fields are still
available during the pre-1.0 migration. New renderers should use
`frameFormat: "typed"` and `typed*` fields.
