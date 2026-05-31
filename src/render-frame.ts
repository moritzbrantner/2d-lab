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
