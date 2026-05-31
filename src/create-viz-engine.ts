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
  VizHitTestOptions,
  VizHitTestResult,
  VizLayer,
  VizLayerId,
  VizObjectComputeFrameOptions,
  VizRenderFrame,
  VizTypedComputeFrameOptions,
  VizTypedRenderFrame,
} from "./types";

export type CreateVizEngineOptions = {
  backend?: VizBackendOption | VizBackendConfig;
};

export function createVizEngine<TProperties = Record<string, unknown>>(
  options: CreateVizEngineOptions = {},
): VizEngine<TProperties> {
  const backend = createVizEngineBackend<TProperties>(options.backend ?? "auto");
  const datasets = new Map<VizDatasetId, VizEngineDatasetRecord<TProperties>>();
  const layers = new Map<VizLayerId, VizLayer>();
  const layerCache = new Map<string, VizAnyRenderLayer<TProperties>>();
  let nextDatasetId = 0;
  let nextLayerId = 0;
  let lastFrame: VizAnyRenderFrame<TProperties> | null = null;

  function invalidateFrames() {
    layerCache.clear();
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
        layers: Map<VizLayerId, VizLayer>,
        backend: import("./types").VizEngineBackend<TProperties>,
        options: typeof frameOptions,
        layerCache?: Map<string, VizAnyRenderLayer<TProperties>>,
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
      });
      invalidateFrames();

      return datasetId;
    },

    addLayer(layer: VizLayer) {
      const layerId = `layer-${++nextLayerId}`;

      layers.set(layerId, layer);
      invalidateFrames();

      return layerId;
    },

    computeFrame,

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

    hitTest(hitOptions: VizHitTestOptions): VizHitTestResult<TProperties> | null {
      if (!lastFrame && hitOptions.viewport) {
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

      return hitTestVizFrame(lastFrame, hitOptions);
    },

    removeDataset(datasetId: VizDatasetId) {
      datasets.delete(datasetId);
      invalidateFrames();

      for (const [layerId, layer] of layers) {
        if (layer.datasetId === datasetId) {
          layers.delete(layerId);
        }
      }
    },

    removeLayer(layerId: VizLayerId) {
      layers.delete(layerId);
      invalidateFrames();
    },
  };
}
