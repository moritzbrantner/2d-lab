import { priceValue } from "../backend/finance-utils";
import {
  createVizRenderRows,
  getFinanceIndex,
  getSeriesBounds,
  isCartesianViewport,
} from "./utils";

import type {
  VizComputeFrameOptions,
  VizEngineDatasetRecord,
  VizFrameDiagnostic,
  VizLayer,
  VizLayerId,
  VizOhlcvBar,
  VizRenderBounds,
  VizRenderDatum,
  VizRenderLayer,
} from "../types";

type FinanceLayer = Extract<
  VizLayer,
  { kind: "finance-candles" | "finance-line" | "finance-returns" }
>;

export function computeFinanceRenderLayer<TProperties>(
  layerId: VizLayerId,
  layer: FinanceLayer,
  datasetRecord: VizEngineDatasetRecord<TProperties>,
  options: VizComputeFrameOptions,
  diagnostics: VizFrameDiagnostic[],
): VizRenderLayer<TProperties> | null {
  switch (layer.kind) {
    case "finance-candles": {
      const index = getFinanceIndex(layerId, layer.kind, datasetRecord, diagnostics);
      if (!index || !isCartesianViewport(options.viewport, layerId, diagnostics)) {
        return null;
      }
      const bars = index.getDownsampledBars({
        targetBarCount: layer.targetBarCount ?? 120,
        xDomain: layer.xDomain,
      });

      return {
        bars,
        bounds: getFinanceCandleBounds(bars),
        datasetId: layer.datasetId,
        instrument:
          datasetRecord.dataset.kind === "finance-ohlcv"
            ? datasetRecord.dataset.instrument
            : { symbol: "" },
        kind: "finance-candles",
        layerId,
      };
    }
    case "finance-line": {
      const index = getFinanceIndex(layerId, layer.kind, datasetRecord, diagnostics);
      if (!index || !isCartesianViewport(options.viewport, layerId, diagnostics)) {
        return null;
      }
      const bars = layer.targetPointCount
        ? index.getDownsampledBars({
            targetBarCount: layer.targetPointCount,
            xDomain: layer.xDomain,
          })
        : index.getBars({ xDomain: layer.xDomain });
      const rows = createFinanceLineRows(bars, layer.value ?? "close");

      return {
        bounds: getFinanceRowsBounds(rows),
        datasetId: layer.datasetId,
        kind: "finance-line",
        layerId,
        rows,
      };
    }
    case "finance-returns": {
      const index = getFinanceIndex(layerId, layer.kind, datasetRecord, diagnostics);
      if (!index || !isCartesianViewport(options.viewport, layerId, diagnostics)) {
        return null;
      }
      const series = index.getReturns({
        method: layer.method,
        priceMode: layer.priceMode,
        targetPointCount: layer.targetPointCount,
        xDomain: layer.xDomain,
      });

      return {
        bounds: getSeriesBounds(series),
        datasetId: layer.datasetId,
        kind: "finance-returns",
        layerId,
        rows: createVizRenderRows(series),
      };
    }
  }
}

function getFinanceCandleBounds<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
): VizRenderBounds | null {
  const first = bars[0];
  const last = bars[bars.length - 1];

  if (!first || !last) {
    return null;
  }

  let minLow = first.low;
  let maxHigh = first.high;

  for (const bar of bars) {
    minLow = Math.min(minLow, bar.low);
    maxHigh = Math.max(maxHigh, bar.high);
  }

  return [first.timestamp, minLow, last.timestamp, maxHigh];
}

function createFinanceLineRows<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
  value: "adjustedClose" | "close" | "high" | "low" | "open" | "volume",
): Array<VizRenderDatum<TProperties>> {
  return bars.map((bar, index) => {
    const y = priceValue(bar, value);

    return {
      average: y,
      count: y == null ? 0 : 1,
      index,
      label: String(bar.timestamp),
      max: y,
      metrics: bar.metrics,
      min: y,
      pointCount: y == null ? 0 : 1,
      sum: y,
      value: y,
      x: bar.timestamp,
      x0: bar.timestamp,
      x1: bar.timestamp,
    };
  });
}

function getFinanceRowsBounds<TProperties>(
  rows: readonly VizRenderDatum<TProperties>[],
): VizRenderBounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let hasRows = false;

  for (const row of rows) {
    if (row.value == null) {
      continue;
    }

    hasRows = true;
    minX = Math.min(minX, row.x);
    maxX = Math.max(maxX, row.x);
    minY = Math.min(minY, row.value);
    maxY = Math.max(maxY, row.value);
  }

  return hasRows ? [minX, minY, maxX, maxY] : null;
}
