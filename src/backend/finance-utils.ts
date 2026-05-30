import type {
  VizDensityBin,
  VizDensitySample,
  VizDensitySeries,
  VizFinanceReturnsQuery,
  VizFinanceRiskQuery,
  VizFinanceRiskSummary,
  VizFinancialInstrument,
  VizIndexedSeriesPoint,
  VizOhlcvBar,
  VizRenderBounds,
} from "../types";

export type NormalizedOhlcvBar<TProperties = Record<string, unknown>> = VizOhlcvBar<TProperties>;

export function normalizeFinanceInstrument(
  instrument: VizFinancialInstrument,
): VizFinancialInstrument {
  if (!instrument.symbol.trim()) {
    throw new TypeError("instrument symbol must not be empty");
  }

  return {
    ...instrument,
    assetClass: instrument.assetClass ?? "other",
    id: instrument.id ?? instrument.symbol,
  };
}

export function normalizeOhlcvBars<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
): Array<NormalizedOhlcvBar<TProperties>> {
  const normalized = bars.slice().sort((left, right) => left.timestamp - right.timestamp);
  const seen = new Set<number>();

  for (const bar of normalized) {
    validateOhlcvBar(bar);
    if (seen.has(bar.timestamp)) {
      throw new TypeError("bar timestamps must be unique");
    }
    seen.add(bar.timestamp);
  }

  return normalized;
}

export function getFinanceBounds<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
): VizRenderBounds | null {
  if (!bars.length) {
    return null;
  }

  return [
    bars[0]?.timestamp ?? 0,
    Math.min(...bars.map((bar) => bar.low)),
    bars[bars.length - 1]?.timestamp ?? 0,
    Math.max(...bars.map((bar) => bar.high)),
  ];
}

export function barsInRange<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
  xDomain: [number, number],
): Array<VizOhlcvBar<TProperties>> {
  const [start, end] = xDomain;

  if (start > end) {
    return [];
  }

  return bars.filter((bar) => bar.timestamp >= start && bar.timestamp <= end);
}

export function downsampleOhlcvBars<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
  targetBarCount: number,
): Array<VizOhlcvBar<TProperties>> {
  if (!Number.isFinite(targetBarCount) || targetBarCount <= 0) {
    throw new TypeError("targetBarCount must be greater than zero");
  }

  const target = Math.floor(targetBarCount);
  if (bars.length <= target) {
    return bars.slice();
  }

  const bucketCount = Math.min(target, bars.length);
  const downsampled: Array<VizOhlcvBar<TProperties>> = [];

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex++) {
    const start = Math.floor((bucketIndex * bars.length) / bucketCount);
    const end = Math.max(start + 1, Math.floor(((bucketIndex + 1) * bars.length) / bucketCount));
    downsampled.push(aggregateOhlcvBucket(bars.slice(start, end)));
  }

  return downsampled;
}

export function createFinanceReturnSeries<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
  query: VizFinanceReturnsQuery,
): VizDensitySeries<TProperties> {
  const method = query.method ?? "simple";
  const prices = priceValues(bars, query.priceMode ?? "raw");
  const points: Array<VizIndexedSeriesPoint<TProperties>> = [];

  for (let index = 1; index < prices.length; index++) {
    const previous = prices[index - 1];
    const current = prices[index];
    if (previous == null || current == null) {
      continue;
    }
    points.push({
      id: `return-${index}`,
      label: String(bars[index]?.timestamp ?? index),
      properties: bars[index]?.properties,
      sourceIndex: index,
      x: bars[index]?.timestamp ?? index,
      y: method === "log" ? Math.log(current / previous) : current / previous - 1,
    });
  }

  const targetBinCount = Math.max(1, query.targetPointCount ?? (points.length || 1));
  const bins =
    points.length > targetBinCount
      ? aggregateReturnPoints(points, targetBinCount)
      : points.map((point, index) => createReturnBin([point], index));
  const samples = bins.map(createReturnSample);

  return {
    bins,
    samples,
    summary: {
      binCount: bins.length,
      metrics: {},
      pointCount: bins.reduce((sum, bin) => sum + bin.pointCount, 0),
      sampleCount: samples.length,
      valueMode: "average",
      xDomain: query.xDomain,
    },
  };
}

export function getFinanceRiskSummary<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
  query: VizFinanceRiskQuery,
): VizFinanceRiskSummary {
  const returns = simpleReturns(priceValues(bars, query.priceMode ?? "raw"));
  const periodsPerYear = query.periodsPerYear ?? 252;
  const confidence = query.confidence ?? 0.95;
  const riskFreeReturnPerPeriod = query.riskFreeReturnPerPeriod ?? 0;
  const meanReturn = mean(returns);
  const stdDev = sampleStdDev(returns);
  const annualizedReturn = (1 + cumulativeReturn(returns)) ** (periodsPerYear / returns.length) - 1;
  const annualizedVolatility = stdDev * Math.sqrt(periodsPerYear);
  const excess = returns.map((value) => value - riskFreeReturnPerPeriod);
  const excessStdDev = sampleStdDev(excess);
  const downside = Math.sqrt(
    returns
      .map((value) => Math.min(0, value - riskFreeReturnPerPeriod))
      .reduce((sum, value) => sum + value * value, 0) / returns.length,
  );
  const historical = historicalRisk(returns, confidence);

  return {
    annualizedReturn,
    annualizedVolatility,
    conditionalValueAtRisk: historical.conditionalValueAtRisk,
    maxDrawdown: maxDrawdown(returns),
    meanReturn,
    sharpeRatio:
      excessStdDev > Number.EPSILON
        ? (mean(excess) / excessStdDev) * Math.sqrt(periodsPerYear)
        : null,
    sortinoRatio:
      downside > Number.EPSILON
        ? ((meanReturn - riskFreeReturnPerPeriod) / downside) * Math.sqrt(periodsPerYear)
        : null,
    stdDev,
    valueAtRisk: historical.valueAtRisk,
  };
}

export function priceValue<TProperties>(
  bar: VizOhlcvBar<TProperties>,
  value: "adjustedClose" | "close" | "high" | "low" | "open" | "volume" = "close",
): number | null {
  if (value === "adjustedClose") {
    return bar.adjustedClose ?? bar.close;
  }

  return bar[value] ?? null;
}

function validateOhlcvBar<TProperties>(bar: VizOhlcvBar<TProperties>) {
  validatePositivePrice(bar.open, "open");
  validatePositivePrice(bar.high, "high");
  validatePositivePrice(bar.low, "low");
  validatePositivePrice(bar.close, "close");

  if (bar.high < Math.max(bar.open, bar.close, bar.low)) {
    throw new TypeError("high must be greater than or equal to open, close, and low");
  }
  if (bar.low > Math.min(bar.open, bar.close, bar.high)) {
    throw new TypeError("low must be less than or equal to open, close, and high");
  }
  if (bar.volume != null && (!Number.isFinite(bar.volume) || bar.volume < 0)) {
    throw new TypeError("volume must be finite and non-negative");
  }
  if (bar.adjustedClose != null) {
    validatePositivePrice(bar.adjustedClose, "adjustedClose");
  }
}

function validatePositivePrice(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be finite and positive`);
  }
}

function aggregateOhlcvBucket<TProperties>(
  bars: Array<VizOhlcvBar<TProperties>>,
): VizOhlcvBar<TProperties> {
  const first = bars[0];
  const last = bars[bars.length - 1];

  if (!first || !last) {
    throw new TypeError("cannot aggregate an empty OHLCV bucket");
  }

  const adjustedClose =
    last.adjustedClose ??
    [...bars].reverse().find((bar) => bar.adjustedClose != null)?.adjustedClose;
  const volume = bars.some((bar) => bar.volume != null)
    ? bars.reduce((sum, bar) => sum + (bar.volume ?? 0), 0)
    : undefined;

  return {
    adjustedClose,
    close: last.close,
    high: Math.max(...bars.map((bar) => bar.high)),
    low: Math.min(...bars.map((bar) => bar.low)),
    metrics: last.metrics,
    open: first.open,
    properties: last.properties,
    timestamp: first.timestamp,
    volume,
  };
}

function aggregateReturnPoints<TProperties>(
  points: Array<VizIndexedSeriesPoint<TProperties>>,
  targetBinCount: number,
): Array<VizDensityBin<TProperties>> {
  const bins: Array<VizDensityBin<TProperties>> = [];

  for (let bucketIndex = 0; bucketIndex < targetBinCount; bucketIndex++) {
    const start = Math.floor((bucketIndex * points.length) / targetBinCount);
    const end = Math.max(
      start + 1,
      Math.floor(((bucketIndex + 1) * points.length) / targetBinCount),
    );
    bins.push(createReturnBin(points.slice(start, end), bucketIndex));
  }

  return bins;
}

function createReturnBin<TProperties>(
  points: Array<VizIndexedSeriesPoint<TProperties>>,
  index: number,
): VizDensityBin<TProperties> {
  const firstPoint = points[0] ?? null;
  const lastPoint = points[points.length - 1] ?? null;
  const values = points.map((point) => point.y);
  const sumY = values.reduce((sum, value) => sum + value, 0);

  return {
    averageY: values.length ? sumY / values.length : null,
    firstPoint,
    firstPointIndex: firstPoint?.sourceIndex ?? null,
    index,
    lastPoint,
    lastPointIndex: lastPoint?.sourceIndex ?? null,
    maxY: values.length ? Math.max(...values) : null,
    metrics: {},
    minY: values.length ? Math.min(...values) : null,
    pointCount: points.length,
    sumY,
    x0: firstPoint?.x ?? 0,
    x1: lastPoint?.x ?? firstPoint?.x ?? 0,
  };
}

function createReturnSample<TProperties>(
  bin: VizDensityBin<TProperties>,
): VizDensitySample<TProperties> {
  return {
    ...bin,
    x: bin.lastPoint?.x ?? bin.firstPoint?.x ?? bin.x0,
    y: bin.averageY,
  };
}

function priceValues<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
  priceMode: "adjusted" | "raw",
) {
  return bars.map((bar) =>
    priceMode === "adjusted" ? (bar.adjustedClose ?? bar.close) : bar.close,
  );
}

function simpleReturns(prices: readonly number[]) {
  if (prices.length < 2) {
    throw new TypeError("price series must contain at least two values");
  }
  return prices.slice(1).map((price, index) => price / prices[index] - 1);
}

function cumulativeReturn(returns: readonly number[]) {
  return returns.reduce((equity, value) => equity * (1 + value), 1) - 1;
}

function mean(values: readonly number[]) {
  if (!values.length) {
    throw new TypeError("series must not be empty");
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStdDev(values: readonly number[]) {
  if (values.length < 2) {
    throw new TypeError("sample standard deviation requires at least two observations");
  }
  const average = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => {
      const centered = value - average;
      return sum + centered * centered;
    }, 0) /
      (values.length - 1),
  );
}

function historicalRisk(returns: readonly number[], confidence: number) {
  if (!Number.isFinite(confidence) || confidence <= 0 || confidence >= 1) {
    throw new TypeError("confidence must be finite and between 0 and 1");
  }
  const sorted = returns.slice().sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((1 - confidence) * sorted.length) - 1),
  );
  const threshold = sorted[index] ?? 0;
  const tail = sorted.filter((value) => value <= threshold);
  const tailMean = mean(tail.length ? tail : [threshold]);

  return {
    conditionalValueAtRisk: Math.max(0, -tailMean),
    valueAtRisk: Math.max(0, -threshold),
  };
}

function maxDrawdown(returns: readonly number[]) {
  let equity = 1;
  let peak = 1;
  let activePeakIndex = 0;
  let result = {
    depth: 0,
    peakIndex: 0,
    recoveryIndex: 0 as number | null,
    troughIndex: 0,
  };

  for (const [index, value] of returns.entries()) {
    const equityIndex = index + 1;
    equity *= 1 + value;
    if (equity >= peak) {
      peak = equity;
      activePeakIndex = equityIndex;
      if (result.recoveryIndex == null) {
        result.recoveryIndex = equityIndex;
      }
    }
    const depth = peak > 0 ? (peak - equity) / peak : 0;
    if (depth > result.depth) {
      result = {
        depth,
        peakIndex: activePeakIndex,
        recoveryIndex: null,
        troughIndex: equityIndex,
      };
    } else if (result.recoveryIndex == null && equity >= peak) {
      result.recoveryIndex = equityIndex;
    }
  }

  return result;
}
