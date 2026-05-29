import {
  createChartRenderData,
  type ChartDensityIndex,
  type ChartDensitySeries,
  type ChartHeatmap,
  type ChartHistogram,
} from "@moritzbrantner/charts";

import { resolveFrameBackend } from "./js-backend";

import type {
  VizComputeFrameOptions,
  VizEngineBackend,
  VizEngineDatasetRecord,
  VizLayer,
  VizLayerId,
  VizRenderBounds,
  VizRenderFrame,
  VizRenderLayer,
} from "./types";

export function computeVizRenderFrame<TProperties>(
  datasets: Map<string, VizEngineDatasetRecord<TProperties>>,
  layers: Map<VizLayerId, VizLayer>,
  backend: VizEngineBackend<TProperties>,
  options: VizComputeFrameOptions,
): VizRenderFrame<TProperties> {
  const startedAt = performance.now();
  const renderLayers: Array<VizRenderLayer<TProperties>> = [];
  const usedIndexes: Array<ChartDensityIndex<TProperties>> = [];

  for (const [layerId, layer] of layers) {
    const datasetRecord = datasets.get(layer.datasetId);

    if (!datasetRecord) {
      continue;
    }

    usedIndexes.push(datasetRecord.index);
    renderLayers.push(computeVizRenderLayer(layerId, layer, datasetRecord.index, options));
  }

  return {
    layers: renderLayers,
    stats: {
      backend: resolveFrameBackend(backend, usedIndexes),
      computeMs: performance.now() - startedAt,
      datasetCount: datasets.size,
      layerCount: layers.size,
    },
  };
}

function computeVizRenderLayer<TProperties>(
  layerId: VizLayerId,
  layer: VizLayer,
  index: ChartDensityIndex<TProperties>,
  options: VizComputeFrameOptions,
): VizRenderLayer<TProperties> {
  switch (layer.kind) {
    case "binned-series": {
      const series = index.getChartSeries({
        includeEmptyBins: layer.includeEmptyBins ?? true,
        targetBinCount: layer.targetBinCount,
        valueMode: layer.valueMode ?? "average",
        xDomain: layer.xDomain ?? options.viewport.xDomain,
      });

      return {
        bounds: getSeriesBounds(series),
        datasetId: layer.datasetId,
        kind: "binned-series",
        layerId,
        rows: createChartRenderData(series.samples, {
          includeSample: true,
          modes: [layer.valueMode ?? "average", "count", "max", "min", "sum"],
        }).rows,
        series,
      };
    }
    case "histogram": {
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
  }
}

function getSeriesBounds<TProperties>(
  series: ChartDensitySeries<TProperties>,
): VizRenderBounds | null {
  const samples = series.samples.filter((sample) => sample.y !== null);

  if (!samples.length) {
    return null;
  }

  const minX = Math.min(...samples.map((sample) => sample.x0));
  const maxX = Math.max(...samples.map((sample) => sample.x1));
  const minY = Math.min(...samples.map((sample) => sample.minY ?? sample.y ?? 0));
  const maxY = Math.max(...samples.map((sample) => sample.maxY ?? sample.y ?? 0));

  return [minX, minY, maxX, maxY];
}

function getHistogramBounds<TProperties>(
  histogram: ChartHistogram<TProperties>,
): VizRenderBounds | null {
  if (!histogram.buckets.length) {
    return null;
  }

  return [
    histogram.summary.valueDomain[0],
    0,
    histogram.summary.valueDomain[1],
    Math.max(...histogram.buckets.map((bucket) => bucket.pointCount)),
  ];
}

function getHeatmapBounds<TProperties>(heatmap: ChartHeatmap<TProperties>): VizRenderBounds | null {
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
