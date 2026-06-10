import type {
  VizCartesianHitTestResult,
  VizCompactDensitySeries,
  VizCompactFinanceReturns,
  VizCompactRollingSeries,
  VizHitTestOptions,
  VizRenderDatum,
  VizViewport,
} from "../types";
import {
  domainXToPixel,
  domainYToPixel,
  finiteOrNull,
  pixelToDomainX,
  yDomainFromBounds,
} from "./geometry";
import type { HitLayerBase } from "./types";

export function nearestRowsSample<TProperties>(
  rows: readonly VizRenderDatum<TProperties>[],
  layer: HitLayerBase,
  viewport: Extract<VizViewport, { kind?: "cartesian" }>,
  options: VizHitTestOptions<TProperties>,
): VizCartesianHitTestResult | null {
  const xValue = pixelToDomainX(options.x, viewport.width, viewport.xDomain);
  let nearest: VizCartesianHitTestResult | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  rows.forEach((row, index) => {
    if (row.pointCount <= 0 || row.value == null) {
      return;
    }

    const xDistance = Math.abs(domainXToPixel(row.x, viewport.width, viewport.xDomain) - options.x);
    const yDistance = layer.bounds
      ? Math.abs(
          domainYToPixel(row.value, viewport.height, yDomainFromBounds(layer.bounds)) - options.y,
        )
      : 0;
    const distancePx =
      options.mode === "nearest-point" ? Math.hypot(xDistance, yDistance) : xDistance;
    const domainDistance = Math.abs(row.x - xValue);
    const distance = Number.isFinite(distancePx) ? distancePx : domainDistance;

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = {
        datasetId: layer.datasetId,
        distancePx: distance,
        kind: "cartesian",
        layerId: layer.layerId,
        layerKind: layer.kind,
        pointCount: row.pointCount,
        sampleIndex: row.index ?? index,
        sourcePointId: row.sample?.firstPoint?.id ?? row.sample?.lastPoint?.id ?? null,
        x: row.x,
        y: row.value,
      };
    }
  });

  return nearest;
}

export function nearestBinnedSamples<TProperties>(
  samples: ReadonlyArray<{
    firstPoint?: { id?: string } | null;
    index: number;
    lastPoint?: { id?: string } | null;
    pointCount: number;
    x: number;
    x0: number;
    x1: number;
    y: number | null;
  }>,
  layer: HitLayerBase & { kind: "binned-series" },
  viewport: Extract<VizViewport, { kind?: "cartesian" }>,
  options: VizHitTestOptions<TProperties>,
) {
  const rows = samples.map(
    (sample): VizRenderDatum<TProperties> => ({
      average: sample.y,
      count: sample.pointCount,
      index: sample.index,
      label: String(sample.x),
      max: sample.y,
      min: sample.y,
      pointCount: sample.pointCount,
      sample: sample as never,
      sum: sample.y,
      value: sample.y,
      x: sample.x,
      x0: sample.x0,
      x1: sample.x1,
    }),
  );
  const result = nearestRowsSample(rows, layer, viewport, options);

  if (result) {
    const sample = samples[result.sampleIndex];
    result.sourcePointId = sample?.firstPoint?.id ?? sample?.lastPoint?.id ?? null;
  }

  return result;
}

export function nearestRollingPoints<TProperties>(
  points: ReadonlyArray<{
    index: number;
    pointCount: number;
    sourcePoint?: { id?: string } | null;
    x: number;
    y: number | null;
  }>,
  layer: HitLayerBase & { kind: "rolling-series" },
  viewport: Extract<VizViewport, { kind?: "cartesian" }>,
  options: VizHitTestOptions<TProperties>,
) {
  const rows = points.map(
    (point): VizRenderDatum<TProperties> => ({
      average: point.y,
      count: point.pointCount,
      index: point.index,
      label: String(point.x),
      max: point.y,
      min: point.y,
      pointCount: point.pointCount,
      sum: point.y,
      value: point.y,
      x: point.x,
      x0: point.x,
      x1: point.x,
    }),
  );
  const result = nearestRowsSample(rows, layer, viewport, options);

  if (result) {
    result.sourcePointId = points[result.sampleIndex]?.sourcePoint?.id ?? null;
  }

  return result;
}

export function nearestTypedBinnedSample<TProperties>(
  series: VizCompactDensitySeries,
  layer: HitLayerBase & { kind: "binned-series" },
  viewport: Extract<VizViewport, { kind?: "cartesian" }>,
  options: VizHitTestOptions<TProperties>,
) {
  const rows = Array.from({ length: series.y.length }, (_, index): VizRenderDatum<TProperties> => {
    const x = ((series.x0[index] ?? 0) + (series.x1[index] ?? 0)) / 2;
    const y = finiteOrNull(series.y[index]);

    return {
      average: finiteOrNull(series.averageY[index]),
      count: series.pointCount[index] ?? 0,
      index,
      label: String(x),
      max: finiteOrNull(series.maxY[index]),
      min: finiteOrNull(series.minY[index]),
      pointCount: series.pointCount[index] ?? 0,
      sum: finiteOrNull(series.sumY[index]),
      value: y,
      x,
      x0: series.x0[index] ?? x,
      x1: series.x1[index] ?? x,
    };
  });

  return nearestRowsSample(rows, layer, viewport, options);
}

export function nearestTypedRollingSample<TProperties>(
  series: VizCompactRollingSeries,
  layer: HitLayerBase & { kind: "rolling-series" },
  viewport: Extract<VizViewport, { kind?: "cartesian" }>,
  options: VizHitTestOptions<TProperties>,
) {
  const rows = Array.from({ length: series.y.length }, (_, index): VizRenderDatum<TProperties> => {
    const x = series.x[index] ?? 0;
    const y = finiteOrNull(series.y[index]);

    return {
      average: finiteOrNull(series.mean[index]),
      count: series.pointCount[index] ?? 0,
      index,
      label: String(x),
      max: finiteOrNull(series.max[index]),
      min: finiteOrNull(series.min[index]),
      pointCount: series.pointCount[index] ?? 0,
      sum: finiteOrNull(series.sum[index]),
      value: y,
      x,
      x0: x,
      x1: x,
    };
  });

  return nearestRowsSample(rows, layer, viewport, options);
}

export function nearestTypedFinancePoint<TProperties>(
  series: VizCompactFinanceReturns,
  layer: HitLayerBase & { kind: "finance-line" | "finance-returns" },
  viewport: Extract<VizViewport, { kind?: "cartesian" }>,
  options: VizHitTestOptions<TProperties>,
) {
  const rows = Array.from({ length: series.x.length }, (_, index): VizRenderDatum<TProperties> => {
    const x = series.x[index] ?? 0;
    const y = finiteOrNull(series.y[index]);

    return {
      average: y,
      count: series.pointCount[index] ?? 0,
      index,
      label: String(x),
      max: y,
      min: y,
      pointCount: series.pointCount[index] ?? 0,
      sum: y,
      value: y,
      x,
      x0: x,
      x1: x,
    };
  });

  return nearestRowsSample(rows, layer, viewport, options);
}
