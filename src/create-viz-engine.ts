import { hitTestVizFrame } from "./hit-test";
import { createVizEngineBackend } from "./js-backend";
import { computeVizRenderFrame } from "./render-frame";

import type {
  VizBackendOption,
  VizComputeFrameOptions,
  VizDataset,
  VizDatasetId,
  VizEngine,
  VizEngineDatasetRecord,
  VizHitTestOptions,
  VizHitTestResult,
  VizLayer,
  VizLayerId,
  VizRenderFrame,
} from "./types";

export type CreateVizEngineOptions = {
  backend?: VizBackendOption;
};

export function createVizEngine<TProperties = Record<string, unknown>>(
  options: CreateVizEngineOptions = {},
): VizEngine<TProperties> {
  const backend = createVizEngineBackend<TProperties>(options.backend ?? "auto");
  const datasets = new Map<VizDatasetId, VizEngineDatasetRecord<TProperties>>();
  const layers = new Map<VizLayerId, VizLayer>();
  let nextDatasetId = 0;
  let nextLayerId = 0;
  let lastFrame: VizRenderFrame<TProperties> | null = null;

  return {
    addDataset(dataset: VizDataset<TProperties>) {
      const datasetId = `dataset-${++nextDatasetId}`;

      datasets.set(datasetId, {
        dataset,
        index: backend.createIndex(dataset),
      });
      lastFrame = null;

      return datasetId;
    },

    addLayer(layer: VizLayer) {
      const layerId = `layer-${++nextLayerId}`;

      layers.set(layerId, layer);
      lastFrame = null;

      return layerId;
    },

    computeFrame(frameOptions: VizComputeFrameOptions) {
      lastFrame = computeVizRenderFrame(datasets, layers, backend, frameOptions);

      return lastFrame;
    },

    getDatasetCount() {
      return datasets.size;
    },

    getLayerCount() {
      return layers.size;
    },

    hitTest(hitOptions: VizHitTestOptions): VizHitTestResult | null {
      if (!lastFrame && hitOptions.viewport) {
        lastFrame = computeVizRenderFrame(datasets, layers, backend, {
          viewport: hitOptions.viewport,
        });
      }

      return hitTestVizFrame(lastFrame, hitOptions);
    },

    removeDataset(datasetId: VizDatasetId) {
      datasets.delete(datasetId);
      lastFrame = null;

      for (const [layerId, layer] of layers) {
        if (layer.datasetId === datasetId) {
          layers.delete(layerId);
        }
      }
    },

    removeLayer(layerId: VizLayerId) {
      layers.delete(layerId);
      lastFrame = null;
    },
  };
}
