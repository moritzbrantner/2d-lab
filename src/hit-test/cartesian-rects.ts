import type {
  VizCartesianHitTestResult,
  VizCompactHeatmap,
  VizCompactHistogram,
  VizCompactOhlcvBars,
  VizHitTestOptions,
  VizRenderBounds,
} from "../types";
import {
  distanceToInterval,
  domainXToPixel,
  domainYToPixel,
  pixelToDomainX,
  pixelToDomainY,
} from "./geometry";
import type { HitLayerBase } from "./types";

export function hitTestObjectHistogram<TProperties>(
  buckets: ReadonlyArray<{
    index: number;
    pointCount: number;
    value: number;
    value0: number;
    value1: number;
  }>,
  layer: HitLayerBase & { kind: "histogram" },
  options: VizHitTestOptions<TProperties>,
): VizCartesianHitTestResult | null {
  return nearestRect(
    buckets.map((bucket) => ({
      pointCount: bucket.pointCount,
      sampleIndex: bucket.index,
      value: bucket.pointCount,
      x: bucket.value,
      x0: bucket.value0,
      x1: bucket.value1,
      y0: 0,
      y1: bucket.pointCount,
    })),
    layer,
    options,
  );
}

export function hitTestTypedHistogram<TProperties>(
  histogram: VizCompactHistogram,
  layer: HitLayerBase & { kind: "histogram" },
  options: VizHitTestOptions<TProperties>,
) {
  return nearestRect(
    Array.from({ length: histogram.value.length }, (_, index) => ({
      pointCount: histogram.pointCount[index] ?? 0,
      sampleIndex: index,
      value: histogram.pointCount[index] ?? 0,
      x: histogram.value[index] ?? 0,
      x0: histogram.value0[index] ?? 0,
      x1: histogram.value1[index] ?? 0,
      y0: 0,
      y1: histogram.pointCount[index] ?? 0,
    })),
    layer,
    options,
  );
}

export function hitTestObjectHeatmap<TProperties>(
  cells: ReadonlyArray<{
    index: number;
    pointCount: number;
    value: number;
    x: number;
    x0: number;
    x1: number;
    y0: number;
    y1: number;
  }>,
  layer: HitLayerBase & { kind: "heatmap" },
  options: VizHitTestOptions<TProperties>,
) {
  return nearestRect(
    cells.map((cell) => ({
      pointCount: cell.pointCount,
      sampleIndex: cell.index,
      value: cell.value,
      x: cell.x,
      x0: cell.x0,
      x1: cell.x1,
      y0: cell.y0,
      y1: cell.y1,
    })),
    layer,
    options,
  );
}

export function hitTestTypedHeatmap<TProperties>(
  heatmap: VizCompactHeatmap,
  layer: HitLayerBase & { kind: "heatmap" },
  options: VizHitTestOptions<TProperties>,
) {
  const xWidth =
    (heatmap.summary.xDomain[1] - heatmap.summary.xDomain[0]) / heatmap.summary.xBinCount;
  const yWidth =
    (heatmap.summary.yDomain[1] - heatmap.summary.yDomain[0]) / heatmap.summary.yBinCount;

  return nearestRect(
    Array.from({ length: heatmap.value.length }, (_, index) => {
      const xIndex = heatmap.xIndex[index] ?? 0;
      const yIndex = heatmap.yIndex[index] ?? 0;
      const x0 = heatmap.summary.xDomain[0] + xIndex * xWidth;
      const y0 = heatmap.summary.yDomain[0] + yIndex * yWidth;

      return {
        pointCount: heatmap.pointCount[index] ?? 0,
        sampleIndex: index,
        value: heatmap.value[index] ?? 0,
        x: x0 + xWidth / 2,
        x0,
        x1: x0 + xWidth,
        y0,
        y1: y0 + yWidth,
      };
    }),
    layer,
    options,
  );
}

export function hitTestObjectCandles<TProperties>(
  bars: ReadonlyArray<{
    close: number;
    high: number;
    low: number;
    timestamp: number;
  }>,
  layer: HitLayerBase & { kind: "finance-candles" },
  options: VizHitTestOptions<TProperties>,
) {
  return nearestRect(
    bars.map((bar, index) => ({
      pointCount: 1,
      sampleIndex: index,
      value: bar.close,
      x: bar.timestamp,
      x0: bar.timestamp,
      x1: bar.timestamp,
      y0: bar.low,
      y1: bar.high,
    })),
    layer,
    options,
  );
}

export function hitTestTypedCandles<TProperties>(
  bars: VizCompactOhlcvBars,
  layer: HitLayerBase & { kind: "finance-candles" },
  options: VizHitTestOptions<TProperties>,
) {
  return nearestRect(
    Array.from({ length: bars.timestamp.length }, (_, index) => ({
      pointCount: 1,
      sampleIndex: index,
      value: bars.close[index] ?? null,
      x: bars.timestamp[index] ?? 0,
      x0: bars.timestamp[index] ?? 0,
      x1: bars.timestamp[index] ?? 0,
      y0: bars.low[index] ?? 0,
      y1: bars.high[index] ?? 0,
    })),
    layer,
    options,
  );
}

function nearestRect<TProperties>(
  rects: ReadonlyArray<{
    pointCount: number;
    sampleIndex: number;
    value: number | null;
    x: number;
    x0: number;
    x1: number;
    y0: number;
    y1: number;
  }>,
  layer: HitLayerBase,
  options: VizHitTestOptions<TProperties>,
): VizCartesianHitTestResult | null {
  if (!layer.bounds) {
    return null;
  }

  const [minX, minY, maxX, maxY] = layer.bounds as VizRenderBounds;
  if (!options.viewport || options.viewport.kind === "geo" || options.viewport.kind === "table") {
    return null;
  }

  const xValue = pixelToDomainX(options.x, options.viewport.width, [minX, maxX]);
  const yValue = pixelToDomainY(options.y, options.viewport.height, [minY, maxY]);
  let nearest: VizCartesianHitTestResult | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const rect of rects) {
    if (rect.pointCount <= 0) {
      continue;
    }

    const contains =
      xValue >= Math.min(rect.x0, rect.x1) &&
      xValue <= Math.max(rect.x0, rect.x1) &&
      yValue >= Math.min(rect.y0, rect.y1) &&
      yValue <= Math.max(rect.y0, rect.y1);
    const rectX0 = domainXToPixel(rect.x0, options.viewport.width, [minX, maxX]);
    const rectX1 = domainXToPixel(rect.x1, options.viewport.width, [minX, maxX]);
    const rectY0 = domainYToPixel(rect.y0, options.viewport.height, [minY, maxY]);
    const rectY1 = domainYToPixel(rect.y1, options.viewport.height, [minY, maxY]);
    const distance = contains
      ? 0
      : Math.hypot(
          distanceToInterval(options.x, rectX0, rectX1),
          distanceToInterval(options.y, rectY0, rectY1),
        );

    if (options.mode === "contains" && !contains) {
      continue;
    }

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = {
        datasetId: layer.datasetId,
        distancePx: distance,
        kind: "cartesian",
        layerId: layer.layerId,
        layerKind: layer.kind,
        pointCount: rect.pointCount,
        sampleIndex: rect.sampleIndex,
        sourcePointId: null,
        x: rect.x,
        y: rect.value,
      };
    }
  }

  return nearest;
}
