# Table Data

Table support prepares renderer-neutral data for a future tables package. The
engine owns schema inference, filtering, searching, sorting, and row windowing.
Renderers own DOM, formatting, virtualization, selection UI, and editing.

## Object Rows

Object-row datasets are the ergonomic default for app data and JSON/CSV loaders.
Columns are inferred in first-seen key order when `columns` is omitted.

```ts
const datasetId = engine.addDataset({
  kind: "table",
  rows: [
    { id: "a", name: "Ada", score: 10, active: true },
    { id: "b", name: "Ben", score: 5, active: false },
  ],
  rowIdKey: "id",
});
```

Use explicit columns when renderer-facing ids, labels, ordering, or types need
to be stable.

```ts
engine.addDataset({
  kind: "table",
  rows,
  columns: [
    { id: "name", label: "Name", type: "string" },
    { id: "score", label: "Score", type: "number" },
    { id: "createdAt", label: "Created", type: "date" },
  ],
});
```

## Columnar Data

Columnar datasets are useful for large data and worker transfer. Numeric, date,
and boolean columns can be stored compactly while string and JSON columns remain
side arrays.

```ts
const datasetId = engine.addDataset({
  kind: "table",
  rowIds: ["a", "b"],
  columns: [
    { id: "name", type: "string", values: ["Ada", "Ben"] },
    { id: "score", type: "number", values: Float64Array.from([10, 5]) },
    { id: "active", type: "boolean", values: Uint8Array.from([1, 0]) },
  ],
});
```

`validity` masks use `1` for present values and `0` for null values.

## Layers And Viewports

Table state that changes returned rows lives in the table layer query and table
viewport. Layer `rowOffset` and `rowLimit` win over viewport defaults.

```ts
engine.addLayer({
  datasetId,
  kind: "table",
  query: {
    filters: [{ columnId: "score", operator: "gte", value: 6 }],
    rowLimit: 100,
    search: { query: "ada", columnIds: ["name"] },
    sort: [{ columnId: "score", direction: "desc" }],
  },
});

const frame = engine.computeFrame({
  viewport: { kind: "table", rowOffset: 0, rowLimit: 100 },
});
```

Filtering runs before search, sorting runs after search, and row windowing runs
last. Sorts are stable and use source row index as the final tie-breaker.

## Frame Consumption

Typed frames are the default. Table typed layers expose `typedTable`:

```ts
const layer = frame.layers.find((candidate) => candidate.kind === "table");

if (layer && "typedTable" in layer) {
  console.log(layer.typedTable.columns);
  console.log(layer.typedTable.rowIds);
  console.log(layer.typedTable.sourceIndex);
  console.log(layer.typedTable.typedColumns);
}
```

Object frames and hydrated typed frames expose `table.rows`, where each row has
`rowId`, `sourceIndex`, and ordered cells.

```ts
const objectFrame = engine.computeFrame({
  frameFormat: "objects",
  viewport: { kind: "table" },
});
```

Dates are represented as numeric timestamps in typed table columns and hydrated
object rows. Renderers should format display values themselves.
