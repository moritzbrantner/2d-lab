// Demonstrates worker-side frame computation using @moritzbrantner/viz-engine/worker.
// Pair with worker-main.ts or copy both modules into a consumer app.
import { createVizWorkerHost } from "@moritzbrantner/viz-engine/worker";

createVizWorkerHost(self as Parameters<typeof createVizWorkerHost>[0], {
  backend: "auto",
  wasm: { fallback: "js", loadPolicy: "on-demand" },
});
