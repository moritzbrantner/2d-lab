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
datasets with `>= 100_000` rows.

The WASM table wrapper accelerates row-index selection. Typed table
materialization and object row hydration still reuse the JavaScript table index.

These paths remain JS-owned or JS-fallback:

- object-row normalization
- object table frame hydration
- string sort
- non-ASCII string search/filter
- locale-sensitive string behavior
- JSON/unknown columns
- unsupported mixed queries
- multi-sort

Frame stats report the selected dataset-level table backend:

- Object table + `backend: "wasm"` reports `backend: "js"` and
  `backendImplementation: "js"`.
- Supported columnar table + `backend: "wasm"` reports `backend: "wasm"` and
  `backendImplementation: "rust-viz-engine-wasm"`.
- Supported columnar table + `backend: "auto"` below `100_000` rows reports JS.
- Supported columnar table + `backend: "auto"` at `100_000` rows reports WASM.

## Current Bundle Shape

The package currently embeds the local viz-engine WASM payload for zero-config
use. That keeps setup simple, but it also makes the default JavaScript bundle
larger. Use `bun run bundle:size` to inspect the built artifact sizes.

Future adoption work should evaluate a split between a zero-config embedded
entrypoint and a lighter lazy-loading entrypoint.

## Diagnostics

Every frame includes backend stats:

```ts
const frame = engine.computeFrame({ viewport });

console.log(frame.stats.backend);
console.log(frame.stats.backendImplementation);
console.log(frame.stats.diagnostics);
```
