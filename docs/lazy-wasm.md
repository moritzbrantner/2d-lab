# Lazy WASM

Use `@moritzbrantner/viz-engine/core/lazy` when the default embedded WASM
payload should not be part of the initial import.

```ts
import { createAsyncVizEngine } from "@moritzbrantner/viz-engine/core/lazy";

const engine = await createAsyncVizEngine({
  backend: "auto",
  wasm: { loadPolicy: "preload", fallback: "js" },
});
```

`loadPolicy: "preload"` waits for the wasm-pack module before returning the
engine. `loadPolicy: "on-demand"` starts loading in the background and uses JS
fallback indexes until WASM is ready. `loadPolicy: "never"` behaves like
`backend: "js"`.

When fallback is used, frame diagnostics include stable codes such as
`wasm-loading-js-fallback` or `wasm-load-failed-js-fallback`.
