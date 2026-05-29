import type { VizHitTestOptions, VizHitTestResult, VizRenderFrame } from "./types";

export function hitTestVizFrame<TProperties>(
  frame: VizRenderFrame<TProperties> | null,
  options: VizHitTestOptions,
): VizHitTestResult | null {
  if (!frame || !options.viewport) {
    return null;
  }

  const xValue = pixelToDomainX(options.x, options.viewport.width, options.viewport.xDomain);
  let nearest: VizHitTestResult | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const layer of frame.layers) {
    if (layer.kind !== "binned-series") {
      continue;
    }

    for (const sample of layer.series.samples) {
      if (sample.pointCount <= 0) {
        continue;
      }

      const distance = Math.abs(sample.x - xValue);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = {
          datasetId: layer.datasetId,
          layerId: layer.layerId,
          pointCount: sample.pointCount,
          sampleIndex: sample.index,
          sourcePointId: sample.firstPoint?.id ?? sample.lastPoint?.id ?? null,
          x: sample.x,
          y: sample.y,
        };
      }
    }
  }

  return nearest;
}

function pixelToDomainX(x: number, width: number, xDomain: [number, number]) {
  if (width <= 0) {
    return xDomain[0];
  }

  const ratio = Math.min(1, Math.max(0, x / width));

  return xDomain[0] + (xDomain[1] - xDomain[0]) * ratio;
}
