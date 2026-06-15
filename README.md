# @moritzbrantner/viz-engine

Experimental renderer-agnostic data/frame engine backed by JavaScript
fallbacks and Rust/WASM kernels for XY, geo, finance, and table data.

`createVizEngine` lets multiple chart layers share datasets and indexes, then
returns a render frame that SVG, Canvas, WebGL, React components, workers, or
server renderers can consume.

```ts
import { createVizEngine } from "@moritzbrantner/viz-engine";

const engine = createVizEngine({ backend: "auto" });
const datasetId = engine.addDataset({ kind: "xy", points });

engine.addLayer({
  datasetId,
  kind: "binned-series",
  targetBinCount: 120,
  valueMode: "average",
});

const frame = engine.computeFrame({
  viewport: { height: 320, width: 800, xDomain: [0, 1_440] },
});
```

Typed-array frames are the default for render workloads. Object-shaped frames
are still available when debugging or adapting a renderer:

```ts
const typedFrame = engine.computeFrame({ viewport });
const objectFrame = engine.computeFrame({ frameFormat: "objects", viewport });
const hydratedFrame = engine.hydrateFrame(typedFrame);
```

## Import Paths

| Import path                                | Use it for                                                         |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `@moritzbrantner/viz-engine`               | Primary sync core data/frame engine APIs without React.            |
| `@moritzbrantner/viz-engine/core`          | Explicit sync core alias without React.                            |
| `@moritzbrantner/viz-engine/core/embedded` | Explicit embedded core alias.                                      |
| `@moritzbrantner/viz-engine/core/lazy`     | Async core API with lazy WASM loading.                             |
| `@moritzbrantner/viz-engine/worker`        | Worker client and host APIs for off-main-thread frame computation. |
| `@moritzbrantner/viz-engine/react`         | React lifecycle bindings.                                          |

## Docs

- [Getting started](docs/getting-started.md)
- [Frame formats](docs/frame-formats.md)
- [Table data](docs/table-data.md)
- [Backends and WASM](docs/backends.md)
- [Lazy WASM](docs/lazy-wasm.md)
- [Focused examples](docs/examples.md)
- [React bindings](docs/react.md)
- [Worker handoff](docs/worker-handoff.md)
- [Typed frame migration](docs/migration-typed-frames.md)
- [Why this exists](docs/why-this-exists.md)

## Architecture

- TypeScript owns engine state, backend selection, frame assembly, cache
  coordination, hit testing, and renderer-facing data shapes.
- Rust crates own reusable computation for data-heavy kernels.
- JavaScript fallbacks preserve the same public contracts.
- Renderers own visuals, axes, legends, labels, formatting, selection UI, virtualization, and consume returned frame layers.
- React hooks coordinate engine lifecycle only.

The package boundary is:

```txt
moritzbrantner-viz-engine-core: local Rust XY computation
moritzbrantner-viz-engine-wasm: local browser binding for XY computation
finance-data: reusable Rust financial market-data core in rust-packages
finance-statistics: reusable Rust return/risk/statistics crate in rust-packages
@moritzbrantner/viz-engine: TypeScript runtime wrapper
charts/maps/tables/future packages: visuals
```

The rule is:

```txt
Rust crates own computation.
TypeScript owns integration.
charts/maps/tables/future packages own visuals.
```

## Development

```sh
bun install
bun run check-types
bun run test
bun run build
bun run package:smoke
```

Benchmark commands and caveats live in [bench/README.md](bench/README.md).
