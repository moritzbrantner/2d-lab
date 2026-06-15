import type {
  VizBinnedSeriesQuery,
  VizTypedDensitySeries,
  VizTypedHeatmap,
  VizTypedHistogram,
  VizTypedMetricArrays,
  VizTypedRollingSeries,
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
  VizXyDataset,
  VizXyObjectDataset,
  VizXyTypedDataset,
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

export function isVizXyTypedDataset(value: unknown): value is VizXyTypedDataset {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { kind?: unknown }).kind === "xy" &&
    (value as { x?: unknown }).x instanceof Float64Array &&
    (value as { y?: unknown }).y instanceof Float64Array
  );
}

export function normalizeSeriesInput<TProperties>(
  input: readonly VizSeriesPoint<TProperties>[] | VizXyDataset<TProperties>,
): Array<NormalizedSeriesPoint<TProperties>> {
  if (isVizXyTypedDataset(input)) {
    return normalizeTypedSeriesPoints(input);
  }

  return normalizeSeriesPoints(
    Array.isArray(input) ? input : (input as VizXyObjectDataset<TProperties>).points,
  );
}

export function normalizeTypedSeriesPoints<TProperties>(
  dataset: VizXyTypedDataset,
): Array<NormalizedSeriesPoint<TProperties>> {
  const pointCount = Math.min(dataset.x.length, dataset.y.length);
  const metricKeys = dataset.metricKeys ?? [];
  const metricCount = metricKeys.length;
  const normalized: Array<NormalizedSeriesPoint<TProperties>> = [];

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const x = dataset.x[pointIndex]!;
    const y = dataset.y[pointIndex]!;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }

    const metrics: VizMetricRecord = {};
    for (let metricIndex = 0; metricIndex < metricCount; metricIndex += 1) {
      const value = dataset.metrics?.[pointIndex * metricCount + metricIndex] ?? 0;
      metrics[metricKeys[metricIndex]!] = Number.isFinite(value) ? value : 0;
    }

    normalized.push({
      id: dataset.ids?.[pointIndex],
      label: dataset.labels?.[pointIndex],
      metrics,
      sourceIndex: dataset.sourceIndices?.[pointIndex] ?? pointIndex,
      x,
      y,
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

export function createTypedBinnedSeries<TProperties>(
  points: readonly NormalizedSeriesPoint<TProperties>[],
  metricKeys: readonly string[],
  query: VizDensityQuery,
): VizTypedDensitySeries {
  const valueMode = query.valueMode ?? "average";
  const percentiles = resolveRequestedPercentiles(query.percentiles, valueMode);
  if (percentiles.length > 0) {
    return typedFromDensitySeries(createChartSeries(points, metricKeys, query), metricKeys);
  }

  const xDomain = normalizeDomain(query.xDomain);
  const binCount = clampCount(query.targetBinCount);
  const width = binWidth(xDomain, binCount);
  const counts = new Uint32Array(binCount);
  const sums = new Float64Array(binCount);
  const minY = filledFloat64Array(binCount, Number.NaN);
  const maxY = filledFloat64Array(binCount, Number.NaN);
  const firstPointIndex = filledInt32Array(binCount, -1);
  const lastPointIndex = filledInt32Array(binCount, -1);
  const metricArrays = createMetricArrays(metricKeys, binCount);
  const start = lowerBoundX(points, xDomain[0]);
  const end = upperBoundX(points, xDomain[1]);

  for (let pointIndex = start; pointIndex < end; pointIndex++) {
    const point = points[pointIndex]!;
    const index = bucketIndex(point.x, xDomain, binCount);
    const nextCount = counts[index]! + 1;
    counts[index] = nextCount;
    sums[index] += point.y;
    minY[index] = Number.isNaN(minY[index]!) ? point.y : Math.min(minY[index]!, point.y);
    maxY[index] = Number.isNaN(maxY[index]!) ? point.y : Math.max(maxY[index]!, point.y);
    if (firstPointIndex[index] === -1) {
      firstPointIndex[index] = point.sourceIndex;
    }
    lastPointIndex[index] = point.sourceIndex;
    addMetricArrays(metricArrays, metricKeys, point.metrics, index);
  }

  const visibleIndexes = query.includeEmptyBins
    ? Array.from({ length: binCount }, (_, index) => index)
    : indexesWhere(counts, (count) => count > 0);
  const output = createTypedDensityArrays(visibleIndexes.length);
  const outputMetrics = createMetricArrays(metricKeys, visibleIndexes.length);

  for (const [outputIndex, sourceIndex] of visibleIndexes.entries()) {
    const count = counts[sourceIndex]!;
    const x0 = xDomain[0] + sourceIndex * width;
    const x1 = sourceIndex + 1 === binCount ? xDomain[1] : xDomain[0] + (sourceIndex + 1) * width;
    const averageY = count > 0 ? sums[sourceIndex]! / count : Number.NaN;

    output.x0[outputIndex] = x0;
    output.x1[outputIndex] = x1;
    output.averageY[outputIndex] = averageY;
    output.firstPointIndex[outputIndex] = firstPointIndex[sourceIndex]!;
    output.lastPointIndex[outputIndex] = lastPointIndex[sourceIndex]!;
    output.maxY[outputIndex] = maxY[sourceIndex]!;
    output.minY[outputIndex] = minY[sourceIndex]!;
    output.pointCount[outputIndex] = count;
    output.sumY[outputIndex] = sums[sourceIndex]!;
    output.y[outputIndex] = typedDensityY(valueMode, {
      averageY,
      count,
      maxY: maxY[sourceIndex]!,
      minY: minY[sourceIndex]!,
      sumY: sums[sourceIndex]!,
    });

    for (const metricKey of metricKeys) {
      outputMetrics[metricKey]![outputIndex] = metricArrays[metricKey]![sourceIndex]!;
    }
  }

  return {
    ...output,
    metrics: outputMetrics,
    summary: {
      binCount: visibleIndexes.length,
      metricKeys: [...metricKeys],
      pointCount: sumUint32(output.pointCount),
      sampleCount: visibleIndexes.length,
      valueMode,
      xDomain,
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

export function createTypedHistogram<TProperties>(
  points: readonly NormalizedSeriesPoint<TProperties>[],
  metricKeys: readonly string[],
  query: VizHistogramQuery,
): VizTypedHistogram {
  const bucketCount = clampCount(query.bucketCount);
  const xDomain = query.xDomain ? normalizeDomain(query.xDomain) : null;
  const valueAccessor = query.valueAccessor ?? "y";
  const start = xDomain ? lowerBoundX(points, xDomain[0]) : 0;
  const end = xDomain ? upperBoundX(points, xDomain[1]) : points.length;
  const valueDomain = normalizeDomain(
    query.valueDomain ?? deriveValueDomainFromRange(points, start, end, valueAccessor),
  );
  const width = binWidth(valueDomain, bucketCount);
  const counts = new Uint32Array(bucketCount);
  const sums = new Float64Array(bucketCount);
  const minValue = filledFloat64Array(bucketCount, Number.NaN);
  const maxValue = filledFloat64Array(bucketCount, Number.NaN);
  const firstPointIndex = filledInt32Array(bucketCount, -1);
  const lastPointIndex = filledInt32Array(bucketCount, -1);
  const metricArrays = createMetricArrays(metricKeys, bucketCount);

  for (let pointIndex = start; pointIndex < end; pointIndex++) {
    const point = points[pointIndex]!;
    const value = pointAccessorValue(point, valueAccessor);
    if (!Number.isFinite(value) || value < valueDomain[0] || value > valueDomain[1]) {
      continue;
    }
    const index = bucketIndex(value, valueDomain, bucketCount);
    const nextCount = counts[index]! + 1;
    counts[index] = nextCount;
    sums[index] += value;
    minValue[index] = Number.isNaN(minValue[index]!) ? value : Math.min(minValue[index]!, value);
    maxValue[index] = Number.isNaN(maxValue[index]!) ? value : Math.max(maxValue[index]!, value);
    if (firstPointIndex[index] === -1) {
      firstPointIndex[index] = point.sourceIndex;
    }
    lastPointIndex[index] = point.sourceIndex;
    addMetricArrays(metricArrays, metricKeys, point.metrics, index);
  }

  const visibleIndexes =
    query.includeEmptyBuckets === false
      ? indexesWhere(counts, (count) => count > 0)
      : Array.from({ length: bucketCount }, (_, index) => index);
  const output = createTypedHistogramArrays(visibleIndexes.length);
  const outputMetrics = createMetricArrays(metricKeys, visibleIndexes.length);

  for (const [outputIndex, sourceIndex] of visibleIndexes.entries()) {
    const count = counts[sourceIndex]!;
    const value0 = valueDomain[0] + sourceIndex * width;
    const value1 =
      sourceIndex + 1 === bucketCount ? valueDomain[1] : valueDomain[0] + (sourceIndex + 1) * width;
    output.value0[outputIndex] = value0;
    output.value1[outputIndex] = value1;
    output.value[outputIndex] = value0 + width / 2;
    output.averageValue[outputIndex] = count > 0 ? sums[sourceIndex]! / count : Number.NaN;
    output.firstPointIndex[outputIndex] = firstPointIndex[sourceIndex]!;
    output.lastPointIndex[outputIndex] = lastPointIndex[sourceIndex]!;
    output.maxValue[outputIndex] = maxValue[sourceIndex]!;
    output.minValue[outputIndex] = minValue[sourceIndex]!;
    output.pointCount[outputIndex] = count;
    output.sumValue[outputIndex] = sums[sourceIndex]!;

    for (const metricKey of metricKeys) {
      outputMetrics[metricKey]![outputIndex] = metricArrays[metricKey]![sourceIndex]!;
    }
  }

  return {
    ...output,
    metrics: outputMetrics,
    summary: {
      bucketCount: visibleIndexes.length,
      metricKeys: [...metricKeys],
      pointCount: sumUint32(output.pointCount),
      valueDomain,
      xDomain,
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
  const populatedCellIndexes: number[] = [];
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
    const previousCount = counts[cellIndex]!;
    if (previousCount === 0) {
      populatedCellIndexes.push(cellIndex);
    }
    const nextCount = previousCount + 1;
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
  const cellIndexes = query.includeEmptyCells === false ? populatedCellIndexes : null;
  const outputCellCount = cellIndexes?.length ?? cellCount;

  for (let outputIndex = 0; outputIndex < outputCellCount; outputIndex++) {
    const index = cellIndexes?.[outputIndex] ?? outputIndex;

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

export function createTypedHeatmap<TProperties>(
  points: readonly NormalizedSeriesPoint<TProperties>[],
  metricKeys: readonly string[],
  query: VizHeatmapQuery,
): VizTypedHeatmap {
  const xBinCount = clampCount(query.xBinCount);
  const yBinCount = clampCount(query.yBinCount);
  const xDomain = normalizeDomain(query.xDomain);
  const valueAccessor = query.valueAccessor ?? "y";
  const start = lowerBoundX(points, xDomain[0]);
  const end = upperBoundX(points, xDomain[1]);
  const yDomain = normalizeDomain(
    query.yDomain ?? deriveValueDomainFromRange(points, start, end, valueAccessor),
  );
  const cellCount = xBinCount * yBinCount;
  const counts = new Uint32Array(cellCount);
  const sums = new Float64Array(cellCount);
  const firstPointIndex = filledInt32Array(cellCount, -1);
  const lastPointIndex = filledInt32Array(cellCount, -1);
  const metricArrays = createMetricArrays(metricKeys, cellCount);
  let maxCellCount = 0;
  let pointCount = 0;

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
    if (firstPointIndex[cellIndex] === -1) {
      firstPointIndex[cellIndex] = point.sourceIndex;
    }
    lastPointIndex[cellIndex] = point.sourceIndex;
    maxCellCount = Math.max(maxCellCount, nextCount);
    pointCount += 1;
    addMetricArrays(metricArrays, metricKeys, point.metrics, cellIndex);
  }

  const output =
    query.includeEmptyCells === false
      ? createSparseTypedHeatmapOutput(
          counts,
          sums,
          firstPointIndex,
          lastPointIndex,
          metricArrays,
          metricKeys,
          xBinCount,
          maxCellCount,
        )
      : createFullTypedHeatmapOutput(
          counts,
          sums,
          firstPointIndex,
          lastPointIndex,
          metricArrays,
          metricKeys,
          xBinCount,
          maxCellCount,
        );

  return {
    ...output,
    summary: {
      maxCellCount,
      metricKeys: [...metricKeys],
      pointCount,
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

export function createTypedRollingSeries<TProperties>(
  points: readonly NormalizedSeriesPoint<TProperties>[],
  query: VizRollingSeriesQuery,
): VizTypedRollingSeries {
  const xDomain = normalizeDomain(query.xDomain);
  const windowSize = clampCount(query.windowSize);
  const minPeriods = Math.min(windowSize, Math.max(1, Math.floor(query.minPeriods ?? windowSize)));
  const statistic = query.statistic ?? "mean";
  const alpha = normalizeAlpha(query.alpha, windowSize);
  const start = lowerBoundX(points, xDomain[0]);
  const end = upperBoundX(points, xDomain[1]);
  const length = end - start;
  const output = createTypedRollingArrays(length);
  const minQueueIndexes = new Int32Array(length);
  const minQueueValues = new Float64Array(length);
  const maxQueueIndexes = new Int32Array(length);
  const maxQueueValues = new Float64Array(length);
  let minHead = 0;
  let minTail = 0;
  let maxHead = 0;
  let maxTail = 0;
  let sampleCount = 0;
  let sum = 0;
  let sumSquares = 0;
  let ema: number | null = null;

  for (let outputIndex = 0; outputIndex < length; outputIndex += 1) {
    const point = points[start + outputIndex]!;
    const value = point.y;
    ema = ema === null ? value : alpha * value + (1 - alpha) * ema;
    sum += value;
    sumSquares += value * value;

    while (minTail > minHead && minQueueValues[minTail - 1]! >= value) {
      minTail -= 1;
    }
    minQueueIndexes[minTail] = outputIndex;
    minQueueValues[minTail] = value;
    minTail += 1;

    while (maxTail > maxHead && maxQueueValues[maxTail - 1]! <= value) {
      maxTail -= 1;
    }
    maxQueueIndexes[maxTail] = outputIndex;
    maxQueueValues[maxTail] = value;
    maxTail += 1;

    if (outputIndex >= windowSize) {
      const expiredIndex = outputIndex - windowSize;
      const expired = points[start + expiredIndex]!.y;
      sum -= expired;
      sumSquares -= expired * expired;

      while (minHead < minTail && minQueueIndexes[minHead]! <= expiredIndex) {
        minHead += 1;
      }
      while (maxHead < maxTail && maxQueueIndexes[maxHead]! <= expiredIndex) {
        maxHead += 1;
      }
    }

    const pointCount = Math.min(outputIndex + 1, windowSize);
    const hasEnoughPoints = pointCount >= minPeriods;
    const mean = hasEnoughPoints ? sum / pointCount : null;
    const min = hasEnoughPoints ? minQueueValues[minHead]! : null;
    const max = hasEnoughPoints ? maxQueueValues[maxHead]! : null;
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

    if (y !== null) {
      sampleCount += 1;
    }

    output.ema[outputIndex] = rollingEma ?? Number.NaN;
    output.max[outputIndex] = max ?? Number.NaN;
    output.mean[outputIndex] = mean ?? Number.NaN;
    output.min[outputIndex] = min ?? Number.NaN;
    output.pointCount[outputIndex] = pointCount;
    output.sourcePointIndex[outputIndex] = point.sourceIndex;
    output.stdDev[outputIndex] = stdDev ?? Number.NaN;
    output.sum[outputIndex] = rollingSum ?? Number.NaN;
    output.x[outputIndex] = point.x;
    output.y[outputIndex] = y ?? Number.NaN;
    output.zScore[outputIndex] = zScore ?? Number.NaN;
  }

  return {
    ...output,
    summary: {
      alpha,
      minPeriods,
      pointCount: length,
      sampleCount,
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

function typedFromDensitySeries<TProperties>(
  series: ReturnType<typeof createChartSeries<TProperties>>,
  metricKeys: readonly string[],
): VizTypedDensitySeries {
  const output = createTypedDensityArrays(series.samples.length);
  const metrics = createMetricArrays(metricKeys, series.samples.length);

  for (const [index, sample] of series.samples.entries()) {
    output.averageY[index] = sample.averageY ?? Number.NaN;
    output.firstPointIndex[index] = sample.firstPointIndex ?? -1;
    output.lastPointIndex[index] = sample.lastPointIndex ?? -1;
    output.maxY[index] = sample.maxY ?? Number.NaN;
    output.minY[index] = sample.minY ?? Number.NaN;
    output.pointCount[index] = sample.pointCount;
    output.sumY[index] = sample.sumY;
    output.x0[index] = sample.x0;
    output.x1[index] = sample.x1;
    output.y[index] = sample.y ?? Number.NaN;
    for (const metricKey of metricKeys) {
      metrics[metricKey]![index] = sample.metrics[metricKey] ?? 0;
    }
  }

  return {
    ...output,
    metrics,
    summary: {
      binCount: series.summary.binCount,
      metricKeys: [...metricKeys],
      pointCount: series.summary.pointCount,
      sampleCount: series.summary.sampleCount,
      valueMode: series.summary.valueMode,
      xDomain: series.summary.xDomain,
    },
  };
}

function createTypedDensityArrays(length: number) {
  return {
    averageY: filledFloat64Array(length, Number.NaN),
    firstPointIndex: filledInt32Array(length, -1),
    lastPointIndex: filledInt32Array(length, -1),
    maxY: filledFloat64Array(length, Number.NaN),
    minY: filledFloat64Array(length, Number.NaN),
    pointCount: new Uint32Array(length),
    sumY: new Float64Array(length),
    x0: new Float64Array(length),
    x1: new Float64Array(length),
    y: filledFloat64Array(length, Number.NaN),
  };
}

function createTypedHistogramArrays(length: number) {
  return {
    averageValue: filledFloat64Array(length, Number.NaN),
    firstPointIndex: filledInt32Array(length, -1),
    lastPointIndex: filledInt32Array(length, -1),
    maxValue: filledFloat64Array(length, Number.NaN),
    minValue: filledFloat64Array(length, Number.NaN),
    pointCount: new Uint32Array(length),
    sumValue: new Float64Array(length),
    value: new Float64Array(length),
    value0: new Float64Array(length),
    value1: new Float64Array(length),
  };
}

function createTypedHeatmapArrays(length: number) {
  return {
    averageValue: filledFloat64Array(length, Number.NaN),
    firstPointIndex: filledInt32Array(length, -1),
    lastPointIndex: filledInt32Array(length, -1),
    pointCount: new Uint32Array(length),
    sumValue: new Float64Array(length),
    value: new Float64Array(length),
    xIndex: new Uint32Array(length),
    yIndex: new Uint32Array(length),
  };
}

function createFullTypedHeatmapOutput(
  counts: Uint32Array,
  sums: Float64Array,
  firstPointIndex: Int32Array,
  lastPointIndex: Int32Array,
  metricArrays: VizTypedMetricArrays,
  metricKeys: readonly string[],
  xBinCount: number,
  maxCellCount: number,
) {
  const length = counts.length;
  const output = createTypedHeatmapArrays(length);
  const outputMetrics = createMetricArrays(metricKeys, length);

  for (let sourceIndex = 0; sourceIndex < length; sourceIndex += 1) {
    writeTypedHeatmapCell(
      output,
      outputMetrics,
      sourceIndex,
      sourceIndex,
      counts,
      sums,
      firstPointIndex,
      lastPointIndex,
      metricArrays,
      metricKeys,
      xBinCount,
      maxCellCount,
    );
  }

  return { ...output, format: "dense" as const, metrics: outputMetrics };
}

function createSparseTypedHeatmapOutput(
  counts: Uint32Array,
  sums: Float64Array,
  firstPointIndex: Int32Array,
  lastPointIndex: Int32Array,
  metricArrays: VizTypedMetricArrays,
  metricKeys: readonly string[],
  xBinCount: number,
  maxCellCount: number,
) {
  let length = 0;
  for (let sourceIndex = 0; sourceIndex < counts.length; sourceIndex += 1) {
    if (counts[sourceIndex]! > 0) {
      length += 1;
    }
  }

  const output = createTypedHeatmapArrays(length);
  const outputMetrics = createMetricArrays(metricKeys, length);
  let outputIndex = 0;

  for (let sourceIndex = 0; sourceIndex < counts.length; sourceIndex += 1) {
    if (counts[sourceIndex]! === 0) {
      continue;
    }

    writeTypedHeatmapCell(
      output,
      outputMetrics,
      outputIndex,
      sourceIndex,
      counts,
      sums,
      firstPointIndex,
      lastPointIndex,
      metricArrays,
      metricKeys,
      xBinCount,
      maxCellCount,
    );
    outputIndex += 1;
  }

  return { ...output, format: "sparse" as const, metrics: outputMetrics };
}

function writeTypedHeatmapCell(
  output: ReturnType<typeof createTypedHeatmapArrays>,
  outputMetrics: VizTypedMetricArrays,
  outputIndex: number,
  sourceIndex: number,
  counts: Uint32Array,
  sums: Float64Array,
  firstPointIndex: Int32Array,
  lastPointIndex: Int32Array,
  metricArrays: VizTypedMetricArrays,
  metricKeys: readonly string[],
  xBinCount: number,
  maxCellCount: number,
) {
  const count = counts[sourceIndex]!;
  output.averageValue[outputIndex] = count > 0 ? sums[sourceIndex]! / count : Number.NaN;
  output.firstPointIndex[outputIndex] = firstPointIndex[sourceIndex]!;
  output.lastPointIndex[outputIndex] = lastPointIndex[sourceIndex]!;
  output.pointCount[outputIndex] = count;
  output.sumValue[outputIndex] = sums[sourceIndex]!;
  output.value[outputIndex] = maxCellCount > 0 ? count / maxCellCount : 0;
  output.xIndex[outputIndex] = sourceIndex % xBinCount;
  output.yIndex[outputIndex] = Math.floor(sourceIndex / xBinCount);

  for (let metricIndex = 0; metricIndex < metricKeys.length; metricIndex += 1) {
    const metricKey = metricKeys[metricIndex]!;
    outputMetrics[metricKey]![outputIndex] = metricArrays[metricKey]![sourceIndex]!;
  }
}

function createTypedRollingArrays(length: number) {
  return {
    ema: new Float64Array(length),
    max: new Float64Array(length),
    mean: new Float64Array(length),
    min: new Float64Array(length),
    pointCount: new Uint32Array(length),
    sourcePointIndex: new Int32Array(length),
    stdDev: new Float64Array(length),
    sum: new Float64Array(length),
    x: new Float64Array(length),
    y: new Float64Array(length),
    zScore: new Float64Array(length),
  };
}

function createMetricArrays(metricKeys: readonly string[], length: number): VizTypedMetricArrays {
  const arrays: VizTypedMetricArrays = {};
  for (const metricKey of metricKeys) {
    arrays[metricKey] = new Float64Array(length);
  }
  return arrays;
}

function addMetricArrays(
  arrays: VizTypedMetricArrays,
  metricKeys: readonly string[],
  metrics: VizMetricRecord | undefined,
  index: number,
) {
  for (const metricKey of metricKeys) {
    arrays[metricKey]![index] += metrics?.[metricKey] ?? 0;
  }
}

function typedDensityY(
  valueMode: VizValueMode,
  values: { averageY: number; count: number; maxY: number; minY: number; sumY: number },
) {
  if (values.count === 0) {
    return Number.NaN;
  }

  switch (valueMode) {
    case "average":
      return values.averageY;
    case "count":
      return values.count;
    case "max":
      return values.maxY;
    case "min":
      return values.minY;
    case "sum":
      return values.sumY;
    case "p10":
    case "p25":
    case "p50":
    case "p75":
    case "p90":
    case "p95":
    case "p99":
      return Number.NaN;
  }
}

function indexesWhere(array: Uint32Array, predicate: (value: number) => boolean) {
  const indexes: number[] = [];
  for (let index = 0; index < array.length; index++) {
    if (predicate(array[index]!)) {
      indexes.push(index);
    }
  }
  return indexes;
}

function sumUint32(values: Uint32Array) {
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum;
}

function filledFloat64Array(length: number, value: number) {
  const array = new Float64Array(length);
  array.fill(value);
  return array;
}

function filledInt32Array(length: number, value: number) {
  const array = new Int32Array(length);
  array.fill(value);
  return array;
}
