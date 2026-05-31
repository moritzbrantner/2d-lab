import { bin, sum } from "d3-array";

import type { VizSeriesPoint } from "../../src/types";

export type D3BinnedSummary = {
  bins: Array<{
    averageY: number | null;
    maxY: number | null;
    minY: number | null;
    pointCount: number;
    sumY: number;
    x0: number;
    x1: number;
  }>;
  pointCount: number;
};

export type D3HeatmapSummary = {
  cells: Array<{ pointCount: number; value: number; xIndex: number; yIndex: number }>;
  maxCellCount: number;
  pointCount: number;
};

export function getD3BinnedSeries(
  points: readonly VizSeriesPoint[],
  query: { includeEmptyBins?: boolean; targetBinCount: number; xDomain: [number, number] },
): D3BinnedSummary {
  const selected = points.filter(
    (point) => point.x >= query.xDomain[0] && point.x <= query.xDomain[1],
  );
  const thresholds = createThresholds(query.xDomain, query.targetBinCount);
  const bins = bin<VizSeriesPoint, number>()
    .value((point) => point.x)
    .domain(query.xDomain)
    .thresholds(thresholds)(selected)
    .map((bucket) => {
      const sumY = sum(bucket, (point) => point.y);
      const minY = bucket.length ? Math.min(...bucket.map((point) => point.y)) : null;
      const maxY = bucket.length ? Math.max(...bucket.map((point) => point.y)) : null;

      return {
        averageY: bucket.length ? sumY / bucket.length : null,
        maxY,
        minY,
        pointCount: bucket.length,
        sumY,
        x0: bucket.x0 ?? query.xDomain[0],
        x1: bucket.x1 ?? query.xDomain[1],
      };
    });
  const visibleBins = query.includeEmptyBins
    ? bins
    : bins.filter((bucket) => bucket.pointCount > 0);

  return {
    bins: visibleBins,
    pointCount: visibleBins.reduce((total, bucket) => total + bucket.pointCount, 0),
  };
}

export function getD3Histogram(
  points: readonly VizSeriesPoint[],
  query: {
    bucketCount: number;
    includeEmptyBuckets?: boolean;
    valueDomain?: [number, number];
    xDomain?: [number, number];
  },
): D3BinnedSummary {
  const selected = query.xDomain
    ? points.filter((point) => point.x >= query.xDomain![0] && point.x <= query.xDomain![1])
    : [...points];
  const valueDomain = query.valueDomain ?? deriveYDomain(selected);
  const thresholds = createThresholds(valueDomain, query.bucketCount);
  const buckets = bin<VizSeriesPoint, number>()
    .value((point) => point.y)
    .domain(valueDomain)
    .thresholds(thresholds)(selected)
    .map((bucket) => {
      const sumY = sum(bucket, (point) => point.y);
      const minY = bucket.length ? Math.min(...bucket.map((point) => point.y)) : null;
      const maxY = bucket.length ? Math.max(...bucket.map((point) => point.y)) : null;

      return {
        averageY: bucket.length ? sumY / bucket.length : null,
        maxY,
        minY,
        pointCount: bucket.length,
        sumY,
        x0: bucket.x0 ?? valueDomain[0],
        x1: bucket.x1 ?? valueDomain[1],
      };
    });
  const visibleBuckets =
    query.includeEmptyBuckets === false
      ? buckets.filter((bucket) => bucket.pointCount > 0)
      : buckets;

  return {
    bins: visibleBuckets,
    pointCount: visibleBuckets.reduce((total, bucket) => total + bucket.pointCount, 0),
  };
}

export function getD3Heatmap(
  points: readonly VizSeriesPoint[],
  query: {
    includeEmptyCells?: boolean;
    xBinCount: number;
    xDomain: [number, number];
    yBinCount: number;
    yDomain?: [number, number];
  },
): D3HeatmapSummary {
  const selected = points.filter(
    (point) => point.x >= query.xDomain[0] && point.x <= query.xDomain[1],
  );
  const yDomain = query.yDomain ?? deriveYDomain(selected);
  const cells = Array.from({ length: query.xBinCount * query.yBinCount }, (_, index) => ({
    pointCount: 0,
    value: 0,
    xIndex: index % query.xBinCount,
    yIndex: Math.floor(index / query.xBinCount),
  }));

  for (const point of selected) {
    if (point.y < yDomain[0] || point.y > yDomain[1]) {
      continue;
    }
    const xIndex = bucketIndex(point.x, query.xDomain, query.xBinCount);
    const yIndex = bucketIndex(point.y, yDomain, query.yBinCount);
    cells[yIndex * query.xBinCount + xIndex]!.pointCount += 1;
  }

  const maxCellCount = Math.max(0, ...cells.map((cell) => cell.pointCount));
  for (const cell of cells) {
    cell.value = maxCellCount > 0 ? cell.pointCount / maxCellCount : 0;
  }

  const visibleCells =
    query.includeEmptyCells === false ? cells.filter((cell) => cell.pointCount > 0) : cells;

  return {
    cells: visibleCells,
    maxCellCount,
    pointCount: visibleCells.reduce((total, cell) => total + cell.pointCount, 0),
  };
}

function createThresholds(domain: [number, number], count: number) {
  const width = (domain[1] - domain[0]) / Math.max(1, count);
  return Array.from(
    { length: Math.max(0, count - 1) },
    (_, index) => domain[0] + width * (index + 1),
  );
}

function deriveYDomain(points: readonly VizSeriesPoint[]): [number, number] {
  const first = points[0];
  if (!first) {
    return [0, 1];
  }
  let min = first.y;
  let max = first.y;
  for (const point of points) {
    min = Math.min(min, point.y);
    max = Math.max(max, point.y);
  }
  return min === max ? [min, min + 1] : [min, max];
}

function bucketIndex(value: number, domain: [number, number], count: number) {
  if (value <= domain[0]) {
    return 0;
  }
  if (value >= domain[1]) {
    return count - 1;
  }
  return Math.max(
    0,
    Math.min(count - 1, Math.floor(((value - domain[0]) / (domain[1] - domain[0])) * count)),
  );
}
