import type {
  VizDensityBin,
  VizDensitySample,
  VizDensitySeries,
  VizFinanceReturnsQuery,
  VizFinanceRiskQuery,
  VizFinanceRiskSummary,
  VizFinancialInstrument,
  VizTypedFinanceReturns,
  VizTypedOhlcvBars,
  VizIndexedSeriesPoint,
  VizOhlcvBar,
  VizRenderBounds,
} from "../types";

export type NormalizedOhlcvBar<TProperties = Record<string, unknown>> = VizOhlcvBar<TProperties>;
export type TypedOhlcvColumns = Pick<
  VizTypedOhlcvBars,
  "adjustedClose" | "close" | "high" | "low" | "open" | "timestamp" | "volume"
>;

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

export function barsInRange<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
  xDomain: [number, number],
): Array<VizOhlcvBar<TProperties>> {
  const [start, end] = xDomain;

  if (start > end) {
    return [];
  }

  return bars.slice(lowerBoundTimestamp(bars, start), upperBoundTimestamp(bars, end));
}

export function lowerBoundTimestamp<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
  timestamp: number,
) {
  let low = 0;
  let high = bars.length;

  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (bars[mid]!.timestamp < timestamp) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

export function upperBoundTimestamp<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
  timestamp: number,
) {
  let low = 0;
  let high = bars.length;

  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (bars[mid]!.timestamp <= timestamp) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
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
    downsampled.push(aggregateOhlcvRange(bars, start, end));
  }

  return downsampled;
}

export function downsampleOhlcvBarsInRange<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
  query: { targetBarCount: number; xDomain: [number, number] },
  range: { end: number; start: number } = {
    end: upperBoundTimestamp(bars, query.xDomain[1]),
    start: lowerBoundTimestamp(bars, query.xDomain[0]),
  },
): Array<VizOhlcvBar<TProperties>> {
  if (!Number.isFinite(query.targetBarCount) || query.targetBarCount <= 0) {
    throw new TypeError("targetBarCount must be greater than zero");
  }

  const start = Math.max(0, Math.min(bars.length, range.start));
  const end = Math.max(start, Math.min(bars.length, range.end));
  const length = end - start;
  const target = Math.floor(query.targetBarCount);

  if (length <= target) {
    return bars.slice(start, end);
  }

  const bucketCount = Math.min(target, length);
  const downsampled: Array<VizOhlcvBar<TProperties>> = [];

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex++) {
    const bucketStart = start + Math.floor((bucketIndex * length) / bucketCount);
    const bucketEnd =
      start +
      Math.max(
        Math.floor((bucketIndex * length) / bucketCount) + 1,
        Math.floor(((bucketIndex + 1) * length) / bucketCount),
      );
    downsampled.push(aggregateOhlcvRange(bars, bucketStart, bucketEnd));
  }

  return downsampled;
}

export function typedOhlcvBars<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
  xDomain: [number, number],
): VizTypedOhlcvBars {
  return sliceTypedOhlcvColumns(createTypedOhlcvColumns(bars), xDomain, 0, bars.length);
}

export function createTypedOhlcvColumns<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
): TypedOhlcvColumns {
  const adjustedClose = filledFloat64Array(bars.length, Number.NaN);
  const close = new Float64Array(bars.length);
  const high = new Float64Array(bars.length);
  const low = new Float64Array(bars.length);
  const open = new Float64Array(bars.length);
  const timestamp = new Float64Array(bars.length);
  const volume = filledFloat64Array(bars.length, Number.NaN);

  for (const [index, bar] of bars.entries()) {
    adjustedClose[index] = bar.adjustedClose ?? Number.NaN;
    close[index] = bar.close;
    high[index] = bar.high;
    low[index] = bar.low;
    open[index] = bar.open;
    timestamp[index] = bar.timestamp;
    volume[index] = bar.volume ?? Number.NaN;
  }

  return {
    adjustedClose,
    close,
    high,
    low,
    open,
    timestamp,
    volume,
  };
}

export function sliceTypedOhlcvColumns(
  columns: TypedOhlcvColumns,
  xDomain: [number, number],
  start: number,
  end: number,
): VizTypedOhlcvBars {
  const normalizedStart = Math.max(0, Math.min(columns.timestamp.length, start));
  const normalizedEnd = Math.max(normalizedStart, Math.min(columns.timestamp.length, end));

  return {
    adjustedClose: columns.adjustedClose.subarray(normalizedStart, normalizedEnd),
    close: columns.close.subarray(normalizedStart, normalizedEnd),
    high: columns.high.subarray(normalizedStart, normalizedEnd),
    low: columns.low.subarray(normalizedStart, normalizedEnd),
    open: columns.open.subarray(normalizedStart, normalizedEnd),
    timestamp: columns.timestamp.subarray(normalizedStart, normalizedEnd),
    volume: columns.volume.subarray(normalizedStart, normalizedEnd),
    summary: {
      barCount: normalizedEnd - normalizedStart,
      xDomain,
    },
  };
}

export function downsampleOhlcvBarsTyped<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
  query: { targetBarCount: number; xDomain: [number, number] },
): VizTypedOhlcvBars {
  return downsampleOhlcvBarsTypedInRange(bars, query);
}

export function downsampleOhlcvBarsTypedInRange<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
  query: { targetBarCount: number; xDomain: [number, number] },
  range: { end: number; start: number } = {
    end: upperBoundTimestamp(bars, query.xDomain[1]),
    start: lowerBoundTimestamp(bars, query.xDomain[0]),
  },
): VizTypedOhlcvBars {
  if (!Number.isFinite(query.targetBarCount) || query.targetBarCount <= 0) {
    throw new TypeError("targetBarCount must be greater than zero");
  }

  const start = Math.max(0, Math.min(bars.length, range.start));
  const end = Math.max(start, Math.min(bars.length, range.end));
  const length = end - start;
  const target = Math.floor(query.targetBarCount);

  if (length <= target) {
    return typedOhlcvBarsRange(bars, query.xDomain, start, end);
  }

  const bucketCount = Math.min(target, length);
  const adjustedClose = filledFloat64Array(bucketCount, Number.NaN);
  const close = new Float64Array(bucketCount);
  const high = new Float64Array(bucketCount);
  const low = new Float64Array(bucketCount);
  const open = new Float64Array(bucketCount);
  const timestamp = new Float64Array(bucketCount);
  const volume = filledFloat64Array(bucketCount, Number.NaN);

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex++) {
    const bucketStart = start + Math.floor((bucketIndex * length) / bucketCount);
    const bucketEnd =
      start +
      Math.max(
        Math.floor((bucketIndex * length) / bucketCount) + 1,
        Math.floor(((bucketIndex + 1) * length) / bucketCount),
      );
    writeTypedOhlcvBucket(
      bars,
      bucketStart,
      bucketEnd,
      {
        adjustedClose,
        close,
        high,
        low,
        open,
        timestamp,
        volume,
      },
      bucketIndex,
    );
  }

  return {
    adjustedClose,
    close,
    high,
    low,
    open,
    timestamp,
    volume,
    summary: {
      barCount: bucketCount,
      xDomain: query.xDomain,
    },
  };
}

export function createFinanceReturnSeries<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
  query: VizFinanceReturnsQuery,
  range: { end: number; start: number } = {
    end: upperBoundTimestamp(bars, query.xDomain[1]),
    start: lowerBoundTimestamp(bars, query.xDomain[0]),
  },
): VizDensitySeries<TProperties> {
  const method = query.method ?? "simple";
  const priceMode = query.priceMode ?? "raw";
  const start = Math.max(0, Math.min(bars.length, range.start));
  const end = Math.max(start, Math.min(bars.length, range.end));
  const returnCount = Math.max(0, end - start - 1);
  const targetBinCount = Math.max(1, query.targetPointCount ?? (returnCount || 1));
  const bucketCount = returnCount > targetBinCount ? targetBinCount : returnCount;
  const states = Array.from({ length: bucketCount }, () => createReturnBinState());
  let bucketIndex = 0;
  let bucketEnd = returnBucketEnd(bucketIndex, returnCount, bucketCount);

  for (let returnIndex = 0; returnIndex < returnCount; returnIndex++) {
    const previous = financeReturnPrice(bars[start + returnIndex]!, priceMode);
    const current = financeReturnPrice(bars[start + returnIndex + 1]!, priceMode);
    const y = method === "log" ? Math.log(current / previous) : current / previous - 1;

    while (returnIndex >= bucketEnd && bucketIndex < bucketCount - 1) {
      bucketIndex += 1;
      bucketEnd = returnBucketEnd(bucketIndex, returnCount, bucketCount);
    }

    updateReturnBinState(states[bucketIndex]!, returnIndex, y);
  }

  const bins = states.map((state, index) => createReturnBinFromState(bars, start, state, index));
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

export function createTypedFinanceReturnSeries<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
  query: VizFinanceReturnsQuery,
  range: { end: number; start: number } = {
    end: upperBoundTimestamp(bars, query.xDomain[1]),
    start: lowerBoundTimestamp(bars, query.xDomain[0]),
  },
): VizTypedFinanceReturns {
  const method = query.method ?? "simple";
  const priceMode = query.priceMode ?? "raw";
  const start = Math.max(0, Math.min(bars.length, range.start));
  const end = Math.max(start, Math.min(bars.length, range.end));
  const returnCount = Math.max(0, end - start - 1);
  const targetPointCount = Math.max(1, query.targetPointCount ?? (returnCount || 1));
  const bucketCount = returnCount > targetPointCount ? targetPointCount : returnCount;
  const x = new Float64Array(bucketCount);
  const y = filledFloat64Array(bucketCount, Number.NaN);
  const pointCount = new Uint32Array(bucketCount);
  const sums = new Float64Array(bucketCount);
  let bucketIndex = 0;
  let bucketEnd = returnBucketEnd(bucketIndex, returnCount, bucketCount);

  for (let returnIndex = 0; returnIndex < returnCount; returnIndex++) {
    const previous = financeReturnPrice(bars[start + returnIndex]!, priceMode);
    const current = financeReturnPrice(bars[start + returnIndex + 1]!, priceMode);
    const value = method === "log" ? Math.log(current / previous) : current / previous - 1;

    while (returnIndex >= bucketEnd && bucketIndex < bucketCount - 1) {
      bucketIndex += 1;
      bucketEnd = returnBucketEnd(bucketIndex, returnCount, bucketCount);
    }

    x[bucketIndex] = bars[start + returnIndex + 1]?.timestamp ?? returnIndex + 1;
    pointCount[bucketIndex] += 1;
    sums[bucketIndex] += value;
  }

  for (let index = 0; index < bucketCount; index++) {
    if (pointCount[index]! > 0) {
      y[index] = sums[index]! / pointCount[index]!;
    }
  }

  return {
    pointCount,
    x,
    y,
    summary: {
      pointCount: returnCount,
      sampleCount: bucketCount,
      xDomain: query.xDomain,
    },
  };
}

export function createTypedFinanceReturnSeriesFromColumns(
  columns: TypedOhlcvColumns,
  query: VizFinanceReturnsQuery,
  range: { end: number; start: number },
): VizTypedFinanceReturns {
  const method = query.method ?? "simple";
  const priceMode = query.priceMode ?? "raw";
  const start = Math.max(0, Math.min(columns.close.length, range.start));
  const end = Math.max(start, Math.min(columns.close.length, range.end));
  const returnCount = Math.max(0, end - start - 1);
  const targetPointCount = Math.max(1, query.targetPointCount ?? (returnCount || 1));
  const bucketCount = returnCount > targetPointCount ? targetPointCount : returnCount;
  const x = new Float64Array(bucketCount);
  const y = filledFloat64Array(bucketCount, Number.NaN);
  const pointCount = new Uint32Array(bucketCount);
  const sums = new Float64Array(bucketCount);
  let bucketIndex = 0;
  let bucketEnd = returnBucketEnd(bucketIndex, returnCount, bucketCount);

  for (let returnIndex = 0; returnIndex < returnCount; returnIndex++) {
    const previous = typedFinanceReturnPrice(columns, start + returnIndex, priceMode);
    const current = typedFinanceReturnPrice(columns, start + returnIndex + 1, priceMode);
    const value = method === "log" ? Math.log(current / previous) : current / previous - 1;

    while (returnIndex >= bucketEnd && bucketIndex < bucketCount - 1) {
      bucketIndex += 1;
      bucketEnd = returnBucketEnd(bucketIndex, returnCount, bucketCount);
    }

    x[bucketIndex] = columns.timestamp[start + returnIndex + 1] ?? returnIndex + 1;
    pointCount[bucketIndex] += 1;
    sums[bucketIndex] += value;
  }

  for (let index = 0; index < bucketCount; index++) {
    if (pointCount[index]! > 0) {
      y[index] = sums[index]! / pointCount[index]!;
    }
  }

  return {
    pointCount,
    x,
    y,
    summary: {
      pointCount: returnCount,
      sampleCount: bucketCount,
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
  return aggregateOhlcvRange(bars, 0, bars.length);
}

function aggregateOhlcvRange<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
  start: number,
  end: number,
): VizOhlcvBar<TProperties> {
  const first = bars[start];
  const last = bars[end - 1];

  if (!first || !last) {
    throw new TypeError("cannot aggregate an empty OHLCV bucket");
  }

  let adjustedClose = last.adjustedClose;
  let hasVolume = false;
  let high = first.high;
  let low = first.low;
  let volume = 0;

  for (let index = end - 1; index >= start && adjustedClose == null; index--) {
    adjustedClose = bars[index]?.adjustedClose;
  }

  for (let index = start; index < end; index++) {
    const bar = bars[index]!;
    high = Math.max(high, bar.high);
    low = Math.min(low, bar.low);

    if (bar.volume != null) {
      hasVolume = true;
      volume += bar.volume;
    }
  }

  return {
    adjustedClose,
    close: last.close,
    high,
    low,
    metrics: last.metrics,
    open: first.open,
    properties: last.properties,
    timestamp: first.timestamp,
    volume: hasVolume ? volume : undefined,
  };
}

function typedOhlcvBarsRange<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
  xDomain: [number, number],
  start: number,
  end: number,
): VizTypedOhlcvBars {
  const length = end - start;
  const adjustedClose = filledFloat64Array(length, Number.NaN);
  const close = new Float64Array(length);
  const high = new Float64Array(length);
  const low = new Float64Array(length);
  const open = new Float64Array(length);
  const timestamp = new Float64Array(length);
  const volume = filledFloat64Array(length, Number.NaN);

  for (let index = 0; index < length; index += 1) {
    const bar = bars[start + index]!;
    adjustedClose[index] = bar.adjustedClose ?? Number.NaN;
    close[index] = bar.close;
    high[index] = bar.high;
    low[index] = bar.low;
    open[index] = bar.open;
    timestamp[index] = bar.timestamp;
    volume[index] = bar.volume ?? Number.NaN;
  }

  return {
    adjustedClose,
    close,
    high,
    low,
    open,
    timestamp,
    volume,
    summary: {
      barCount: length,
      xDomain,
    },
  };
}

function writeTypedOhlcvBucket<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
  start: number,
  end: number,
  output: Pick<
    VizTypedOhlcvBars,
    "adjustedClose" | "close" | "high" | "low" | "open" | "timestamp" | "volume"
  >,
  outputIndex: number,
) {
  const first = bars[start];
  const last = bars[end - 1];

  if (!first || !last) {
    throw new TypeError("cannot aggregate an empty OHLCV bucket");
  }

  let adjustedClose = last.adjustedClose;
  let hasVolume = false;
  let high = first.high;
  let low = first.low;
  let volume = 0;

  for (let index = end - 1; index >= start && adjustedClose == null; index -= 1) {
    adjustedClose = bars[index]?.adjustedClose;
  }

  for (let index = start; index < end; index += 1) {
    const bar = bars[index]!;
    high = Math.max(high, bar.high);
    low = Math.min(low, bar.low);

    if (bar.volume != null) {
      hasVolume = true;
      volume += bar.volume;
    }
  }

  output.adjustedClose[outputIndex] = adjustedClose ?? Number.NaN;
  output.close[outputIndex] = last.close;
  output.high[outputIndex] = high;
  output.low[outputIndex] = low;
  output.open[outputIndex] = first.open;
  output.timestamp[outputIndex] = first.timestamp;
  output.volume[outputIndex] = hasVolume ? volume : Number.NaN;
}

type ReturnBinState = {
  firstReturnIndex: number;
  firstY: number;
  lastReturnIndex: number;
  lastY: number;
  maxY: number;
  minY: number;
  pointCount: number;
  sumY: number;
};

function createReturnBinState(): ReturnBinState {
  return {
    firstReturnIndex: -1,
    firstY: 0,
    lastReturnIndex: -1,
    lastY: 0,
    maxY: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    pointCount: 0,
    sumY: 0,
  };
}

function updateReturnBinState(state: ReturnBinState, returnIndex: number, y: number) {
  if (state.firstReturnIndex === -1) {
    state.firstReturnIndex = returnIndex;
    state.firstY = y;
  }

  state.lastReturnIndex = returnIndex;
  state.lastY = y;
  state.maxY = Math.max(state.maxY, y);
  state.minY = Math.min(state.minY, y);
  state.pointCount += 1;
  state.sumY += y;
}

function returnBucketEnd(bucketIndex: number, returnCount: number, bucketCount: number) {
  if (bucketCount <= 0) {
    return 0;
  }

  const start = Math.floor((bucketIndex * returnCount) / bucketCount);
  return Math.max(start + 1, Math.floor(((bucketIndex + 1) * returnCount) / bucketCount));
}

function createReturnBinFromState<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
  rangeStart: number,
  state: ReturnBinState,
  index: number,
): VizDensityBin<TProperties> {
  const firstPoint =
    state.firstReturnIndex === -1
      ? null
      : createReturnPoint(
          bars,
          rangeStart,
          state.firstReturnIndex,
          state.firstReturnIndex,
          state.firstY,
        );
  const lastPoint =
    state.lastReturnIndex === -1
      ? null
      : createReturnPoint(
          bars,
          rangeStart,
          state.lastReturnIndex,
          state.lastReturnIndex,
          state.lastY,
        );

  return {
    averageY: state.pointCount ? state.sumY / state.pointCount : null,
    firstPoint,
    firstPointIndex: firstPoint?.sourceIndex ?? null,
    index,
    lastPoint,
    lastPointIndex: lastPoint?.sourceIndex ?? null,
    maxY: state.pointCount ? state.maxY : null,
    metrics: {},
    minY: state.pointCount ? state.minY : null,
    pointCount: state.pointCount,
    sumY: state.sumY,
    x0: firstPoint?.x ?? 0,
    x1: lastPoint?.x ?? firstPoint?.x ?? 0,
  };
}

function createReturnPoint<TProperties>(
  bars: readonly VizOhlcvBar<TProperties>[],
  rangeStart: number,
  returnIndex: number,
  sourceReturnIndex: number,
  y: number,
): VizIndexedSeriesPoint<TProperties> {
  const currentBarIndex = rangeStart + returnIndex + 1;
  const current = bars[currentBarIndex];

  return {
    id: `return-${sourceReturnIndex + 1}`,
    label: String(current?.timestamp ?? sourceReturnIndex + 1),
    properties: current?.properties,
    sourceIndex: sourceReturnIndex + 1,
    x: current?.timestamp ?? sourceReturnIndex + 1,
    y,
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

function financeReturnPrice<TProperties>(
  bar: VizOhlcvBar<TProperties>,
  priceMode: "adjusted" | "raw",
) {
  return priceMode === "adjusted" ? (bar.adjustedClose ?? bar.close) : bar.close;
}

function typedFinanceReturnPrice(
  columns: TypedOhlcvColumns,
  index: number,
  priceMode: "adjusted" | "raw",
) {
  if (priceMode === "raw") {
    return columns.close[index]!;
  }

  const adjustedClose = columns.adjustedClose[index]!;
  return Number.isNaN(adjustedClose) ? columns.close[index]! : adjustedClose;
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

function filledFloat64Array(length: number, value: number) {
  const array = new Float64Array(length);
  array.fill(value);
  return array;
}
