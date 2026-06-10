import { hitTestVizFrame } from "./hit-test";
import { hydrateVizRenderFrame, hydrateVizRenderLayer } from "./hydrate-frame";
import { computeVizRenderFrame } from "./render-frame";
import { createRenderLayerCache, type VizRenderLayerCache } from "./cache";
import { VizDisposedError } from "./errors";
import { disposeVizIndex, isWasmDatasetIndex } from "./resources";

import type {
  VizAnyRenderFrame,
  VizAnyRenderLayer,
  VizCacheOptions,
  VizDataset,
  VizDatasetId,
  VizEngine,
  VizEngineBackend,
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

export function createVizEngineWithBackend<TProperties = Record<string, unknown>>(
  backend: VizEngineBackend<TProperties>,
  options: { cache?: VizCacheOptions } = {},
): VizEngine<TProperties> {
  const datasets = new Map<VizDatasetId, VizEngineDatasetRecord<TProperties>>();
  const layers = new Map<VizLayerId, Required<VizEngineLayerRecord>>();
  const layerCache = createRenderLayerCache<TProperties>(options.cache);
  let nextDatasetId = 0;
  let nextDatasetVersion = 0;
  let nextLayerId = 0;
  let nextLayerVersion = 0;
  let lastFrame: VizAnyRenderFrame<TProperties> | null = null;
  let disposed = false;

  function invalidateFrames() {
    layerCache.clear();
    lastFrame = null;
  }

  function invalidateDatasetFrames(datasetId: VizDatasetId) {
    layerCache.clear({ datasetId });
    lastFrame = null;
  }

  function invalidateLayerFrames(layerId: VizLayerId) {
    layerCache.deleteLayer(layerId);
    lastFrame = null;
  }

  function computeFrame(frameOptions: VizObjectComputeFrameOptions): VizRenderFrame<TProperties>;
  function computeFrame(
    frameOptions: VizTypedComputeFrameOptions,
  ): VizTypedRenderFrame<TProperties>;
  function computeFrame(
    frameOptions: VizObjectComputeFrameOptions | VizTypedComputeFrameOptions,
  ): VizAnyRenderFrame<TProperties> {
    assertUsable();
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

  function assertUsable() {
    if (disposed) {
      throw new VizDisposedError();
    }
  }

  function disposeAllIndexes() {
    for (const record of datasets.values()) {
      disposeVizIndex(record.index);
    }
  }

  return {
    addDataset(dataset: VizDataset<TProperties>) {
      assertUsable();
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
      assertUsable();
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
      assertUsable();
      disposeAllIndexes();
      datasets.clear();
      layers.clear();
      nextDatasetId = 0;
      nextDatasetVersion = 0;
      nextLayerId = 0;
      nextLayerVersion = 0;
      invalidateFrames();
    },

    clearCache(clearOptions) {
      assertUsable();
      layerCache.clear(clearOptions);
      lastFrame = null;
    },

    getDatasetCount() {
      assertUsable();
      return datasets.size;
    },

    getCacheStats() {
      return layerCache.getStats();
    },

    getLayerCount() {
      assertUsable();
      return layers.size;
    },

    getResourceStats() {
      return {
        cachedFrame: lastFrame != null,
        cache: layerCache.getStats(),
        datasetCount: datasets.size,
        disposed,
        layerCount: layers.size,
        wasmIndexCount: [...datasets.values()].filter((record) => isWasmDatasetIndex(record.index))
          .length,
      };
    },

    hydrateFrame(frame: VizAnyRenderFrame<TProperties>) {
      assertUsable();
      return hydrateVizRenderFrame(frame);
    },

    hydrateLayer(layer: VizAnyRenderLayer<TProperties>) {
      assertUsable();
      return hydrateVizRenderLayer(layer);
    },

    hitTest(hitOptions: VizHitTestOptions<TProperties>): VizHitTestResult<TProperties> | null {
      assertUsable();
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
      assertUsable();
      const existing = datasets.get(datasetId);
      if (existing) {
        disposeVizIndex(existing.index);
        datasets.delete(datasetId);
      }
      invalidateDatasetFrames(datasetId);

      for (const [layerId, layer] of layers) {
        if (layer.layer.datasetId === datasetId) {
          layers.delete(layerId);
          layerCache.deleteLayer(layerId);
        }
      }
    },

    removeLayer(layerId: VizLayerId) {
      assertUsable();
      layers.delete(layerId);
      invalidateLayerFrames(layerId);
    },

    updateDataset(datasetId: VizDatasetId, dataset: VizDataset<TProperties>) {
      assertUsable();
      const oldRecord = datasets.get(datasetId);
      if (!oldRecord) {
        return false;
      }

      const nextIndex = backend.createIndex(dataset);
      datasets.set(datasetId, {
        dataset,
        index: nextIndex,
        version: ++nextDatasetVersion,
      });
      disposeVizIndex(oldRecord.index);
      invalidateDatasetFrames(datasetId);

      return true;
    },

    updateLayer(layerId: VizLayerId, layer: VizLayer) {
      assertUsable();
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

    dispose() {
      if (disposed) {
        return;
      }
      disposeAllIndexes();
      datasets.clear();
      layers.clear();
      layerCache.clear();
      lastFrame = null;
      disposed = true;
    },
  };
}
