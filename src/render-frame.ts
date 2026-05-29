import { resolveFrameBackend, resolveFrameBackendImplementation } from "./js-backend";

import type {
  VizCartesianViewport,
  VizComputeFrameOptions,
  VizDensityIndex,
  VizDensitySeries,
  VizEngineBackend,
  VizEngineDatasetRecord,
  VizFrameDiagnostic,
  VizGeoBounds,
  VizGeoFlow,
  VizGeoFlowFeature,
  VizGeoPointIndex,
  VizGeoViewport,
  VizHeatmap,
  VizHistogram,
  VizLayer,
  VizLayerId,
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
      const aggregation = index.getViewportAggregation({
        bounds: viewport.bounds,
        zoom: viewport.zoom,
      });
      const points = aggregation.features.flatMap((feature) =>
        feature.kind === "point"
          ? [feature.point]
          : index.getClusterLeaves(feature.clusterId, feature.pointCount, 0),
      );
      const weights = points.map((point) => getGeoWeight(point.metrics, layer.weightMetric));
      const maxWeight = Math.max(1, ...weights);

      return {
        bounds: aggregation.summary.bounds,
        datasetId: layer.datasetId,
        features: points
          .map((point, pointIndex) => ({
            coordinates: [point.longitude, point.latitude] as [number, number],
            id: point.id,
            label: point.label,
            metrics: point.metrics,
            point,
            pointCount: 1,
            rawWeight: weights[pointIndex] ?? 0,
            value: Math.max(0, (weights[pointIndex] ?? 0) / maxWeight),
          }))
          .filter((feature) => feature.rawWeight > 0),
        kind: "geo-heat",
        layerId,
        maxWeight,
      };
    }
    case "geojson": {
      if (datasetRecord.dataset.kind !== "geojson") {
        pushIncompatibleLayerDiagnostic(
          layerId,
          layer.kind,
          datasetRecord.dataset.kind,
          diagnostics,
        );
        return null;
      }

      return {
        bounds: null,
        datasetId: layer.datasetId,
        featureCollection: datasetRecord.dataset.featureCollection,
        kind: "geojson",
        layerId,
      };
    }
    case "geo-flows": {
      if (datasetRecord.dataset.kind !== "geo-flows") {
        pushIncompatibleLayerDiagnostic(
          layerId,
          layer.kind,
          datasetRecord.dataset.kind,
          diagnostics,
        );
        return null;
      }
      const features = createGeoFlowFeatures(datasetRecord.dataset.flows, layer.weightMetric);

      return {
        bounds: getGeoFlowBounds(features),
        datasetId: layer.datasetId,
        features,
        kind: "geo-flows",
        layerId,
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

function getGeoWeight(metrics: Record<string, number>, weightMetric: string | undefined) {
  const weight = weightMetric ? (metrics[weightMetric] ?? 0) : (metrics.weight ?? 1);
  return Number.isFinite(weight) ? Math.max(0, weight) : 0;
}

function createGeoFlowFeatures<TProperties>(
  flows: readonly VizGeoFlow<TProperties>[],
  weightMetric: string | undefined,
): Array<VizGeoFlowFeature<TProperties>> {
  const normalized = flows
    .map((flow, index) => ({
      flow: {
        from: flow.from,
        id: String(flow.id ?? index),
        label: flow.label ?? "",
        metrics: flow.metrics ?? {},
        properties: flow.properties ?? ({} as TProperties),
        to: flow.to,
      },
      rawWeight: getGeoWeight(flow.metrics ?? {}, weightMetric),
    }))
    .filter(
      ({ flow, rawWeight }) =>
        rawWeight > 0 && flow.from.every(Number.isFinite) && flow.to.every(Number.isFinite),
    );
  const maxWeight = Math.max(1, ...normalized.map((entry) => entry.rawWeight));

  return normalized.map(({ flow, rawWeight }) => ({
    flow,
    rawWeight,
    value: rawWeight / maxWeight,
  }));
}

function getGeoFlowBounds<TProperties>(
  features: Array<VizGeoFlowFeature<TProperties>>,
): VizGeoBounds | null {
  if (!features.length) {
    return null;
  }

  const longitudes = features.flatMap((feature) => [feature.flow.from[0], feature.flow.to[0]]);
  const latitudes = features.flatMap((feature) => [feature.flow.from[1], feature.flow.to[1]]);

  return [
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes),
    Math.max(...latitudes),
  ];
}
