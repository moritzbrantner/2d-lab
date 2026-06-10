# Errors And Diagnostics

Use errors for unrecoverable API or runtime failures, and frame diagnostics for
recoverable rendering decisions.

## Errors

Public errors extend `VizEngineError` and expose a stable `code` plus optional
`details`.

```ts
import {
  VizDisposedError,
  isVizEngineError,
  serializeVizError,
} from "@moritzbrantner/viz-engine/core";

try {
  engine.computeFrame({ viewport });
} catch (error) {
  if (isVizEngineError(error)) {
    console.log(error.code, error.details);
  }
}

engine.dispose();
```

Worker clients and hosts serialize errors with `serializeVizError()` and
`deserializeVizError()`, so codes such as `viz-disposed`, `viz-aborted`,
`viz-worker-timeout`, and `viz-wasm-unavailable` survive worker boundaries.

## Diagnostics

Every frame includes diagnostics and backend decisions:

```ts
const frame = engine.computeFrame({ viewport });

for (const decision of frame.stats.backendDecisions ?? []) {
  console.log(decision.datasetId, decision.requested, decision.selected);
}

for (const diagnostic of frame.stats.diagnostics) {
  console.log(diagnostic.code, diagnostic.domain, diagnostic.details);
}
```

Diagnostics are used for recoverable conditions such as missing layers,
incompatible viewports, lazy WASM loading fallbacks, unsupported table WASM
queries, and WASM query exceptions that successfully fall back to JavaScript.
