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
  VizSeriesBounds,
  VizSeriesPoint,
  VizValueMode,
} from "../types";

export type NormalizedSeriesPoint<TProperties> = VizIndexedSeriesPoint<TProperties>;

export function normalizeSeriesPoints<TProperties>(
  points: readonly VizSeriesPoint<TProperties>[],
): Array<NormalizedSeriesPoint<TProperties>> {
  return points
    .map((point, sourceIndex) => ({ ...point, sourceIndex }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => ({
      ...point,
      metrics: normalizeMetrics(point.metrics),
    }))
    .sort((left, right) => left.x - right.x || left.sourceIndex - right.sourceIndex);
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
  if (!points.length) {
    return null;
  }

  return {
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
  };
}

export function createBins<TProperties>(
  points: readonly NormalizedSeriesPoint<TProperties>[],
  metricKeys: readonly string[],
  query: VizBinnedSeriesQuery,
): Array<VizDensityBin<TProperties>> {
  const xDomain = normalizeDomain(query.xDomain);
  const binCount = clampCount(query.targetBinCount);
  const width = binWidth(xDomain, binCount);
  const bins = Array.from({ length: binCount }, (_, index) =>
    createEmptyBin<TProperties>(index, binCount, xDomain, width, metricKeys),
  );

  for (const point of pointsInXDomain(points, xDomain)) {
    const index = bucketIndex(point.x, xDomain, binCount);
    updateBin(bins[index], point, metricKeys);
  }

  return query.includeEmptyBins ? bins : bins.filter((bin) => bin.pointCount > 0);
}

export function createChartSeries<TProperties>(
  points: readonly NormalizedSeriesPoint<TProperties>[],
  metricKeys: readonly string[],
  query: VizDensityQuery,
) {
  const valueMode = query.valueMode ?? "average";
  const bins = createBins(points, metricKeys, {
    includeEmptyBins: query.includeEmptyBins,
    targetBinCount: query.targetBinCount,
    xDomain: query.xDomain,
  });
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
  const values = selectedPoints.map((point) => point.y).filter(Number.isFinite);
  const valueDomain = normalizeDomain(query.valueDomain ?? deriveDomain(values));
  const width = binWidth(valueDomain, bucketCount);
  const buckets = Array.from({ length: bucketCount }, (_, index) =>
    createEmptyHistogramBucket<TProperties>(index, bucketCount, valueDomain, width, metricKeys),
  );

  for (const point of selectedPoints) {
    if (point.y < valueDomain[0] || point.y > valueDomain[1]) {
      continue;
    }

    updateHistogramBucket(
      buckets[bucketIndex(point.y, valueDomain, bucketCount)],
      point,
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
  const selectedPoints = pointsInXDomain(points, xDomain);
  const yDomain = normalizeDomain(
    query.yDomain ?? deriveDomain(selectedPoints.map((point) => point.y)),
  );
  const xWidth = binWidth(xDomain, xBinCount);
  const yWidth = binWidth(yDomain, yBinCount);
  const cells = Array.from({ length: xBinCount * yBinCount }, (_, index) =>
    createEmptyHeatmapCell<TProperties>(
      index,
      xBinCount,
      yBinCount,
      xDomain,
      yDomain,
      xWidth,
      yWidth,
      metricKeys,
    ),
  );

  for (const point of selectedPoints) {
    if (point.y < yDomain[0] || point.y > yDomain[1]) {
      continue;
    }

    const xIndex = bucketIndex(point.x, xDomain, xBinCount);
    const yIndex = bucketIndex(point.y, yDomain, yBinCount);
    updateHeatmapCell(cells[yIndex * xBinCount + xIndex], point, metricKeys);
  }

  const maxCellCount = Math.max(0, ...cells.map((cell) => cell.pointCount));

  for (const cell of cells) {
    cell.value = maxCellCount > 0 ? cell.pointCount / maxCellCount : 0;
  }

  const visibleCells =
    query.includeEmptyCells === false ? cells.filter((cell) => cell.pointCount > 0) : cells;

  return {
    cells: visibleCells,
    summary: {
      maxCellCount,
      metrics: sumMetricRecords(visibleCells.map((cell) => cell.metrics)),
      pointCount: visibleCells.reduce((sum, cell) => sum + cell.pointCount, 0),
      xBinCount,
      xDomain,
      yBinCount,
      yDomain,
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
): VizDensityBin<TProperties> {
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
    x1: index + 1 === binCount ? xDomain[1] : x0 + width,
  };
}

function updateBin<TProperties>(
  bin: VizDensityBin<TProperties>,
  point: NormalizedSeriesPoint<TProperties>,
  metricKeys: readonly string[],
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
      return bin.pointCount;
    case "max":
      return bin.maxY;
    case "min":
      return bin.minY;
    case "sum":
      return bin.pointCount > 0 ? bin.sumY : null;
  }
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
  metricKeys: readonly string[],
) {
  bucket.firstPoint ??= point;
  bucket.firstPointIndex ??= point.sourceIndex;
  bucket.lastPoint = point;
  bucket.lastPointIndex = point.sourceIndex;
  bucket.pointCount += 1;
  bucket.sumValue += point.y;
  bucket.averageValue = bucket.sumValue / bucket.pointCount;
  bucket.minValue = bucket.minValue === null ? point.y : Math.min(bucket.minValue, point.y);
  bucket.maxValue = bucket.maxValue === null ? point.y : Math.max(bucket.maxValue, point.y);
  addMetrics(bucket.metrics, point.metrics, metricKeys);
}

function createEmptyHeatmapCell<TProperties>(
  index: number,
  xBinCount: number,
  yBinCount: number,
  xDomain: [number, number],
  yDomain: [number, number],
  xWidth: number,
  yWidth: number,
  metricKeys: readonly string[],
): VizHeatmapCell<TProperties> {
  const xIndex = index % xBinCount;
  const yIndex = Math.floor(index / xBinCount);
  const x0 = xDomain[0] + xIndex * xWidth;
  const y0 = yDomain[0] + yIndex * yWidth;

  return {
    averageValue: null,
    firstPoint: null,
    firstPointIndex: null,
    index,
    lastPoint: null,
    lastPointIndex: null,
    metrics: zeroMetrics(metricKeys),
    pointCount: 0,
    sumValue: 0,
    value: 0,
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

function updateHeatmapCell<TProperties>(
  cell: VizHeatmapCell<TProperties>,
  point: NormalizedSeriesPoint<TProperties>,
  metricKeys: readonly string[],
) {
  cell.firstPoint ??= point;
  cell.firstPointIndex ??= point.sourceIndex;
  cell.lastPoint = point;
  cell.lastPointIndex = point.sourceIndex;
  cell.pointCount += 1;
  cell.sumValue += point.y;
  cell.averageValue = cell.sumValue / cell.pointCount;
  addMetrics(cell.metrics, point.metrics, metricKeys);
}

function pointsInXDomain<TProperties>(
  points: readonly NormalizedSeriesPoint<TProperties>[],
  xDomain: [number, number],
) {
  return points.filter((point) => point.x >= xDomain[0] && point.x <= xDomain[1]);
}

function deriveDomain(values: readonly number[]): [number, number] {
  const finite = values.filter(Number.isFinite);

  if (!finite.length) {
    return [0, 0];
  }

  return [Math.min(...finite), Math.max(...finite)];
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
