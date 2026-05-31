import { resolveFrameBackend, resolveFrameBackendImplementation } from "./js-backend";
import { computeCartesianRenderLayer } from "./render-frame/cartesian";
import { computeFinanceRenderLayer } from "./render-frame/finance";
import { computeGeoRenderLayer } from "./render-frame/geo";
import { now } from "./render-frame/utils";

export { createVizRenderRows } from "./render-frame/utils";

import type {
  VizComputeFrameOptions,
  VizEngineBackend,
  VizEngineDatasetRecord,
  VizFrameDiagnostic,
  VizLayer,
  VizLayerId,
  VizRenderFrame,
  VizRenderLayer,
} from "./types";

export function computeVizRenderFrame<TProperties>(
  datasets: Map<string, VizEngineDatasetRecord<TProperties>>,
  layers: Map<VizLayerId, VizLayer>,
  backend: VizEngineBackend<TProperties>,
  options: VizComputeFrameOptions,
  layerCache?: Map<string, VizRenderLayer<TProperties>>,
): VizRenderFrame<TProperties> {
  const startedAt = now();
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
    const cacheKey = getRenderLayerCacheKey(layerId, layer, options);
    const cachedLayer = cacheKey ? layerCache?.get(cacheKey) : undefined;
    if (cachedLayer) {
      renderLayers.push(cachedLayer);
      continue;
    }

    const renderLayer = computeVizRenderLayer(layerId, layer, datasetRecord, options, diagnostics);

    if (renderLayer) {
      if (cacheKey) {
        layerCache?.set(cacheKey, renderLayer);
      }
      renderLayers.push(renderLayer);
    }
  }

  return {
    layers: renderLayers,
    stats: {
      backend: resolveFrameBackend(backend, usedIndexes),
      backendImplementation: resolveFrameBackendImplementation(usedIndexes),
      computeMs: now() - startedAt,
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
    case "binned-series":
    case "histogram":
    case "heatmap":
    case "rolling-series":
      return computeCartesianRenderLayer(layerId, layer, datasetRecord, options, diagnostics);
    case "geo-clusters":
    case "geo-points":
    case "geo-heat":
    case "geojson":
    case "geo-flows":
      return computeGeoRenderLayer(layerId, layer, datasetRecord, options, diagnostics);
    case "finance-candles":
    case "finance-line":
    case "finance-returns":
      return computeFinanceRenderLayer(layerId, layer, datasetRecord, options, diagnostics);
  }
}

function getRenderLayerCacheKey(
  layerId: VizLayerId,
  layer: VizLayer,
  options: VizComputeFrameOptions,
) {
  const base = {
    datasetId: layer.datasetId,
    kind: layer.kind,
    layerId,
  };

  switch (layer.kind) {
    case "binned-series":
      if (options.viewport.kind === "geo") {
        return null;
      }
      return stableCacheKey({
        ...base,
        includeEmptyBins: layer.includeEmptyBins ?? true,
        targetBinCount: layer.targetBinCount,
        valueMode: layer.valueMode ?? "average",
        xDomain: layer.xDomain ?? options.viewport.xDomain,
      });
    case "histogram":
      if (options.viewport.kind === "geo") {
        return null;
      }
      return stableCacheKey({
        ...base,
        bucketCount: layer.bucketCount,
        includeEmptyBuckets: true,
        xDomain: layer.xDomain ?? options.viewport.xDomain,
      });
    case "heatmap":
      if (options.viewport.kind === "geo") {
        return null;
      }
      return stableCacheKey({
        ...base,
        includeEmptyCells: true,
        xBinCount: layer.xBinCount,
        xDomain: layer.xDomain,
        yBinCount: layer.yBinCount,
        yDomain: layer.yDomain,
      });
    case "rolling-series":
      if (options.viewport.kind === "geo") {
        return null;
      }
      return stableCacheKey({
        ...base,
        alpha: layer.alpha,
        minPeriods: layer.minPeriods,
        statistic: layer.statistic ?? "mean",
        windowSize: layer.windowSize,
        xDomain: layer.xDomain,
      });
    case "geo-clusters":
      if (options.viewport.kind !== "geo") {
        return null;
      }
      return stableCacheKey({
        ...base,
        bounds: options.viewport.bounds,
        maxZoom: layer.maxZoom,
        minZoom: layer.minZoom,
        radius: layer.radius,
        zoom: options.viewport.zoom,
      });
    case "geo-points":
      if (options.viewport.kind !== "geo") {
        return null;
      }
      return stableCacheKey({
        ...base,
        bounds: options.viewport.bounds,
        zoom: options.viewport.zoom,
      });
    case "geo-heat":
      if (options.viewport.kind !== "geo") {
        return null;
      }
      return stableCacheKey({
        ...base,
        bounds: options.viewport.bounds,
        radiusMeters: layer.radiusMeters,
        weightMetric: layer.weightMetric,
        zoom: options.viewport.zoom,
      });
    case "geojson":
      if (options.viewport.kind !== "geo") {
        return null;
      }
      return stableCacheKey({
        ...base,
        bounds: options.viewport.bounds,
        clipToViewport: layer.clipToViewport,
        simplifyTolerance: layer.simplifyTolerance,
        zoom: options.viewport.zoom,
      });
    case "geo-flows":
      if (options.viewport.kind !== "geo") {
        return null;
      }
      return stableCacheKey({
        ...base,
        aggregate: layer.aggregate,
        bounds: options.viewport.bounds,
        minWeight: layer.minWeight,
        weightMetric: layer.weightMetric,
        zoom: options.viewport.zoom,
      });
    case "finance-candles":
      if (options.viewport.kind === "geo") {
        return null;
      }
      return stableCacheKey({
        ...base,
        priceMode: layer.priceMode ?? "raw",
        targetBarCount: layer.targetBarCount ?? 120,
        xDomain: layer.xDomain,
      });
    case "finance-line":
      if (options.viewport.kind === "geo") {
        return null;
      }
      return stableCacheKey({
        ...base,
        targetPointCount: layer.targetPointCount,
        value: layer.value ?? "close",
        xDomain: layer.xDomain,
      });
    case "finance-returns":
      if (options.viewport.kind === "geo") {
        return null;
      }
      return stableCacheKey({
        ...base,
        method: layer.method ?? "simple",
        priceMode: layer.priceMode ?? "raw",
        targetPointCount: layer.targetPointCount,
        xDomain: layer.xDomain,
      });
  }
}

function stableCacheKey(value: unknown) {
  return JSON.stringify(value);
}
