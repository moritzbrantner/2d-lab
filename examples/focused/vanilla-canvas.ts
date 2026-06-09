// Demonstrates a vanilla Canvas renderer using @moritzbrantner/viz-engine/core.
// Mount from a local app or copy the renderer pattern into a consumer project.
import { createVizEngine, type VizSeriesPoint } from "@moritzbrantner/viz-engine/core";

export function mountVanillaCanvasExample(root: HTMLElement) {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 280;
  root.replaceChildren(canvas);

  const points = createWavePoints(2_000);
  const engine = createVizEngine({ backend: "auto" });
  const datasetId = engine.addDataset({ kind: "xy", points });

  engine.addLayer({
    datasetId,
    kind: "binned-series",
    targetBinCount: canvas.width,
  });

  const frame = engine.computeFrame({
    viewport: { height: canvas.height, width: canvas.width, xDomain: [0, points.length - 1] },
  });
  const layer = frame.layers.find((candidate) => candidate.kind === "binned-series");

  if (!layer || layer.kind !== "binned-series" || !("typedSeries" in layer)) {
    return;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const yValues = layer.typedSeries.y;
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const yRange = Math.max(1, maxY - minY);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#2563eb";
  context.lineWidth = 2;
  context.beginPath();

  for (let index = 0; index < yValues.length; index += 1) {
    const x = index;
    const y = canvas.height - ((yValues[index] - minY) / yRange) * canvas.height;

    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }

  context.stroke();
}

function createWavePoints(count: number): VizSeriesPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `point-${index}`,
    x: index,
    y: Math.sin(index / 40) * 20 + Math.cos(index / 13) * 8 + index / 200,
  }));
}
