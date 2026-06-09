import { resolveFrameBackend, resolveFrameBackendImplementation } from "./js-backend";
import { computeCartesianRenderLayer } from "./render-frame/cartesian";
import { computeFinanceRenderLayer } from "./render-frame/finance";
import { computeGeoRenderLayer } from "./render-frame/geo";
import { computeTableRenderLayer, resolveTableQuery } from "./render-frame/table";
import { now, resolveFrameFormat } from "./render-frame/utils";

export { createVizRenderRows } from "./render-frame/utils";

import type {
  VizAnyRenderFrame,
  VizAnyRenderLayer,
  VizCompactComputeFrameOptions,
  VizCompactRenderFrame,
  VizComputeFrameOptions,
  VizEngineBackend,
  VizEngineDatasetRecord,
  VizEngineLayerRecord,
  VizFrameDiagnostic,
  VizLayer,
  VizLayerId,
  VizObjectComputeFrameOptions,
  VizRenderFrame,
  VizTypedComputeFrameOptions,
  VizTypedRenderFrame,
} from "./types";

export type VizRenderLayerCache<TProperties = Record<string, unknown>> = {
  clear(): void;
  deleteLayer(layerId: VizLayerId): void;
  get(query: VizRenderLayerCacheQuery): VizAnyRenderLayer<TProperties> | undefined;
  set(query: VizRenderLayerCacheQuery, layer: VizAnyRenderLayer<TProperties>): number;
};

export type VizRenderLayerCacheQuery = {
  datasetId: string;
  datasetVersion: number;
  frameFormat: "objects" | "typed";
  layerId: VizLayerId;
  layerVersion: number;
  querySignature: string;
  viewportSignature: string;
};

type LayerEntry = VizLayer | VizEngineLayerRecord;

export function computeVizRenderFrame<TProperties>(
  datasets: Map<string, VizEngineDatasetRecord<TProperties>>,
  layers: Map<VizLayerId, LayerEntry>,
  backend: VizEngineBackend<TProperties>,
  options: VizObjectComputeFrameOptions,
  layerCache?: VizRenderLayerCache<TProperties>,
): VizRenderFrame<TProperties>;
export function computeVizRenderFrame<TProperties>(
  datasets: Map<string, VizEngineDatasetRecord<TProperties>>,
  layers: Map<VizLayerId, LayerEntry>,
  backend: VizEngineBackend<TProperties>,
  options: VizCompactComputeFrameOptions,
  layerCache?: VizRenderLayerCache<TProperties>,
): VizCompactRenderFrame<TProperties>;
export function computeVizRenderFrame<TProperties>(
  datasets: Map<string, VizEngineDatasetRecord<TProperties>>,
  layers: Map<VizLayerId, LayerEntry>,
  backend: VizEngineBackend<TProperties>,
  options: VizTypedComputeFrameOptions,
  layerCache?: VizRenderLayerCache<TProperties>,
): VizTypedRenderFrame<TProperties>;
export function computeVizRenderFrame<TProperties>(
  datasets: Map<string, VizEngineDatasetRecord<TProperties>>,
  layers: Map<VizLayerId, LayerEntry>,
  backend: VizEngineBackend<TProperties>,
  options: VizComputeFrameOptions,
  layerCache?: VizRenderLayerCache<TProperties>,
): VizAnyRenderFrame<TProperties> {
  const startedAt = now();
  const renderLayers: Array<VizAnyRenderLayer<TProperties>> = [];
  const usedIndexes: Array<VizEngineDatasetRecord<TProperties>["index"]> = [];
  const diagnostics: VizFrameDiagnostic[] = [];
  let cacheHitCount = 0;
  let cacheMissCount = 0;
  let cacheEvictionCount = 0;
  const requestedLayerEntries = options.layerIds
    ? options.layerIds.flatMap((layerId) => {
        const layerEntry = layers.get(layerId);
        if (!layerEntry) {
          diagnostics.push({
            code: "missing-layer",
            layerId,
            message: `Requested layer ${layerId} does not exist.`,
            severity: "warning",
          });
          return [];
        }

        return [[layerId, normalizeLayerEntry(layerEntry)] as const];
      })
    : [...layers].map(
        ([layerId, layerEntry]) => [layerId, normalizeLayerEntry(layerEntry)] as const,
      );

  for (const [layerId, layerRecord] of requestedLayerEntries) {
    const layer = layerRecord.layer;
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
    const cacheQuery = getRenderLayerCacheQuery(
      layerId,
      layerRecord.version ?? 0,
      datasetRecord.version ?? 0,
      layer,
      options,
    );
    const cachedLayer = cacheQuery ? layerCache?.get(cacheQuery) : undefined;
    if (cachedLayer) {
      cacheHitCount += 1;
      renderLayers.push(cachedLayer);
      continue;
    }

    if (cacheQuery) {
      cacheMissCount += 1;
    }
    const renderLayer = computeVizRenderLayer(layerId, layer, datasetRecord, options, diagnostics);

    if (renderLayer) {
      if (cacheQuery) {
        cacheEvictionCount += layerCache?.set(cacheQuery, renderLayer) ?? 0;
      }
      renderLayers.push(renderLayer);
    }
  }

  return {
    layers: renderLayers,
    stats: {
      backend: resolveFrameBackend(backend, usedIndexes),
      backendImplementation: resolveFrameBackendImplementation(usedIndexes),
      cacheEvictionCount,
      computeMs: now() - startedAt,
      cacheHitCount,
      cacheMissCount,
      datasetCount: datasets.size,
      diagnostics,
      layerCount: layers.size,
      renderedLayerCount: renderLayers.length,
      skippedLayerCount: Math.max(0, layers.size - renderLayers.length),
    },
  };
}

function computeVizRenderLayer<TProperties>(
  layerId: VizLayerId,
  layer: VizLayer,
  datasetRecord: VizEngineDatasetRecord<TProperties>,
  options: VizComputeFrameOptions,
  diagnostics: VizFrameDiagnostic[],
): VizAnyRenderLayer<TProperties> | null {
  switch (layer.kind) {
    case "binned-series":
    case "histogram":
    case "heatmap":
    case "rolling-series":
      return computeCartesianRenderLayer(layerId, layer, datasetRecord, options, diagnostics);
    case "geo-clusters":
    case "geo-points":
    case "geo-heat":
    case "geo-scalar-field":
    case "geojson":
    case "geo-flows":
      return computeGeoRenderLayer(layerId, layer, datasetRecord, options, diagnostics);
    case "finance-candles":
    case "finance-line":
    case "finance-returns":
      return computeFinanceRenderLayer(layerId, layer, datasetRecord, options, diagnostics);
    case "table":
      return computeTableRenderLayer(layerId, layer, datasetRecord, options, diagnostics);
  }
}

function normalizeLayerEntry(layerEntry: LayerEntry): Required<VizEngineLayerRecord> {
  if ("layer" in layerEntry) {
    return {
      layer: layerEntry.layer,
      version: layerEntry.version ?? 0,
    };
  }

  return {
    layer: layerEntry,
    version: 0,
  };
}

function getRenderLayerCacheQuery(
  layerId: VizLayerId,
  layerVersion: number,
  datasetVersion: number,
  layer: VizLayer,
  options: VizComputeFrameOptions,
): VizRenderLayerCacheQuery | null {
  const base = {
    datasetId: layer.datasetId,
    frameFormat: resolveFrameFormat(options),
    layerId,
    layerVersion,
    datasetVersion,
  };
  const viewportSignature = getViewportSignature(options);

  switch (layer.kind) {
    case "binned-series":
      if (options.viewport.kind === "geo" || options.viewport.kind === "table") {
        return null;
      }
      return createLayerCacheQuery(base, viewportSignature, {
        kind: layer.kind,
        includeEmptyBins: layer.includeEmptyBins ?? true,
        targetBinCount: layer.targetBinCount,
        valueMode: layer.valueMode ?? "average",
        xDomain: layer.xDomain ?? options.viewport.xDomain,
      });
    case "histogram":
      if (options.viewport.kind === "geo" || options.viewport.kind === "table") {
        return null;
      }
      return createLayerCacheQuery(base, viewportSignature, {
        kind: layer.kind,
        bucketCount: layer.bucketCount,
        includeEmptyBuckets: true,
        xDomain: layer.xDomain ?? options.viewport.xDomain,
      });
    case "heatmap":
      if (options.viewport.kind === "geo" || options.viewport.kind === "table") {
        return null;
      }
      return createLayerCacheQuery(base, viewportSignature, {
        kind: layer.kind,
        includeEmptyCells: true,
        xBinCount: layer.xBinCount,
        xDomain: layer.xDomain ?? options.viewport.xDomain,
        yBinCount: layer.yBinCount,
        yDomain: layer.yDomain,
      });
    case "rolling-series":
      if (options.viewport.kind === "geo" || options.viewport.kind === "table") {
        return null;
      }
      return createLayerCacheQuery(base, viewportSignature, {
        kind: layer.kind,
        alpha: layer.alpha,
        minPeriods: layer.minPeriods,
        statistic: layer.statistic ?? "mean",
        windowSize: layer.windowSize,
        xDomain: layer.xDomain ?? options.viewport.xDomain,
      });
    case "geo-clusters":
      if (options.viewport.kind !== "geo") {
        return null;
      }
      return createLayerCacheQuery(base, viewportSignature, {
        kind: layer.kind,
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
      return createLayerCacheQuery(base, viewportSignature, {
        kind: layer.kind,
        bounds: options.viewport.bounds,
        zoom: options.viewport.zoom,
      });
    case "geo-heat":
      if (options.viewport.kind !== "geo") {
        return null;
      }
      return createLayerCacheQuery(base, viewportSignature, {
        kind: layer.kind,
        bounds: options.viewport.bounds,
        radiusMeters: layer.radiusMeters,
        weightMetric: layer.weightMetric,
        zoom: options.viewport.zoom,
      });
    case "geo-scalar-field":
      if (options.viewport.kind !== "geo") {
        return null;
      }
      return createLayerCacheQuery(base, viewportSignature, {
        kind: layer.kind,
        bounds: options.viewport.bounds,
        fieldCellSizeMeters: layer.fieldCellSizeMeters,
        fieldColumns: layer.fieldColumns,
        fieldRows: layer.fieldRows,
        interpolationExtrapolate: layer.interpolationExtrapolate,
        interpolationK: layer.interpolationK,
        interpolationMaxDistanceMeters: layer.interpolationMaxDistanceMeters,
        interpolationPower: layer.interpolationPower,
        valueDomain: layer.valueDomain,
        valueMetric: layer.valueMetric,
        zoom: options.viewport.zoom,
      });
    case "geojson":
      if (options.viewport.kind !== "geo") {
        return null;
      }
      return createLayerCacheQuery(base, viewportSignature, {
        kind: layer.kind,
        bounds: options.viewport.bounds,
        clipToViewport: layer.clipToViewport,
        simplifyTolerance: layer.simplifyTolerance,
        zoom: options.viewport.zoom,
      });
    case "geo-flows":
      if (options.viewport.kind !== "geo") {
        return null;
      }
      return createLayerCacheQuery(base, viewportSignature, {
        kind: layer.kind,
        aggregate: layer.aggregate,
        bounds: options.viewport.bounds,
        minWeight: layer.minWeight,
        weightMetric: layer.weightMetric,
        zoom: options.viewport.zoom,
      });
    case "finance-candles":
      if (options.viewport.kind === "geo" || options.viewport.kind === "table") {
        return null;
      }
      return createLayerCacheQuery(base, viewportSignature, {
        kind: layer.kind,
        priceMode: layer.priceMode ?? "raw",
        targetBarCount: layer.targetBarCount ?? 120,
        xDomain: layer.xDomain,
      });
    case "finance-line":
      if (options.viewport.kind === "geo" || options.viewport.kind === "table") {
        return null;
      }
      return createLayerCacheQuery(base, viewportSignature, {
        kind: layer.kind,
        targetPointCount: layer.targetPointCount,
        value: layer.value ?? "close",
        xDomain: layer.xDomain,
      });
    case "finance-returns":
      if (options.viewport.kind === "geo" || options.viewport.kind === "table") {
        return null;
      }
      return createLayerCacheQuery(base, viewportSignature, {
        kind: layer.kind,
        method: layer.method ?? "simple",
        priceMode: layer.priceMode ?? "raw",
        targetPointCount: layer.targetPointCount,
        xDomain: layer.xDomain,
      });
    case "table":
      if (options.viewport.kind !== "table") {
        return null;
      }
      return createLayerCacheQuery(base, viewportSignature, {
        kind: layer.kind,
        query: resolveTableQuery(layer.query, options.viewport),
      });
  }
}

function createLayerCacheQuery(
  base: Omit<VizRenderLayerCacheQuery, "querySignature" | "viewportSignature">,
  viewportSignature: string,
  query: unknown,
): VizRenderLayerCacheQuery {
  return {
    ...base,
    querySignature: stableSignature(query),
    viewportSignature,
  };
}

function getViewportSignature(options: VizComputeFrameOptions) {
  const viewport = options.viewport;
  switch (viewport.kind) {
    case "geo":
      return stableSignature({
        bounds: viewport.bounds,
        display: viewport.display,
        height: viewport.height,
        kind: viewport.kind,
        width: viewport.width,
        zoom: viewport.zoom,
      });
    case "table":
      return stableSignature(viewport);
    default:
      return stableSignature({
        height: viewport.height,
        kind: viewport.kind ?? "cartesian",
        width: viewport.width,
        xDomain: viewport.xDomain,
      });
  }
}

function stableSignature(value: unknown): string {
  if (value == null || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "string") {
    return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSignature(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${key}:${stableSignature(entry)}`)
      .join(",")}}`;
  }

  return String(value);
}
