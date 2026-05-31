import type {
  VizBinnedSeriesQuery,
  VizDensityBin,
  VizDensityQuery,
  VizDensitySample,
  VizHeatmapCell,
  VizHeatmapQuery,
  VizHistogramBucket,
  VizHistogramQuery,
  VizIndexedSeriesPoint,
  VizMetricRecord,
  VizPercentileMode,
  VizPointValueAccessor,
  VizRollingSeries,
  VizRollingSeriesQuery,
  VizRollingStatistic,
  VizSeriesBounds,
  VizSeriesPoint,
  VizValueMode,
} from "../types";

export type NormalizedSeriesPoint<TProperties> = VizIndexedSeriesPoint<TProperties>;
type WorkingDensityBin<TProperties> = VizDensityBin<TProperties> & { yValues?: number[] };

const PERCENTILE_VALUES: Record<VizPercentileMode, number> = {
  p10: 0.1,
  p25: 0.25,
  p50: 0.5,
  p75: 0.75,
  p90: 0.9,
  p95: 0.95,
  p99: 0.99,
};

export function normalizeSeriesPoints<TProperties>(
  points: readonly VizSeriesPoint<TProperties>[],
): Array<NormalizedSeriesPoint<TProperties>> {
  const normalized: Array<NormalizedSeriesPoint<TProperties>> = [];

  for (const [sourceIndex, point] of points.entries()) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      continue;
    }

    normalized.push({
      ...point,
      metrics: normalizeMetrics(point.metrics),
      sourceIndex,
    });
  }

  return normalized.sort((left, right) => left.x - right.x || left.sourceIndex - right.sourceIndex);
}

export function collectMetricKeys<TProperties>(
  points: readonly NormalizedSeriesPoint<TProperties>[],
) {
  const keys = new Set<string>();

  for (const point of points) {
    for (const key of Object.keys(point.metrics ?? {})) {
      keys.add(key);
    }
  }

  return [...keys].sort();
}

export function createPointLookup<TProperties>(
  points: readonly NormalizedSeriesPoint<TProperties>[],
) {
  const bySourceIndex = new Map<number, NormalizedSeriesPoint<TProperties>>();
  const byId = new Map<string, NormalizedSeriesPoint<TProperties>>();

  for (const point of points) {
    bySourceIndex.set(point.sourceIndex, point);
    if (point.id) {
      byId.set(point.id, point);
    }
  }

  return { byId, bySourceIndex };
}

export function getSeriesBounds<TProperties>(
  points: readonly NormalizedSeriesPoint<TProperties>[],
): VizSeriesBounds | null {
  const first = points[0];

  if (!first) {
    return null;
  }

  let minX = first.x;
  let maxX = first.x;
  let minY = first.y;
  let maxY = first.y;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  return {
    maxX,
    maxY,
    minX,
    minY,
  };
}

export function createBins<TProperties>(
  points: readonly NormalizedSeriesPoint<TProperties>[],
  metricKeys: readonly string[],
  query: VizBinnedSeriesQuery,
  percentiles: readonly VizPercentileMode[] = [],
): Array<VizDensityBin<TProperties>> {
  const xDomain = normalizeDomain(query.xDomain);
  const binCount = clampCount(query.targetBinCount);
  const width = binWidth(xDomain, binCount);
  const trackPercentiles = percentiles.length > 0;
  const bins = Array.from({ length: binCount }, (_, index) =>
    createEmptyBin<TProperties>(index, binCount, xDomain, width, metricKeys),
  );

  for (const point of pointsInXDomain(points, xDomain)) {
    const index = bucketIndex(point.x, xDomain, binCount);
    updateBin(bins[index], point, metricKeys, trackPercentiles);
  }

  for (const bin of bins) {
    applyPercentiles(bin, percentiles);
  }

  const visibleBins = query.includeEmptyBins ? bins : bins.filter((bin) => bin.pointCount > 0);

  for (const bin of visibleBins) {
    delete (bin as Partial<WorkingDensityBin<TProperties>>).yValues;
  }

  return visibleBins;
}

export function createChartSeries<TProperties>(
  points: readonly NormalizedSeriesPoint<TProperties>[],
  metricKeys: readonly string[],
  query: VizDensityQuery,
) {
  const valueMode = query.valueMode ?? "average";
  const percentiles = resolveRequestedPercentiles(query.percentiles, valueMode);
  const bins = createBins(
    points,
    metricKeys,
    {
      includeEmptyBins: query.includeEmptyBins,
      targetBinCount: query.targetBinCount,
      xDomain: query.xDomain,
    },
    percentiles,
  );
  const samples = bins.map((bin) => createSample(bin, valueMode));

  return {
    bins,
    samples,
    summary: {
      binCount: bins.length,
      metrics: sumMetricRecords(bins.map((bin) => bin.metrics)),
      pointCount: bins.reduce((sum, bin) => sum + bin.pointCount, 0),
      sampleCount: samples.length,
      valueMode,
      xDomain: normalizeDomain(query.xDomain),
    },
  };
}

export function createHistogram<TProperties>(
  points: readonly NormalizedSeriesPoint<TProperties>[],
  metricKeys: readonly string[],
  query: VizHistogramQuery,
) {
  const bucketCount = clampCount(query.bucketCount);
  const selectedPoints = query.xDomain
    ? pointsInXDomain(points, normalizeDomain(query.xDomain))
    : points;
  const valuedPoints = selectedPoints
    .map((point) => ({ point, value: pointAccessorValue(point, query.valueAccessor ?? "y") }))
    .filter((item): item is { point: NormalizedSeriesPoint<TProperties>; value: number } =>
      Number.isFinite(item.value),
    );
  const valueDomain = normalizeDomain(query.valueDomain ?? deriveValueDomain(valuedPoints));
  const width = binWidth(valueDomain, bucketCount);
  const buckets = Array.from({ length: bucketCount }, (_, index) =>
    createEmptyHistogramBucket<TProperties>(index, bucketCount, valueDomain, width, metricKeys),
  );

  for (const { point, value } of valuedPoints) {
    if (value < valueDomain[0] || value > valueDomain[1]) {
      continue;
    }

    updateHistogramBucket(
      buckets[bucketIndex(value, valueDomain, bucketCount)],
      point,
      value,
      metricKeys,
    );
  }

  const visibleBuckets =
    query.includeEmptyBuckets === false
      ? buckets.filter((bucket) => bucket.pointCount > 0)
      : buckets;

  return {
    buckets: visibleBuckets,
    summary: {
      bucketCount: visibleBuckets.length,
      metrics: sumMetricRecords(visibleBuckets.map((bucket) => bucket.metrics)),
      pointCount: visibleBuckets.reduce((sum, bucket) => sum + bucket.pointCount, 0),
      valueDomain,
      xDomain: query.xDomain ? normalizeDomain(query.xDomain) : null,
    },
  };
}

export function createHeatmap<TProperties>(
  points: readonly NormalizedSeriesPoint<TProperties>[],
  metricKeys: readonly string[],
  query: VizHeatmapQuery,
) {
  const xBinCount = clampCount(query.xBinCount);
  const yBinCount = clampCount(query.yBinCount);
  const xDomain = normalizeDomain(query.xDomain);
  const valueAccessor = query.valueAccessor ?? "y";
  const start = lowerBoundX(points, xDomain[0]);
  const end = upperBoundX(points, xDomain[1]);
  const yDomain = normalizeDomain(
    query.yDomain ?? deriveValueDomainFromRange(points, start, end, valueAccessor),
  );
  const xWidth = binWidth(xDomain, xBinCount);
  const yWidth = binWidth(yDomain, yBinCount);
  const cellCount = xBinCount * yBinCount;
  const counts = new Uint32Array(cellCount);
  const sums = new Float64Array(cellCount);
  const firstPointIndexes = new Int32Array(cellCount);
  const lastPointIndexes = new Int32Array(cellCount);
  const metricSums = metricKeys.map(() => new Float64Array(cellCount));
  firstPointIndexes.fill(-1);
  lastPointIndexes.fill(-1);

  let maxCellCount = 0;
  let summaryPointCount = 0;
  const summaryMetrics = zeroMetrics(metricKeys);

  for (let pointIndex = start; pointIndex < end; pointIndex++) {
    const point = points[pointIndex]!;
    const value = pointAccessorValue(point, valueAccessor);

    if (!Number.isFinite(value) || value < yDomain[0] || value > yDomain[1]) {
      continue;
    }

    const xIndex = bucketIndex(point.x, xDomain, xBinCount);
    const yIndex = bucketIndex(value, yDomain, yBinCount);
    const cellIndex = yIndex * xBinCount + xIndex;
    const nextCount = counts[cellIndex]! + 1;
    counts[cellIndex] = nextCount;
    sums[cellIndex] += value;
    if (firstPointIndexes[cellIndex] === -1) {
      firstPointIndexes[cellIndex] = pointIndex;
    }
    lastPointIndexes[cellIndex] = pointIndex;
    maxCellCount = Math.max(maxCellCount, nextCount);
    summaryPointCount += 1;

    for (const [metricIndex, metricKey] of metricKeys.entries()) {
      const metricValue = point.metrics?.[metricKey] ?? 0;
      metricSums[metricIndex]![cellIndex] += metricValue;
      summaryMetrics[metricKey] = (summaryMetrics[metricKey] ?? 0) + metricValue;
    }
  }

  const cells: Array<VizHeatmapCell<TProperties>> = [];

  for (let index = 0; index < cellCount; index++) {
    const pointCount = counts[index]!;
    if (query.includeEmptyCells === false && pointCount === 0) {
      continue;
    }

    cells.push(
      createHeatmapCellFromAccumulators(
        index,
        xBinCount,
        yBinCount,
        xDomain,
        yDomain,
        xWidth,
        yWidth,
        points,
        metricKeys,
        metricSums,
        counts,
        sums,
        firstPointIndexes,
        lastPointIndexes,
        maxCellCount,
      ),
    );
  }

  return {
    cells,
    summary: {
      maxCellCount,
      metrics: summaryMetrics,
      pointCount: summaryPointCount,
      xBinCount,
      xDomain,
      yBinCount,
      yDomain,
    },
  };
}

export function createRollingSeries<TProperties>(
  points: readonly NormalizedSeriesPoint<TProperties>[],
  query: VizRollingSeriesQuery,
): VizRollingSeries<TProperties> {
  const xDomain = normalizeDomain(query.xDomain);
  const windowSize = clampCount(query.windowSize);
  const minPeriods = Math.min(windowSize, Math.max(1, Math.floor(query.minPeriods ?? windowSize)));
  const statistic = query.statistic ?? "mean";
  const alpha = normalizeAlpha(query.alpha, windowSize);
  const selectedPoints = pointsInXDomain(points, xDomain);
  const rollingPoints: VizRollingSeries<TProperties>["points"] = [];
  const minQueue: Array<{ index: number; value: number }> = [];
  const maxQueue: Array<{ index: number; value: number }> = [];
  let minHead = 0;
  let maxHead = 0;
  let sum = 0;
  let sumSquares = 0;
  let ema: number | null = null;

  for (const [index, point] of selectedPoints.entries()) {
    const value = point.y;
    ema = ema === null ? value : alpha * value + (1 - alpha) * ema;
    sum += value;
    sumSquares += value * value;

    while (minQueue.length > minHead && minQueue[minQueue.length - 1]!.value >= value) {
      minQueue.pop();
    }
    minQueue.push({ index, value });

    while (maxQueue.length > maxHead && maxQueue[maxQueue.length - 1]!.value <= value) {
      maxQueue.pop();
    }
    maxQueue.push({ index, value });

    if (index >= windowSize) {
      const expiredIndex = index - windowSize;
      const expired = selectedPoints[expiredIndex]!.y;
      sum -= expired;
      sumSquares -= expired * expired;

      while (minQueue[minHead] && minQueue[minHead]!.index <= expiredIndex) {
        minHead += 1;
      }
      while (maxQueue[maxHead] && maxQueue[maxHead]!.index <= expiredIndex) {
        maxHead += 1;
      }
    }

    const pointCount = Math.min(index + 1, windowSize);
    const hasEnoughPoints = pointCount >= minPeriods;
    const mean = hasEnoughPoints ? sum / pointCount : null;
    const min = hasEnoughPoints ? (minQueue[minHead]?.value ?? null) : null;
    const max = hasEnoughPoints ? (maxQueue[maxHead]?.value ?? null) : null;
    const stdDev = hasEnoughPoints ? sampleStdDev(sum, sumSquares, pointCount) : null;
    const zScore =
      mean !== null && stdDev !== null && stdDev > Number.EPSILON
        ? (point.y - mean) / stdDev
        : null;
    const rollingEma = hasEnoughPoints ? ema : null;
    const rollingSum = hasEnoughPoints ? sum : null;
    const y = rollingStatisticValue(statistic, {
      ema: rollingEma,
      max,
      mean,
      min,
      stdDev,
      zScore,
    });

    rollingPoints.push({
      ema: rollingEma,
      index,
      max,
      mean,
      min,
      pointCount,
      sourcePoint: point,
      sourcePointIndex: point.sourceIndex,
      statistic,
      stdDev,
      sum: rollingSum,
      windowSize,
      x: point.x,
      y,
      zScore,
    });
  }

  return {
    points: rollingPoints,
    summary: {
      alpha,
      minPeriods,
      pointCount: selectedPoints.length,
      sampleCount: rollingPoints.filter((point) => point.y !== null).length,
      statistic,
      windowSize,
      xDomain,
    },
  };
}

export function normalizeDomain(domain: [number, number]): [number, number] {
  const left = Number.isFinite(domain[0]) ? domain[0] : 0;
  const right = Number.isFinite(domain[1]) ? domain[1] : left;

  return left <= right ? [left, right] : [right, left];
}

export function normalizeMetrics(metrics: VizMetricRecord | undefined): VizMetricRecord {
  const normalized: VizMetricRecord = {};

  for (const [key, value] of Object.entries(metrics ?? {})) {
    if (Number.isFinite(value)) {
      normalized[key] = value;
    }
  }

  return normalized;
}

function createEmptyBin<TProperties>(
  index: number,
  binCount: number,
  xDomain: [number, number],
  width: number,
  metricKeys: readonly string[],
): WorkingDensityBin<TProperties> {
  const x0 = xDomain[0] + index * width;

  return {
    averageY: null,
    firstPoint: null,
    firstPointIndex: null,
    index,
    lastPoint: null,
    lastPointIndex: null,
    maxY: null,
    metrics: zeroMetrics(metricKeys),
    minY: null,
    pointCount: 0,
    sumY: 0,
    x0,
    x1: index + 1 === binCount ? xDomain[1] : xDomain[0] + (index + 1) * width,
  };
}

function updateBin<TProperties>(
  bin: WorkingDensityBin<TProperties>,
  point: NormalizedSeriesPoint<TProperties>,
  metricKeys: readonly string[],
  trackPercentiles = false,
) {
  bin.firstPoint ??= point;
  bin.firstPointIndex ??= point.sourceIndex;
  bin.lastPoint = point;
  bin.lastPointIndex = point.sourceIndex;
  bin.pointCount += 1;
  bin.sumY += point.y;
  bin.averageY = bin.sumY / bin.pointCount;
  bin.minY = bin.minY === null ? point.y : Math.min(bin.minY, point.y);
  bin.maxY = bin.maxY === null ? point.y : Math.max(bin.maxY, point.y);
  if (trackPercentiles) {
    (bin.yValues ??= []).push(point.y);
  }
  addMetrics(bin.metrics, point.metrics, metricKeys);
}

function createSample<TProperties>(
  bin: VizDensityBin<TProperties>,
  valueMode: VizValueMode,
): VizDensitySample<TProperties> {
  return {
    ...bin,
    x: bin.x0 + (bin.x1 - bin.x0) / 2,
    y: sampleValue(bin, valueMode),
  };
}

function sampleValue<TProperties>(bin: VizDensityBin<TProperties>, valueMode: VizValueMode) {
  switch (valueMode) {
    case "average":
      return bin.averageY;
    case "count":
      return bin.pointCount > 0 ? bin.pointCount : null;
    case "max":
      return bin.maxY;
    case "min":
      return bin.minY;
    case "sum":
      return bin.pointCount > 0 ? bin.sumY : null;
    case "p10":
    case "p25":
    case "p50":
    case "p75":
    case "p90":
    case "p95":
    case "p99":
      return bin[valueMode] ?? null;
  }
}

function resolveRequestedPercentiles(
  percentiles: readonly VizPercentileMode[] | undefined,
  valueMode: VizValueMode,
): VizPercentileMode[] {
  const requested = new Set(percentiles ?? []);

  if (isPercentileMode(valueMode)) {
    requested.add(valueMode);
  }

  return [...requested];
}

function isPercentileMode(valueMode: VizValueMode): valueMode is VizPercentileMode {
  return valueMode in PERCENTILE_VALUES;
}

function applyPercentiles<TProperties>(
  bin: WorkingDensityBin<TProperties>,
  percentiles: readonly VizPercentileMode[],
) {
  if (!bin.pointCount || percentiles.length === 0) {
    return;
  }

  const yValues = [...(bin.yValues ?? [])].sort((left, right) => left - right);

  for (const percentile of percentiles) {
    bin[percentile] = percentileValue(yValues, PERCENTILE_VALUES[percentile]);
  }
}

function percentileValue(sortedValues: readonly number[], percentile: number) {
  if (sortedValues.length === 0) {
    return null;
  }

  if (sortedValues.length === 1) {
    return sortedValues[0] ?? null;
  }

  const rank = percentile * (sortedValues.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const lowerValue = sortedValues[lowerIndex] ?? 0;
  const upperValue = sortedValues[upperIndex] ?? lowerValue;

  return lowerValue + (upperValue - lowerValue) * (rank - lowerIndex);
}

function createEmptyHistogramBucket<TProperties>(
  index: number,
  bucketCount: number,
  valueDomain: [number, number],
  width: number,
  metricKeys: readonly string[],
): VizHistogramBucket<TProperties> {
  const value0 = valueDomain[0] + index * width;

  return {
    averageValue: null,
    firstPoint: null,
    firstPointIndex: null,
    index,
    lastPoint: null,
    lastPointIndex: null,
    maxValue: null,
    metrics: zeroMetrics(metricKeys),
    minValue: null,
    pointCount: 0,
    sumValue: 0,
    value: value0 + width / 2,
    value0,
    value1: index + 1 === bucketCount ? valueDomain[1] : value0 + width,
  };
}

function updateHistogramBucket<TProperties>(
  bucket: VizHistogramBucket<TProperties>,
  point: NormalizedSeriesPoint<TProperties>,
  value: number,
  metricKeys: readonly string[],
) {
  bucket.firstPoint ??= point;
  bucket.firstPointIndex ??= point.sourceIndex;
  bucket.lastPoint = point;
  bucket.lastPointIndex = point.sourceIndex;
  bucket.pointCount += 1;
  bucket.sumValue += value;
  bucket.averageValue = bucket.sumValue / bucket.pointCount;
  bucket.minValue = bucket.minValue === null ? value : Math.min(bucket.minValue, value);
  bucket.maxValue = bucket.maxValue === null ? value : Math.max(bucket.maxValue, value);
  addMetrics(bucket.metrics, point.metrics, metricKeys);
}

function createHeatmapCellFromAccumulators<TProperties>(
  index: number,
  xBinCount: number,
  yBinCount: number,
  xDomain: [number, number],
  yDomain: [number, number],
  xWidth: number,
  yWidth: number,
  points: readonly NormalizedSeriesPoint<TProperties>[],
  metricKeys: readonly string[],
  metricSums: readonly Float64Array[],
  counts: Uint32Array,
  sums: Float64Array,
  firstPointIndexes: Int32Array,
  lastPointIndexes: Int32Array,
  maxCellCount: number,
): VizHeatmapCell<TProperties> {
  const xIndex = index % xBinCount;
  const yIndex = Math.floor(index / xBinCount);
  const x0 = xDomain[0] + xIndex * xWidth;
  const y0 = yDomain[0] + yIndex * yWidth;
  const pointCount = counts[index]!;
  const firstPointIndex = firstPointIndexes[index]!;
  const lastPointIndex = lastPointIndexes[index]!;
  const metrics: VizMetricRecord = {};

  for (const [metricIndex, metricKey] of metricKeys.entries()) {
    metrics[metricKey] = metricSums[metricIndex]?.[index] ?? 0;
  }

  return {
    averageValue: pointCount ? sums[index]! / pointCount : null,
    firstPoint: firstPointIndex === -1 ? null : (points[firstPointIndex] ?? null),
    firstPointIndex: firstPointIndex === -1 ? null : (points[firstPointIndex]?.sourceIndex ?? null),
    index,
    lastPoint: lastPointIndex === -1 ? null : (points[lastPointIndex] ?? null),
    lastPointIndex: lastPointIndex === -1 ? null : (points[lastPointIndex]?.sourceIndex ?? null),
    metrics,
    pointCount,
    sumValue: sums[index]!,
    value: maxCellCount > 0 ? pointCount / maxCellCount : 0,
    x: x0 + xWidth / 2,
    x0,
    x1: xIndex + 1 === xBinCount ? xDomain[1] : x0 + xWidth,
    xIndex,
    y: y0 + yWidth / 2,
    y0,
    y1: yIndex + 1 === yBinCount ? yDomain[1] : y0 + yWidth,
    yIndex,
  };
}

function pointAccessorValue<TProperties>(
  point: NormalizedSeriesPoint<TProperties>,
  accessor: VizPointValueAccessor,
) {
  if (typeof accessor === "object") {
    return point.metrics?.[accessor.metric] ?? Number.NaN;
  }

  return point[accessor];
}

function pointsInXDomain<TProperties>(
  points: readonly NormalizedSeriesPoint<TProperties>[],
  xDomain: [number, number],
) {
  return points.filter((point) => point.x >= xDomain[0] && point.x <= xDomain[1]);
}

function lowerBoundX<TProperties>(
  points: readonly NormalizedSeriesPoint<TProperties>[],
  value: number,
) {
  let low = 0;
  let high = points.length;

  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (points[mid]!.x < value) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

function upperBoundX<TProperties>(
  points: readonly NormalizedSeriesPoint<TProperties>[],
  value: number,
) {
  let low = 0;
  let high = points.length;

  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (points[mid]!.x <= value) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

function deriveValueDomain<TProperties>(
  valuedPoints: readonly { value: number }[],
): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let hasPoints = false;

  for (const { value } of valuedPoints) {
    hasPoints = true;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  return hasPoints ? [min, max] : [0, 0];
}

function deriveValueDomainFromRange<TProperties>(
  points: readonly NormalizedSeriesPoint<TProperties>[],
  start: number,
  end: number,
  valueAccessor: VizPointValueAccessor,
): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let hasPoints = false;

  for (let index = start; index < end; index++) {
    const value = pointAccessorValue(points[index]!, valueAccessor);
    if (!Number.isFinite(value)) {
      continue;
    }

    hasPoints = true;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  return hasPoints ? [min, max] : [0, 0];
}

function binWidth(domain: [number, number], binCount: number) {
  const span = domain[1] - domain[0];

  return span > 0 ? span / binCount : 1;
}

function bucketIndex(value: number, domain: [number, number], bucketCount: number) {
  const index = Math.floor((value - domain[0]) / binWidth(domain, bucketCount));

  return Math.min(bucketCount - 1, Math.max(0, index));
}

function clampCount(value: number) {
  return Math.min(100_000, Math.max(1, Math.floor(Number.isFinite(value) ? value : 1)));
}

function normalizeAlpha(alpha: number | undefined, windowSize: number) {
  return alpha != null && Number.isFinite(alpha) && alpha > 0 && alpha <= 1
    ? alpha
    : 2 / (windowSize + 1);
}

function sampleStdDev(sum: number, sumSquares: number, pointCount: number) {
  if (pointCount < 2) {
    return null;
  }

  const variance = (sumSquares - (sum * sum) / pointCount) / (pointCount - 1);

  return Math.sqrt(Math.max(0, variance));
}

function rollingStatisticValue(
  statistic: VizRollingStatistic,
  values: Pick<
    VizRollingSeries["points"][number],
    "ema" | "max" | "mean" | "min" | "stdDev" | "zScore"
  >,
) {
  switch (statistic) {
    case "ema":
      return values.ema;
    case "max":
      return values.max;
    case "mean":
      return values.mean;
    case "min":
      return values.min;
    case "stdDev":
      return values.stdDev;
    case "zScore":
      return values.zScore;
  }
}

function zeroMetrics(metricKeys: readonly string[]) {
  return Object.fromEntries(metricKeys.map((key) => [key, 0]));
}

function addMetrics(
  target: VizMetricRecord,
  metrics: VizMetricRecord | undefined,
  metricKeys: readonly string[],
) {
  for (const key of metricKeys) {
    target[key] = (target[key] ?? 0) + (metrics?.[key] ?? 0);
  }
}

function sumMetricRecords(records: readonly VizMetricRecord[]) {
  const result: VizMetricRecord = {};

  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      result[key] = (result[key] ?? 0) + value;
    }
  }

  return result;
}
