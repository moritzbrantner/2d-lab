import {
  getVizFrameTransferables,
  type VizTypedRenderFrame,
} from "@moritzbrantner/viz-engine/core";

export function mountWorkerFrameExample(root: HTMLElement) {
  const worker = new Worker(new URL("./worker-thread.ts", import.meta.url), { type: "module" });
  const output = document.createElement("pre");
  root.replaceChildren(output);

  worker.onmessage = (event: MessageEvent<WorkerFrameMessage>) => {
    if (event.data.type !== "viz-frame") {
      return;
    }

    output.textContent = JSON.stringify(
      {
        layers: event.data.frame.layers.length,
        stats: event.data.frame.stats,
      },
      null,
      2,
    );
  };

  worker.postMessage({
    pointCount: 10_000,
    type: "compute-frame",
  } satisfies WorkerComputeMessage);
}

export function transferFrameFromMainThread(frame: VizTypedRenderFrame) {
  return getVizFrameTransferables(frame);
}

export type WorkerComputeMessage = {
  pointCount: number;
  type: "compute-frame";
};

export type WorkerFrameMessage = {
  frame: VizTypedRenderFrame;
  type: "viz-frame";
};
