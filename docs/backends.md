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
  },
});
```

## What Each Mode Means

- `js` forces JavaScript fallbacks for all configured domains.
- `wasm` requests Rust/WASM-backed indexes for all configured domains.
- `auto` keeps JavaScript available while using WASM where the package can.

Explicit per-domain settings win over the global backend option.

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
