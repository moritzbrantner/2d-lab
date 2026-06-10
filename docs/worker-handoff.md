# Worker Handoff

Use the worker subpath when large datasets or repeated viewport queries should
stay off the main thread.

## Main Thread

```ts
import { createVizWorkerClient } from "@moritzbrantner/viz-engine/worker";

const worker = new Worker(new URL("./viz.worker.ts", import.meta.url), { type: "module" });
const client = createVizWorkerClient(worker);

const datasetId = await client.addDataset(dataset);
const layerId = await client.addLayer({
  datasetId,
  kind: "heatmap",
  xBinCount: 160,
  yBinCount: 80,
});
const frame = await client.computeFrame({ viewport });
```

Typed frames are the default response. Object frames are available with
`frameFormat: "objects"`.

## Worker Thread

```ts
import { createVizWorkerHost } from "@moritzbrantner/viz-engine/worker";

createVizWorkerHost(self as DedicatedWorkerGlobalScope, {
  backend: "auto",
  wasm: { loadPolicy: "on-demand", fallback: "js" },
});
```

The host keeps one engine in the worker. Datasets and layers are registered once
and reused across frame requests. Typed frame buffers are transferred back with
`getVizFrameTransferables`.
