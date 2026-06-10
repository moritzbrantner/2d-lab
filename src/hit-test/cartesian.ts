import type {
  VizAnyRenderLayer,
  VizCartesianHitTestResult,
  VizCompactDensitySeries,
  VizCompactFinanceReturns,
  VizCompactHeatmap,
  VizCompactHistogram,
  VizCompactOhlcvBars,
  VizCompactRollingSeries,
  VizHitTestOptions,
  VizViewport,
} from "../types";
import {
  hitTestObjectCandles,
  hitTestObjectHeatmap,
  hitTestObjectHistogram,
  hitTestTypedCandles,
  hitTestTypedHeatmap,
  hitTestTypedHistogram,
} from "./cartesian-rects";
import {
  nearestBinnedSamples,
  nearestRollingPoints,
  nearestRowsSample,
  nearestTypedBinnedSample,
  nearestTypedFinancePoint,
  nearestTypedRollingSample,
} from "./cartesian-series";

export function hitTestCartesianLayers<TProperties>(
  layers: readonly VizAnyRenderLayer<TProperties>[],
  viewport: Extract<VizViewport, { kind?: "cartesian" }>,
  options: VizHitTestOptions<TProperties>,
) {
  let nearest: VizCartesianHitTestResult | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const layer of layers) {
    const result = hitTestCartesianLayer(layer, viewport, options);
    if (!result) {
      continue;
    }

    const distance = "distancePx" in result ? (result.distancePx ?? 0) : 0;
    if (distance < nearestDistance) {
      nearest = result;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function hitTestCartesianLayer<TProperties>(
  layer: VizAnyRenderLayer<TProperties>,
  viewport: Extract<VizViewport, { kind?: "cartesian" }>,
  options: VizHitTestOptions<TProperties>,
) {
  switch (layer.kind) {
    case "binned-series":
      return "typedSeries" in layer || "compactSeries" in layer
        ? nearestTypedBinnedSample(
            (
              layer as {
                compactSeries: VizCompactDensitySeries;
                typedSeries?: VizCompactDensitySeries;
              }
            ).typedSeries ?? (layer as { compactSeries: VizCompactDensitySeries }).compactSeries,
            layer,
            viewport,
            options,
          )
        : nearestBinnedSamples(layer.series.samples, layer, viewport, options);
    case "rolling-series":
      return "typedRollingSeries" in layer || "compactRollingSeries" in layer
        ? nearestTypedRollingSample(
            (
              layer as {
                compactRollingSeries: VizCompactRollingSeries;
                typedRollingSeries?: VizCompactRollingSeries;
              }
            ).typedRollingSeries ??
              (layer as { compactRollingSeries: VizCompactRollingSeries }).compactRollingSeries,
            layer,
            viewport,
            options,
          )
        : nearestRollingPoints(layer.series.points, layer, viewport, options);
    case "histogram":
      return "typedHistogram" in layer || "compactHistogram" in layer
        ? hitTestTypedHistogram(
            (
              layer as {
                compactHistogram: VizCompactHistogram;
                typedHistogram?: VizCompactHistogram;
              }
            ).typedHistogram ??
              (layer as { compactHistogram: VizCompactHistogram }).compactHistogram,
            layer,
            options,
          )
        : hitTestObjectHistogram(layer.buckets, layer, options);
    case "heatmap":
      return "typedHeatmap" in layer || "compactHeatmap" in layer
        ? hitTestTypedHeatmap(
            (layer as { compactHeatmap: VizCompactHeatmap; typedHeatmap?: VizCompactHeatmap })
              .typedHeatmap ?? (layer as { compactHeatmap: VizCompactHeatmap }).compactHeatmap,
            layer,
            options,
          )
        : hitTestObjectHeatmap(layer.cells, layer, options);
    case "finance-line":
      return "typedFinanceLine" in layer
        ? nearestTypedFinancePoint(layer.typedFinanceLine, layer, viewport, options)
        : nearestRowsSample(layer.rows, layer, viewport, options);
    case "finance-returns":
      return "typedReturns" in layer
        ? nearestTypedFinancePoint(layer.typedReturns, layer, viewport, options)
        : nearestRowsSample(layer.rows, layer, viewport, options);
    case "finance-candles":
      return "typedCandles" in layer
        ? hitTestTypedCandles(layer.typedCandles, layer, options)
        : hitTestObjectCandles(layer.bars, layer, options);
    default:
      return null;
  }
}
