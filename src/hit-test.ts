import { hitTestCartesianLayers } from "./hit-test/cartesian";
import { hitTestGeoLayers } from "./hit-test/geo";
import type { VizAnyRenderFrame, VizHitTestOptions, VizHitTestResult } from "./types";

export function hitTestVizFrame<TProperties = Record<string, unknown>>(
  frame: VizAnyRenderFrame<TProperties> | null,
  options: VizHitTestOptions<TProperties>,
): VizHitTestResult<TProperties> | null {
  if (!frame || !options.viewport) {
    return null;
  }
  if (options.viewport.kind === "table") {
    return null;
  }

  const layerIds = options.layerIds ? new Set(options.layerIds) : null;
  const layers = layerIds
    ? frame.layers.filter((layer) => layerIds.has(layer.layerId))
    : frame.layers;
  const result =
    options.viewport.kind === "geo"
      ? hitTestGeoLayers(layers, options.viewport, options)
      : hitTestCartesianLayers(layers, options.viewport, options);

  if (result && options.maxDistancePx != null && "distancePx" in result) {
    return (result.distancePx ?? 0) <= options.maxDistancePx ? result : null;
  }

  return result;
}
