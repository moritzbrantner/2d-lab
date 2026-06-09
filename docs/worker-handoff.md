# Worker Handoff

Typed frames are designed for worker transfer.

## Main Thread

```ts
import { getVizFrameTransferables } from "@moritzbrantner/viz-engine/core";

worker.postMessage(
  {
    type: "viz-frame",
    frame,
  },
  getVizFrameTransferables(frame),
);
```

`getVizFrameTransferables` collects typed-array buffers from frame layers so the
browser can transfer them without copying.

## Worker Thread

```ts
import { createVizEngine, getVizFrameTransferables } from "@moritzbrantner/viz-engine/core";

const engine = createVizEngine({ backend: "auto" });

self.onmessage = (event) => {
  if (event.data.type !== "compute-frame") {
    return;
  }

  const frame = engine.computeFrame(event.data.options);
  self.postMessage({ type: "viz-frame", frame }, getVizFrameTransferables(frame));
};
```

Register datasets inside the worker when the data is large or when repeated
viewport queries should reuse worker-local indexes.
