import {
  createVizEngine,
  getVizFrameTransferables,
  type VizSeriesPoint,
} from "@moritzbrantner/viz-engine/core";

import type { WorkerComputeMessage, WorkerFrameMessage } from "./worker-main";

type VizExampleWorkerScope = {
  onmessage: ((event: MessageEvent<WorkerComputeMessage>) => void) | null;
  postMessage(message: WorkerFrameMessage, transfer: Transferable[]): void;
};

const workerScope = self as unknown as VizExampleWorkerScope;

workerScope.onmessage = (event: MessageEvent<WorkerComputeMessage>) => {
  if (event.data.type !== "compute-frame") {
    return;
  }

  const points = createWorkerPoints(event.data.pointCount);
  const engine = createVizEngine({ backend: "auto" });
  const datasetId = engine.addDataset({ kind: "xy", points });

  engine.addLayer({
    datasetId,
    kind: "heatmap",
    xBinCount: 160,
    yBinCount: 80,
  });

  const frame = engine.computeFrame({
    viewport: { height: 320, width: 640, xDomain: [0, points.length - 1] },
  });
  const message: WorkerFrameMessage = { frame, type: "viz-frame" };

  workerScope.postMessage(message, getVizFrameTransferables(frame));
};

function createWorkerPoints(count: number): VizSeriesPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `worker-point-${index}`,
    x: index,
    y: Math.sin(index / 50) * 50 + Math.cos(index / 17) * 12,
  }));
}
