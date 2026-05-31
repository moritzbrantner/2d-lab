import { priceValue } from "../backend/finance-utils";
import { getFinanceIndex, isCartesianViewport, resolveFrameFormat } from "./utils";

import type {
  VizComputeFrameOptions,
  VizCompactFinanceReturns,
  VizCompactOhlcvBars,
  VizEngineDatasetRecord,
  VizFrameDiagnostic,
  VizLayer,
  VizLayerId,
  VizOhlcvBar,
  VizRenderBounds,
  VizRenderDatum,
  VizAnyRenderLayer,
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
): VizAnyRenderLayer<TProperties> | null {
  switch (layer.kind) {
    case "finance-candles": {
      const index = getFinanceIndex(layerId, layer.kind, datasetRecord, diagnostics);
      if (!index || !isCartesianViewport(options.viewport, layerId, diagnostics)) {
        return null;
      }
      if (resolveFrameFormat(options) === "typed") {
        const typedCandles = index.getCompactDownsampledBars({
          targetBarCount: layer.targetBarCount ?? 120,
          xDomain: layer.xDomain,
        });

        return {
          bounds: getCompactFinanceCandleBounds(typedCandles),
          datasetId: layer.datasetId,
          instrument:
            datasetRecord.dataset.kind === "finance-ohlcv"
              ? datasetRecord.dataset.instrument
              : { symbol: "" },
          kind: "finance-candles",
          layerId,
          typedCandles,
        };
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
      if (resolveFrameFormat(options) === "typed") {
        const compactBars = layer.targetPointCount
          ? index.getCompactDownsampledBars({
              targetBarCount: layer.targetPointCount,
              xDomain: layer.xDomain,
            })
          : index.getCompactBars({ xDomain: layer.xDomain });
        const typedFinanceLine = createCompactFinanceLine(compactBars, layer.value ?? "close");

        return {
          bounds: getCompactFinanceRowsBounds(typedFinanceLine),
          datasetId: layer.datasetId,
          kind: "finance-line",
          layerId,
          typedFinanceLine,
        };
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
      const returns = index.getCompactReturns({
        method: layer.method,
        priceMode: layer.priceMode,
        targetPointCount: layer.targetPointCount,
        xDomain: layer.xDomain,
      });
      if (resolveFrameFormat(options) === "typed") {
        return {
          bounds: getCompactFinanceRowsBounds(returns),
          datasetId: layer.datasetId,
          kind: "finance-returns",
          layerId,
          typedReturns: returns,
        };
      }
      const rows = createFinanceReturnRows<TProperties>(returns);

      return {
        bounds: getFinanceRowsBounds(rows),
        datasetId: layer.datasetId,
        kind: "finance-returns",
        layerId,
        rows,
      };
    }
  }
}

function getCompactFinanceCandleBounds(bars: VizCompactOhlcvBars): VizRenderBounds | null {
  const barCount = bars.timestamp.length;
  if (barCount === 0) {
    return null;
  }

  let minLow = Number.POSITIVE_INFINITY;
  let maxHigh = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < barCount; index += 1) {
    minLow = Math.min(minLow, bars.low[index]!);
    maxHigh = Math.max(maxHigh, bars.high[index]!);
  }

  return [bars.timestamp[0]!, minLow, bars.timestamp[barCount - 1]!, maxHigh];
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

function getCompactFinanceRowsBounds(series: VizCompactFinanceReturns): VizRenderBounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let hasRows = false;

  for (let index = 0; index < series.x.length; index += 1) {
    const value = series.y[index]!;
    if (!Number.isFinite(value)) {
      continue;
    }

    const x = series.x[index]!;
    hasRows = true;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, value);
    maxY = Math.max(maxY, value);
  }

  return hasRows ? [minX, minY, maxX, maxY] : null;
}

function createCompactFinanceLine(
  bars: VizCompactOhlcvBars,
  value: "adjustedClose" | "close" | "high" | "low" | "open" | "volume",
): VizCompactFinanceReturns {
  const y = new Float64Array(bars.timestamp.length);
  const pointCount = new Uint32Array(bars.timestamp.length);

  for (let index = 0; index < bars.timestamp.length; index += 1) {
    const nextValue = compactPriceValue(bars, index, value);
    y[index] = Number.isFinite(nextValue) ? nextValue : Number.NaN;
    pointCount[index] = Number.isFinite(nextValue) ? 1 : 0;
  }

  return {
    pointCount,
    x: bars.timestamp,
    y,
    summary: {
      pointCount: bars.timestamp.length,
      sampleCount: bars.timestamp.length,
      xDomain: bars.summary.xDomain,
    },
  };
}

function compactPriceValue(
  bars: VizCompactOhlcvBars,
  index: number,
  value: "adjustedClose" | "close" | "high" | "low" | "open" | "volume",
) {
  switch (value) {
    case "adjustedClose":
      return bars.adjustedClose[index]!;
    case "close":
      return bars.close[index]!;
    case "high":
      return bars.high[index]!;
    case "low":
      return bars.low[index]!;
    case "open":
      return bars.open[index]!;
    case "volume":
      return bars.volume[index]!;
  }
}

function createFinanceReturnRows<TProperties>(
  returns: VizCompactFinanceReturns,
): Array<VizRenderDatum<TProperties>> {
  return Array.from({ length: returns.x.length }, (_, index) => {
    const y = returns.y[index];
    const value = y == null || Number.isNaN(y) ? null : y;
    const x = returns.x[index] ?? 0;
    const pointCount = returns.pointCount[index] ?? 0;

    return {
      average: value,
      count: pointCount,
      index,
      label: String(x),
      max: value,
      metrics: {},
      min: value,
      pointCount,
      sum: value == null ? 0 : value * pointCount,
      value,
      x,
      x0: x,
      x1: x,
    };
  });
}
