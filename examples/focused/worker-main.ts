// Demonstrates main-thread worker handoff using @moritzbrantner/viz-engine/worker.
// Mount from a local app; the paired worker module keeps datasets and layers in the worker.
import { createVizWorkerClient } from "@moritzbrantner/viz-engine/worker";
import type { VizSeriesPoint } from "@moritzbrantner/viz-engine/core";

export async function mountWorkerFrameExample(root: HTMLElement) {
  const worker = new Worker(new URL("./worker-thread.ts", import.meta.url), { type: "module" });
  const client = createVizWorkerClient(worker);
  const output = document.createElement("pre");
  root.replaceChildren(output);

  const points = createWorkerPoints(10_000);
  const datasetId = await client.addDataset({ kind: "xy", points });
  await client.addLayer({
    datasetId,
    kind: "heatmap",
    xBinCount: 160,
    yBinCount: 80,
  });

  const frame = await client.computeFrame({
    viewport: { height: 320, width: 640, xDomain: [0, points.length - 1] },
  });

  output.textContent = JSON.stringify(
    {
      layers: frame.layers.length,
      stats: frame.stats,
    },
    null,
    2,
  );
}

function createWorkerPoints(count: number): VizSeriesPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `worker-point-${index}`,
    x: index,
    y: Math.sin(index / 50) * 50 + Math.cos(index / 17) * 12,
  }));
}
