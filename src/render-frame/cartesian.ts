import {
  createRollingRenderRows,
  createVizRenderRows,
  getDensityIndex,
  getRenderRowsBounds,
  getSeriesBounds,
  isCartesianViewport,
} from "./utils";

import type {
  VizComputeFrameOptions,
  VizEngineDatasetRecord,
  VizFrameDiagnostic,
  VizHeatmap,
  VizHistogram,
  VizLayer,
  VizLayerId,
  VizRenderBounds,
  VizRenderLayer,
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
): VizRenderLayer<TProperties> | null {
  switch (layer.kind) {
    case "binned-series": {
      const index = getDensityIndex(layerId, layer.kind, datasetRecord, diagnostics);
      if (!index || !isCartesianViewport(options.viewport, layerId, diagnostics)) {
        return null;
      }
      const valueMode = layer.valueMode ?? "average";
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
