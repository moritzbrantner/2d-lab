import { hitTestVizFrame } from "./hit-test";
import { hydrateVizRenderFrame, hydrateVizRenderLayer } from "./hydrate-frame";
import { createVizEngineBackend } from "./js-backend";
import { computeVizRenderFrame } from "./render-frame";

import type {
  VizAnyRenderFrame,
  VizAnyRenderLayer,
  VizBackendConfig,
  VizBackendOption,
  VizCompactComputeFrameOptions,
  VizCompactRenderFrame,
  VizDataset,
  VizDatasetId,
  VizEngine,
  VizEngineDatasetRecord,
  VizEngineLayerRecord,
  VizHitTestOptions,
  VizHitTestResult,
  VizLayer,
  VizLayerId,
  VizObjectComputeFrameOptions,
  VizRenderFrame,
  VizTypedComputeFrameOptions,
  VizTypedRenderFrame,
} from "./types";
import type { VizRenderLayerCache, VizRenderLayerCacheQuery } from "./render-frame";

export type CreateVizEngineOptions = {
  backend?: VizBackendOption | VizBackendConfig;
};

export function createVizEngine<TProperties = Record<string, unknown>>(
  options: CreateVizEngineOptions = {},
): VizEngine<TProperties> {
  const backend = createVizEngineBackend<TProperties>(options.backend ?? "auto");
  const datasets = new Map<VizDatasetId, VizEngineDatasetRecord<TProperties>>();
  const layers = new Map<VizLayerId, Required<VizEngineLayerRecord>>();
  const layerCache = createRenderLayerCache<TProperties>();
  let nextDatasetId = 0;
  let nextDatasetVersion = 0;
  let nextLayerId = 0;
  let nextLayerVersion = 0;
  let lastFrame: VizAnyRenderFrame<TProperties> | null = null;

  function invalidateFrames() {
    layerCache.clear();
    lastFrame = null;
  }

  function invalidateDatasetFrames(datasetId: VizDatasetId) {
    for (const [layerId, layerRecord] of layers) {
      if (layerRecord.layer.datasetId === datasetId) {
        layerCache.deleteLayer(layerId);
      }
    }
    lastFrame = null;
  }

  function invalidateLayerFrames(layerId: VizLayerId) {
    layerCache.deleteLayer(layerId);
    lastFrame = null;
  }

  function computeFrame(frameOptions: VizObjectComputeFrameOptions): VizRenderFrame<TProperties>;
  function computeFrame(
    frameOptions: VizCompactComputeFrameOptions,
  ): VizCompactRenderFrame<TProperties>;
  function computeFrame(
    frameOptions: VizTypedComputeFrameOptions,
  ): VizTypedRenderFrame<TProperties>;
  function computeFrame(
    frameOptions:
      | VizCompactComputeFrameOptions
      | VizObjectComputeFrameOptions
      | VizTypedComputeFrameOptions,
  ): VizAnyRenderFrame<TProperties> {
    lastFrame = (
      computeVizRenderFrame as (
        datasets: Map<string, VizEngineDatasetRecord<TProperties>>,
        layers: Map<VizLayerId, Required<VizEngineLayerRecord>>,
        backend: import("./types").VizEngineBackend<TProperties>,
        options: typeof frameOptions,
        layerCache?: VizRenderLayerCache<TProperties>,
      ) => VizAnyRenderFrame<TProperties>
    )(datasets, layers, backend, frameOptions, layerCache);

    return lastFrame;
  }

  return {
    addDataset(dataset: VizDataset<TProperties>) {
      const datasetId = `dataset-${++nextDatasetId}`;

      datasets.set(datasetId, {
        dataset,
        index: backend.createIndex(dataset),
        version: ++nextDatasetVersion,
      });
      invalidateFrames();

      return datasetId;
    },

    addLayer(layer: VizLayer) {
      const layerId = `layer-${++nextLayerId}`;

      layers.set(layerId, {
        layer,
        version: ++nextLayerVersion,
      });
      invalidateFrames();

      return layerId;
    },

    computeFrame,

    clear() {
      datasets.clear();
      layers.clear();
      nextDatasetId = 0;
      nextDatasetVersion = 0;
      nextLayerId = 0;
      nextLayerVersion = 0;
      invalidateFrames();
    },

    getDatasetCount() {
      return datasets.size;
    },

    getLayerCount() {
      return layers.size;
    },

    hydrateFrame(frame: VizAnyRenderFrame<TProperties>) {
      return hydrateVizRenderFrame(frame);
    },

    hydrateLayer(layer: VizAnyRenderLayer<TProperties>) {
      return hydrateVizRenderLayer(layer);
    },

    hitTest(hitOptions: VizHitTestOptions<TProperties>): VizHitTestResult<TProperties> | null {
      if (!lastFrame && !hitOptions.frame && hitOptions.viewport) {
        lastFrame = computeVizRenderFrame(
          datasets,
          layers,
          backend,
          {
            viewport: hitOptions.viewport,
          },
          layerCache,
        );
      }

      return hitTestVizFrame(hitOptions.frame ?? lastFrame, hitOptions);
    },

    removeDataset(datasetId: VizDatasetId) {
      datasets.delete(datasetId);
      invalidateFrames();

      for (const [layerId, layer] of layers) {
        if (layer.layer.datasetId === datasetId) {
          layers.delete(layerId);
          layerCache.deleteLayer(layerId);
        }
      }
    },

    removeLayer(layerId: VizLayerId) {
      layers.delete(layerId);
      invalidateFrames();
    },

    updateDataset(datasetId: VizDatasetId, dataset: VizDataset<TProperties>) {
      if (!datasets.has(datasetId)) {
        return false;
      }

      datasets.set(datasetId, {
        dataset,
        index: backend.createIndex(dataset),
        version: ++nextDatasetVersion,
      });
      invalidateDatasetFrames(datasetId);

      return true;
    },

    updateLayer(layerId: VizLayerId, layer: VizLayer) {
      if (!layers.has(layerId)) {
        return false;
      }

      layers.set(layerId, {
        layer,
        version: ++nextLayerVersion,
      });
      invalidateLayerFrames(layerId);

      return true;
    },
  };
}

function createRenderLayerCache<TProperties>(): VizRenderLayerCache<TProperties> {
  const layers = new Map<VizLayerId, Map<string, CacheEntry<TProperties>>>();
  let accessCounter = 0;

  return {
    clear() {
      layers.clear();
    },

    deleteLayer(layerId: VizLayerId) {
      layers.delete(layerId);
    },

    get(query: VizRenderLayerCacheQuery) {
      const layerCache = layers.get(query.layerId);
      const entry = layerCache?.get(cacheEntryKey(query));
      if (!entry || !cacheEntryMatches(entry, query)) {
        return undefined;
      }

      entry.lastAccess = ++accessCounter;
      return entry.layer;
    },

    set(query: VizRenderLayerCacheQuery, layer: VizAnyRenderLayer<TProperties>) {
      const layerCache = layers.get(query.layerId) ?? new Map<string, CacheEntry<TProperties>>();
      layers.set(query.layerId, layerCache);
      layerCache.set(cacheEntryKey(query), {
        ...query,
        lastAccess: ++accessCounter,
        layer,
      });

      return evictLayerCacheEntries(layerCache);
    },
  };
}

type CacheEntry<TProperties> = VizRenderLayerCacheQuery & {
  lastAccess: number;
  layer: VizAnyRenderLayer<TProperties>;
};

const MAX_LAYER_CACHE_ENTRIES = 8;

function cacheEntryKey(query: VizRenderLayerCacheQuery) {
  return [
    query.frameFormat,
    query.datasetVersion,
    query.layerVersion,
    query.viewportSignature,
    query.querySignature,
  ].join("\0");
}

function cacheEntryMatches<TProperties>(
  entry: CacheEntry<TProperties>,
  query: VizRenderLayerCacheQuery,
) {
  return (
    entry.datasetId === query.datasetId &&
    entry.datasetVersion === query.datasetVersion &&
    entry.frameFormat === query.frameFormat &&
    entry.layerId === query.layerId &&
    entry.layerVersion === query.layerVersion &&
    entry.querySignature === query.querySignature &&
    entry.viewportSignature === query.viewportSignature
  );
}

function evictLayerCacheEntries<TProperties>(layerCache: Map<string, CacheEntry<TProperties>>) {
  let evictionCount = 0;

  while (layerCache.size > MAX_LAYER_CACHE_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestAccess = Number.POSITIVE_INFINITY;

    for (const [key, entry] of layerCache) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey == null) {
      break;
    }

    layerCache.delete(oldestKey);
    evictionCount += 1;
  }

  return evictionCount;
}
