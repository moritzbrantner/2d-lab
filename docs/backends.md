# Backends And WASM

The engine can use JavaScript indexes, Rust/WASM indexes, or automatic backend
selection.

```ts
import { createVizEngine } from "@moritzbrantner/viz-engine/core";

const engine = createVizEngine({ backend: "auto" });
```

## Backend Options

```ts
createVizEngine({ backend: "js" });
createVizEngine({ backend: "wasm" });
createVizEngine({ backend: "auto" });
```

Backend selection can also be scoped by domain:

```ts
createVizEngine({
  backend: {
    xy: "auto",
    geo: "wasm",
    finance: "wasm",
    table: "js",
  },
});
```

## What Each Mode Means

- `js` forces JavaScript fallbacks for all configured domains.
- `wasm` requests Rust/WASM-backed indexes for all configured domains.
- `auto` keeps JavaScript available while using WASM where the package can.

Explicit per-domain settings win over the global backend option.

## Table Backend

Table JS remains the default and fallback.

`backend: "wasm"` uses `RustWasmVizTableIndex` only for columnar table datasets
that declare at least one supported column type:

- `number`
- `date`
- `boolean`
- `string`

Object-row datasets remain JS even when WASM is requested.

`backend: "auto"` uses the WASM table wrapper only for supported columnar table
datasets with `>= 10_000` rows.

The WASM table wrapper accelerates row-index selection. Typed table
materialization and object row hydration still reuse the JavaScript table index.

These paths remain JS-owned or JS-fallback:

- object-row normalization
- object table frame hydration
- non-ASCII string search/filter
- non-ASCII string sort
- locale-sensitive string behavior
- JSON/unknown columns
- unsupported mixed queries that include unsupported column types

The WASM table wrapper can select row indices for supported primitive query
shapes, including multiple numeric/date/boolean/ASCII-string filters, ASCII
string search, primitive sorting, mixed filters plus sorting, multi-sort,
`rowOffset`, `rowLimit`, and null ordering. Projection and row hydration remain
JavaScript-owned after WASM returns source row indices.

Frame stats report the selected dataset-level table backend:

- Object table + `backend: "wasm"` reports `backend: "js"` and
  `backendImplementation: "js"`.
- Supported columnar table + `backend: "wasm"` reports `backend: "wasm"` and
  `backendImplementation: "rust-viz-engine-wasm"`.
- Supported columnar table + `backend: "auto"` below `10_000` rows reports JS.
- Supported columnar table + `backend: "auto"` at `10_000` rows reports WASM.

## Current Bundle Shape

The package exposes explicit bundle shapes:

- `@moritzbrantner/viz-engine/core`: current zero-config embedded path.
- `@moritzbrantner/viz-engine/core/embedded`: explicit embedded path.
- `@moritzbrantner/viz-engine/core/lazy`: async path that lazy-loads the
  wasm-pack module.
- `@moritzbrantner/viz-engine/worker`: worker client and host API.

Use `bun run bundle:size` to inspect the built artifact sizes. `core/lazy`
should not include `moritzbrantner_viz_engine_wasm_embedded`.

## Diagnostics

Every frame includes backend stats:

```ts
const frame = engine.computeFrame({ viewport });

console.log(frame.stats.backend);
console.log(frame.stats.backendImplementation);
console.log(frame.stats.backendDecisions);
console.log(frame.stats.diagnostics);
```

Lazy WASM fallbacks also report diagnostics, including
`wasm-loading-js-fallback` and `wasm-load-failed-js-fallback`.

When a requested WASM path falls back to JavaScript, diagnostics use stable
codes such as `wasm-unsupported-dataset-js-fallback`,
`wasm-unsupported-query-js-fallback`, and `wasm-query-error-js-fallback`.
`frame.stats.backendDecisions` reports one decision per used dataset with the
requested backend, selected backend, implementation, and fallback reason.
