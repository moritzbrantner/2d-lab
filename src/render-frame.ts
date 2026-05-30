import { resolveFrameBackend, resolveFrameBackendImplementation } from "./js-backend";
import { priceValue } from "./backend/finance-utils";

import type {
  VizCartesianViewport,
  VizComputeFrameOptions,
  VizDensityIndex,
  VizDensitySeries,
  VizEngineBackend,
  VizEngineDatasetRecord,
  VizFinanceIndex,
  VizFrameDiagnostic,
  VizGeoFlowIndex,
  VizGeoJsonIndex,
  VizGeoPointIndex,
  VizGeoViewport,
  VizHeatmap,
  VizHistogram,
  VizLayer,
  VizLayerId,
  VizOhlcvBar,
  VizRenderBounds,
  VizRenderDatum,
  VizRenderFrame,
  VizRenderLayer,
  VizValueMode,
} from "./types";

export function computeVizRenderFrame<TProperties>(
  datasets: Map<string, VizEngineDatasetRecord<TProperties>>,
  layers: Map<VizLayerId, VizLayer>,
  backend: VizEngineBackend<TProperties>,
  options: VizComputeFrameOptions,
): VizRenderFrame<TProperties> {
  const startedAt = performance.now();
  const renderLayers: Array<VizRenderLayer<TProperties>> = [];
  const usedIndexes: Array<VizEngineDatasetRecord<TProperties>["index"]> = [];
  const diagnostics: VizFrameDiagnostic[] = [];

  for (const [layerId, layer] of layers) {
    const datasetRecord = datasets.get(layer.datasetId);

    if (!datasetRecord) {
      diagnostics.push({
        code: "missing-dataset",
        layerId,
        message: `Layer ${layerId} references missing dataset ${layer.datasetId}.`,
        severity: "warning",
      });
      continue;
    }

    usedIndexes.push(datasetRecord.index);
    const renderLayer = computeVizRenderLayer(layerId, layer, datasetRecord, options, diagnostics);

    if (renderLayer) {
      renderLayers.push(renderLayer);
    }
  }

  return {
    layers: renderLayers,
    stats: {
      backend: resolveFrameBackend(backend, usedIndexes),
      backendImplementation: resolveFrameBackendImplementation(usedIndexes),
      computeMs: performance.now() - startedAt,
      datasetCount: datasets.size,
      diagnostics,
      layerCount: layers.size,
    },
  };
}

function computeVizRenderLayer<TProperties>(
  layerId: VizLayerId,
  layer: VizLayer,
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
    case "geo-clusters": {
      const index = getGeoPointIndex(layerId, layer.kind, datasetRecord, diagnostics);
      const viewport = getGeoViewport(options.viewport, layerId, diagnostics);
      if (!index || !viewport) {
        return null;
      }
      const aggregation = index.getViewportAggregation(
        {
          bounds: viewport.bounds,
          zoom: viewport.zoom,
        },
        {
          maxZoom: layer.maxZoom,
          minZoom: layer.minZoom,
          radius: layer.radius,
        },
      );

      return {
        aggregation,
        bounds: aggregation.summary.bounds,
        datasetId: layer.datasetId,
        features: aggregation.features,
        kind: "geo-clusters",
        layerId,
      };
    }
    case "geo-points": {
      const index = getGeoPointIndex(layerId, layer.kind, datasetRecord, diagnostics);
      const viewport = getGeoViewport(options.viewport, layerId, diagnostics);
      if (!index || !viewport) {
        return null;
      }
      const aggregation = index.getViewportAggregation({
        bounds: viewport.bounds,
        zoom: viewport.zoom,
      });

      return {
        bounds: aggregation.summary.bounds,
        datasetId: layer.datasetId,
        features: aggregation.features.flatMap((feature) =>
          feature.kind === "point"
            ? [feature.point]
            : index.getClusterLeaves(feature.clusterId, feature.pointCount, 0),
        ),
        kind: "geo-points",
        layerId,
      };
    }
    case "geo-heat": {
      const index = getGeoPointIndex(layerId, layer.kind, datasetRecord, diagnostics);
      const viewport = getGeoViewport(options.viewport, layerId, diagnostics);
      if (!index || !viewport) {
        return null;
      }
      const heat = index.getHeatFeatures(
        {
          bounds: viewport.bounds,
          zoom: viewport.zoom,
        },
        {
          radiusMeters: layer.radiusMeters,
          weightMetric: layer.weightMetric,
        },
      );

      return {
        bounds: heat.summary.bounds,
        datasetId: layer.datasetId,
        features: heat.features,
        kind: "geo-heat",
        layerId,
        maxWeight: heat.summary.maxWeight,
      };
    }
    case "geojson": {
      const index = getGeoJsonIndex(layerId, layer.kind, datasetRecord, diagnostics);
      const viewport = getGeoViewport(options.viewport, layerId, diagnostics);
      if (!index || !viewport) {
        return null;
      }
      const geojson = index.getViewportFeatures(
        {
          bounds: viewport.bounds,
          zoom: viewport.zoom,
        },
        {
          clipToViewport: layer.clipToViewport,
          simplifyTolerance: layer.simplifyTolerance,
        },
      );

      return {
        bounds: geojson.bounds,
        datasetId: layer.datasetId,
        featureCollection: geojson.featureCollection,
        featureCount: geojson.featureCount,
        kind: "geojson",
        layerId,
        viewport: geojson,
      };
    }
    case "geo-flows": {
      const index = getGeoFlowIndex(layerId, layer.kind, datasetRecord, diagnostics);
      const viewport = getGeoViewport(options.viewport, layerId, diagnostics);
      if (!index || !viewport) {
        return null;
      }
      const aggregation = index.getViewportFlows(
        {
          bounds: viewport.bounds,
          zoom: viewport.zoom,
        },
        {
          aggregate: layer.aggregate,
          minWeight: layer.minWeight,
          weightMetric: layer.weightMetric,
        },
      );

      return {
        aggregation,
        bounds: aggregation.summary.bounds,
        datasetId: layer.datasetId,
        features: aggregation.features,
        kind: "geo-flows",
        layerId,
      };
    }
    case "finance-candles": {
      const index = getFinanceIndex(layerId, layer.kind, datasetRecord, diagnostics);
      if (!index || !isCartesianViewport(options.viewport, layerId, diagnostics)) {
        return null;
      }
      const bars = index.getDownsampledBars({
        targetBarCount: layer.targetBarCount ?? 120,
        xDomain: layer.xDomain,
      });

      return {
        bars,
        bounds: getFinanceCandleBounds(bars),
        datasetId: layer.datasetId,
        instrument:
          datasetRecord.dataset.kind === "finance-ohlcv"
            ? datasetRecord.dataset.instrument
            : { symbol: "" },
        kind: "finance-candles",
        layerId,
      };
    }
    case "finance-line": {
      const index = getFinanceIndex(layerId, layer.kind, datasetRecord, diagnostics);
      if (!index || !isCartesianViewport(options.viewport, layerId, diagnostics)) {
        return null;
      }
      const bars = layer.targetPointCount
        ? index.getDownsampledBars({
            targetBarCount: layer.targetPointCount,
            xDomain: layer.xDomain,
          })
        : index.getBars({ xDomain: layer.xDomain });
      const rows = createFinanceLineRows(bars, layer.value ?? "close");

      return {
        bounds: getFinanceRowsBounds(rows),
        datasetId: layer.datasetId,
        kind: "finance-line",
        layerId,
        rows,
      };
    }
    case "finance-returns": {
      const index = getFinanceIndex(layerId, layer.kind, datasetRecord, diagnostics);
      if (!index || !isCartesianViewport(options.viewport, layerId, diagnostics)) {
        return null;
      }
      const series = index.getReturns({
        method: layer.method,
        priceMode: layer.priceMode,
        targetPointCount: layer.targetPointCount,
        xDomain: layer.xDomain,
      });

      return {
        bounds: getSeriesBounds(series),
        datasetId: layer.datasetId,
        kind: "finance-returns",
        layerId,
        rows: createVizRenderRows(series),
      };
    }
  }
}

export function createVizRenderRows<TProperties>(
  series: VizDensitySeries<TProperties>,
  valueMode: VizValueMode = "average",
): Array<VizRenderDatum<TProperties>> {
  return series.samples.map((sample) => ({
    average: sample.averageY,
    count: sample.pointCount,
    index: sample.index,
    label: sample.firstPoint?.label ?? sample.x.toString(),
    max: sample.maxY,
    metrics: sample.metrics,
    min: sample.minY,
    pointCount: sample.pointCount,
    sample,
    sum: sample.pointCount > 0 ? sample.sumY : null,
    value: getSampleRenderValue(sample, valueMode),
    x: sample.x,
    x0: sample.x0,
    x1: sample.x1,
  }));
}

function getSampleRenderValue<TProperties>(
  sample: VizDensitySeries<TProperties>["samples"][number],
  valueMode: VizValueMode,
) {
  switch (valueMode) {
    case "average":
      return sample.averageY;
    case "count":
      return sample.pointCount;
    case "max":
      return sample.maxY;
    case "min":
      return sample.minY;
    case "sum":
      return sample.pointCount > 0 ? sample.sumY : null;
  }
}

function getSeriesBounds<TProperties>(
  series: VizDensitySeries<TProperties>,
): VizRenderBounds | null {
  const samples = series.samples.filter((sample) => sample.y !== null);

  if (!samples.length) {
    return null;
  }

  const minX = Math.min(...samples.map((sample) => sample.x0));
  const maxX = Math.max(...samples.map((sample) => sample.x1));
  const minY = Math.min(...samples.map((sample) => sample.y ?? 0));
  const maxY = Math.max(...samples.map((sample) => sample.y ?? 0));

  return [minX, minY, maxX, maxY];
}

function getHistogramBounds<TProperties>(
  histogram: VizHistogram<TProperties>,
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

function getFinanceCandleBounds<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
): VizRenderBounds | null {
  if (!bars.length) {
    return null;
  }

  return [
    bars[0]?.timestamp ?? 0,
    Math.min(...bars.map((bar) => bar.low)),
    bars[bars.length - 1]?.timestamp ?? 0,
    Math.max(...bars.map((bar) => bar.high)),
  ];
}

function createFinanceLineRows<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
  value: "adjustedClose" | "close" | "high" | "low" | "open" | "volume",
): Array<VizRenderDatum<TProperties>> {
  return bars.map((bar, index) => {
    const y = priceValue(bar, value);

    return {
      average: y,
      count: y == null ? 0 : 1,
      index,
      label: String(bar.timestamp),
      max: y,
      metrics: bar.metrics,
      min: y,
      pointCount: y == null ? 0 : 1,
      sum: y,
      value: y,
      x: bar.timestamp,
      x0: bar.timestamp,
      x1: bar.timestamp,
    };
  });
}

function getFinanceRowsBounds<TProperties>(
  rows: readonly VizRenderDatum<TProperties>[],
): VizRenderBounds | null {
  const populated = rows.filter((row) => row.value != null);

  if (!populated.length) {
    return null;
  }

  return [
    Math.min(...populated.map((row) => row.x)),
    Math.min(...populated.map((row) => row.value ?? 0)),
    Math.max(...populated.map((row) => row.x)),
    Math.max(...populated.map((row) => row.value ?? 0)),
  ];
}

function getDensityIndex<TProperties>(
  layerId: VizLayerId,
  layerKind: VizLayer["kind"],
  datasetRecord: VizEngineDatasetRecord<TProperties>,
  diagnostics: VizFrameDiagnostic[],
): VizDensityIndex<TProperties> | null {
  if (datasetRecord.index.kind === "xy") {
    return datasetRecord.index.index;
  }

  pushIncompatibleLayerDiagnostic(layerId, layerKind, datasetRecord.dataset.kind, diagnostics);
  return null;
}

function getGeoPointIndex<TProperties>(
  layerId: VizLayerId,
  layerKind: VizLayer["kind"],
  datasetRecord: VizEngineDatasetRecord<TProperties>,
  diagnostics: VizFrameDiagnostic[],
): VizGeoPointIndex<TProperties> | null {
  if (datasetRecord.index.kind === "geo-points") {
    return datasetRecord.index.index;
  }

  pushIncompatibleLayerDiagnostic(layerId, layerKind, datasetRecord.dataset.kind, diagnostics);
  return null;
}

function getGeoJsonIndex<TProperties>(
  layerId: VizLayerId,
  layerKind: VizLayer["kind"],
  datasetRecord: VizEngineDatasetRecord<TProperties>,
  diagnostics: VizFrameDiagnostic[],
): VizGeoJsonIndex<TProperties> | null {
  if (datasetRecord.index.kind === "geojson") {
    return datasetRecord.index.index;
  }

  pushIncompatibleLayerDiagnostic(layerId, layerKind, datasetRecord.dataset.kind, diagnostics);
  return null;
}

function getGeoFlowIndex<TProperties>(
  layerId: VizLayerId,
  layerKind: VizLayer["kind"],
  datasetRecord: VizEngineDatasetRecord<TProperties>,
  diagnostics: VizFrameDiagnostic[],
): VizGeoFlowIndex<TProperties> | null {
  if (datasetRecord.index.kind === "geo-flows") {
    return datasetRecord.index.index;
  }

  pushIncompatibleLayerDiagnostic(layerId, layerKind, datasetRecord.dataset.kind, diagnostics);
  return null;
}

function getFinanceIndex<TProperties>(
  layerId: VizLayerId,
  layerKind: VizLayer["kind"],
  datasetRecord: VizEngineDatasetRecord<TProperties>,
  diagnostics: VizFrameDiagnostic[],
): VizFinanceIndex<TProperties> | null {
  if (datasetRecord.index.kind === "finance-ohlcv") {
    return datasetRecord.index.index;
  }

  pushIncompatibleLayerDiagnostic(layerId, layerKind, datasetRecord.dataset.kind, diagnostics);
  return null;
}

function pushIncompatibleLayerDiagnostic(
  layerId: VizLayerId,
  layerKind: VizLayer["kind"],
  datasetKind: VizEngineDatasetRecord["dataset"]["kind"],
  diagnostics: VizFrameDiagnostic[],
) {
  diagnostics.push({
    code: "incompatible-layer-dataset",
    layerId,
    message: `Layer ${layerId} of kind ${layerKind} cannot render dataset kind ${datasetKind}.`,
    severity: "warning",
  });
}

function isCartesianViewport(
  viewport: VizComputeFrameOptions["viewport"],
  layerId: VizLayerId,
  diagnostics: VizFrameDiagnostic[],
): viewport is VizCartesianViewport {
  if (viewport.kind === "geo") {
    diagnostics.push({
      code: "incompatible-viewport",
      layerId,
      message: `Layer ${layerId} needs a cartesian viewport.`,
      severity: "warning",
    });
    return false;
  }

  return true;
}

function getGeoViewport(
  viewport: VizComputeFrameOptions["viewport"],
  layerId: VizLayerId,
  diagnostics: VizFrameDiagnostic[],
): VizGeoViewport | null {
  if (viewport.kind === "geo") {
    return viewport;
  }

  diagnostics.push({
    code: "incompatible-viewport",
    layerId,
    message: `Layer ${layerId} needs a geo viewport.`,
    severity: "warning",
  });
  return null;
}
