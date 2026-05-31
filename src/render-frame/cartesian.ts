import {
  createRollingRenderRows,
  createVizRenderRows,
  getDensityIndex,
  getRenderRowsBounds,
  getSeriesBounds,
  isCartesianViewport,
} from "./utils";

import type {
  VizCompactDensitySeries,
  VizCompactHistogram,
  VizCompactRollingSeries,
  VizComputeFrameOptions,
  VizEngineDatasetRecord,
  VizFrameDiagnostic,
  VizHeatmap,
  VizCompactHeatmap,
  VizHistogram,
  VizLayer,
  VizLayerId,
  VizRenderBounds,
  VizAnyRenderLayer,
} from "../types";

type CartesianLayer = Extract<
  VizLayer,
  { kind: "binned-series" | "heatmap" | "histogram" | "rolling-series" }
>;

export function computeCartesianRenderLayer<TProperties>(
  layerId: VizLayerId,
  layer: CartesianLayer,
  datasetRecord: VizEngineDatasetRecord<TProperties>,
  options: VizComputeFrameOptions,
  diagnostics: VizFrameDiagnostic[],
): VizAnyRenderLayer<TProperties> | null {
  switch (layer.kind) {
    case "binned-series": {
      const index = getDensityIndex(layerId, layer.kind, datasetRecord, diagnostics);
      if (!index || !isCartesianViewport(options.viewport, layerId, diagnostics)) {
        return null;
      }
      const valueMode = layer.valueMode ?? "average";
      if (options.outputMode === "compact") {
        preferWasmForCompactOutput(index);
        const compactSeries = index.getCompactChartSeries({
          includeEmptyBins: layer.includeEmptyBins ?? true,
          targetBinCount: layer.targetBinCount,
          valueMode,
          xDomain: layer.xDomain ?? options.viewport.xDomain,
        });

        return {
          bounds: getCompactSeriesBounds(compactSeries),
          compactSeries,
          datasetId: layer.datasetId,
          kind: "binned-series",
          layerId,
          outputMode: "compact",
          valueMode,
        };
      }
      const series = index.getChartSeries({
        includeEmptyBins: layer.includeEmptyBins ?? true,
        targetBinCount: layer.targetBinCount,
        valueMode,
        xDomain: layer.xDomain ?? options.viewport.xDomain,
      });

      return {
        bounds: getSeriesBounds(series),
        datasetId: layer.datasetId,
        kind: "binned-series",
        layerId,
        rows: createVizRenderRows(series, valueMode),
        series,
      };
    }
    case "histogram": {
      const index = getDensityIndex(layerId, layer.kind, datasetRecord, diagnostics);
      if (!index || !isCartesianViewport(options.viewport, layerId, diagnostics)) {
        return null;
      }
      if (options.outputMode === "compact") {
        preferWasmForCompactOutput(index);
        const compactHistogram = index.getCompactHistogram({
          bucketCount: layer.bucketCount,
          includeEmptyBuckets: true,
          xDomain: layer.xDomain ?? options.viewport.xDomain,
        });

        return {
          bounds: getCompactHistogramBounds(compactHistogram),
          compactHistogram,
          datasetId: layer.datasetId,
          kind: "histogram",
          layerId,
          outputMode: "compact",
        };
      }
      const histogram = index.getHistogram({
        bucketCount: layer.bucketCount,
        includeEmptyBuckets: true,
        xDomain: layer.xDomain ?? options.viewport.xDomain,
      });

      return {
        bounds: getHistogramBounds(histogram),
        buckets: histogram.buckets,
        datasetId: layer.datasetId,
        kind: "histogram",
        layerId,
      };
    }
    case "heatmap": {
      const index = getDensityIndex(layerId, layer.kind, datasetRecord, diagnostics);
      if (!index || !isCartesianViewport(options.viewport, layerId, diagnostics)) {
        return null;
      }
      if (options.outputMode === "compact") {
        preferWasmForCompactOutput(index);
        const compactHeatmap = index.getCompactHeatmap({
          includeEmptyCells: true,
          xBinCount: layer.xBinCount,
          xDomain: layer.xDomain,
          yBinCount: layer.yBinCount,
          yDomain: layer.yDomain,
        });

        return {
          bounds: getCompactHeatmapBounds(compactHeatmap),
          compactHeatmap,
          datasetId: layer.datasetId,
          kind: "heatmap",
          layerId,
          outputMode: "compact",
        };
      }
      const heatmap = index.getHeatmap({
        includeEmptyCells: true,
        xBinCount: layer.xBinCount,
        xDomain: layer.xDomain,
        yBinCount: layer.yBinCount,
        yDomain: layer.yDomain,
      });

      return {
        bounds: getHeatmapBounds(heatmap),
        cells: heatmap.cells,
        datasetId: layer.datasetId,
        kind: "heatmap",
        layerId,
      };
    }
    case "rolling-series": {
      const index = getDensityIndex(layerId, layer.kind, datasetRecord, diagnostics);
      if (!index || !isCartesianViewport(options.viewport, layerId, diagnostics)) {
        return null;
      }
      const statistic = layer.statistic ?? "mean";
      if (options.outputMode === "compact") {
        preferWasmForCompactOutput(index);
        const compactRollingSeries = index.getCompactRollingSeries({
          alpha: layer.alpha,
          minPeriods: layer.minPeriods,
          statistic,
          windowSize: layer.windowSize,
          xDomain: layer.xDomain,
        });

        return {
          bounds: getCompactRollingBounds(compactRollingSeries),
          compactRollingSeries,
          datasetId: layer.datasetId,
          kind: "rolling-series",
          layerId,
          outputMode: "compact",
          statistic,
        };
      }
      const series = index.getRollingSeries({
        alpha: layer.alpha,
        minPeriods: layer.minPeriods,
        statistic,
        windowSize: layer.windowSize,
        xDomain: layer.xDomain,
      });
      const rows = createRollingRenderRows(series);

      return {
        bounds: getRenderRowsBounds(rows),
        datasetId: layer.datasetId,
        kind: "rolling-series",
        layerId,
        rows,
        series,
        statistic,
      };
    }
  }
}

function preferWasmForCompactOutput(index: unknown) {
  const maybeProgressiveIndex = index as { useWasmIndex?: () => void };

  maybeProgressiveIndex.useWasmIndex?.();
}

function getCompactSeriesBounds(series: VizCompactDensitySeries): VizRenderBounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let hasSamples = false;

  for (let index = 0; index < series.y.length; index += 1) {
    const y = series.y[index]!;
    if (!Number.isFinite(y)) {
      continue;
    }

    hasSamples = true;
    minX = Math.min(minX, series.x0[index]!);
    maxX = Math.max(maxX, series.x1[index]!);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return hasSamples ? [minX, minY, maxX, maxY] : null;
}

function getHistogramBounds<TProperties>(
  histogram: VizHistogram<TProperties>,
): VizRenderBounds | null {
  if (!histogram.buckets.length) {
    return null;
  }

  let maxPointCount = 0;

  for (const bucket of histogram.buckets) {
    maxPointCount = Math.max(maxPointCount, bucket.pointCount);
  }

  return [histogram.summary.valueDomain[0], 0, histogram.summary.valueDomain[1], maxPointCount];
}

function getCompactHistogramBounds(histogram: VizCompactHistogram): VizRenderBounds | null {
  if (!histogram.pointCount.length) {
    return null;
  }

  let maxPointCount = 0;

  for (const pointCount of histogram.pointCount) {
    maxPointCount = Math.max(maxPointCount, pointCount);
  }

  return [histogram.summary.valueDomain[0], 0, histogram.summary.valueDomain[1], maxPointCount];
}

function getHeatmapBounds<TProperties>(heatmap: VizHeatmap<TProperties>): VizRenderBounds | null {
  if (!heatmap.cells.length) {
    return null;
  }

  return [
    heatmap.summary.xDomain[0],
    heatmap.summary.yDomain[0],
    heatmap.summary.xDomain[1],
    heatmap.summary.yDomain[1],
  ];
}

function getCompactHeatmapBounds(heatmap: VizCompactHeatmap): VizRenderBounds | null {
  if (!heatmap.pointCount.length) {
    return null;
  }

  return [
    heatmap.summary.xDomain[0],
    heatmap.summary.yDomain[0],
    heatmap.summary.xDomain[1],
    heatmap.summary.yDomain[1],
  ];
}

function getCompactRollingBounds(series: VizCompactRollingSeries): VizRenderBounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let hasRows = false;

  for (let index = 0; index < series.y.length; index += 1) {
    const y = series.y[index]!;
    if (!Number.isFinite(y)) {
      continue;
    }

    const x = series.x[index]!;
    hasRows = true;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return hasRows ? [minX, minY, maxX, maxY] : null;
}
