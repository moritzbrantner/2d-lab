import type { BenchmarkCase, BenchmarkConfig } from "../types";

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertFiniteNumber(value: number, label: string) {
  assert(Number.isFinite(value), `${label} must be finite`);
}

export function assertPositive(value: number, label: string) {
  assert(value > 0, `${label} must be greater than zero`);
}

export function assertClose(left: number, right: number, label: string, tolerance = 1e-6) {
  assert(
    Math.abs(left - right) <= tolerance,
    `${label} differs: ${left.toPrecision(8)} vs ${right.toPrecision(8)}`,
  );
}

export function createCaseId(parts: Array<number | string>) {
  return parts.join("/");
}

export function includeHeavyCases(config: BenchmarkConfig) {
  return config.mode === "full";
}

export function sumPointCounts(values: Array<{ pointCount: number }>) {
  return values.reduce((total, value) => total + value.pointCount, 0);
}

export function createDirectGeoHeatFeatures(
  points: readonly { latitude: number; longitude: number; metrics?: Record<string, number> }[],
  query: { bounds: [number, number, number, number]; zoom: number },
  weightMetric = "demand",
) {
  const features = points
    .filter((point) => pointInBounds([point.longitude, point.latitude], query.bounds))
    .map((point, index) => ({
      id: String(index),
      rawWeight: Math.max(0, point.metrics?.[weightMetric] ?? point.metrics?.weight ?? 1),
    }))
    .filter((feature) => feature.rawWeight > 0);
  const maxWeight = Math.max(1, ...features.map((feature) => feature.rawWeight));

  return {
    features: features.map((feature) => ({
      ...feature,
      value: feature.rawWeight / maxWeight,
    })),
    summary: {
      maxWeight,
      visiblePointCount: features.length,
      zoom: query.zoom,
    },
  };
}

export function pointInBounds(
  position: [longitude: number, latitude: number],
  bounds: [west: number, south: number, east: number, north: number],
) {
  const [longitude, latitude] = position;
  const [west, south, east, north] = bounds;
  const longitudeVisible =
    west <= east ? longitude >= west && longitude <= east : longitude >= west || longitude <= east;

  return longitudeVisible && latitude >= south && latitude <= north;
}

export function aggregateOhlcvForBenchmark<TProperties>(
  bars: readonly {
    adjustedClose?: number;
    close: number;
    high: number;
    low: number;
    open: number;
    properties?: TProperties;
    timestamp: number;
    volume?: number;
  }[],
  targetBarCount: number,
) {
  if (bars.length <= targetBarCount) {
    return bars.slice();
  }

  const output = [];
  for (let bucketIndex = 0; bucketIndex < targetBarCount; bucketIndex++) {
    const start = Math.floor((bucketIndex * bars.length) / targetBarCount);
    const end = Math.max(start + 1, Math.floor(((bucketIndex + 1) * bars.length) / targetBarCount));
    const bucket = bars.slice(start, end);
    const first = bucket[0]!;
    const last = bucket[bucket.length - 1]!;

    output.push({
      adjustedClose: last.adjustedClose,
      close: last.close,
      high: Math.max(...bucket.map((bar) => bar.high)),
      low: Math.min(...bucket.map((bar) => bar.low)),
      open: first.open,
      properties: last.properties,
      timestamp: first.timestamp,
      volume: bucket.reduce((total, bar) => total + (bar.volume ?? 0), 0),
    });
  }

  return output;
}

export function simpleReturnSeries(
  bars: readonly { close: number; timestamp: number }[],
  query: { method: "log" | "simple"; targetPointCount?: number; xDomain: [number, number] },
) {
  const selected = bars.filter(
    (bar) => bar.timestamp >= query.xDomain[0] && bar.timestamp <= query.xDomain[1],
  );
  const points = [];

  for (let index = 1; index < selected.length; index++) {
    const previous = selected[index - 1]!.close;
    const current = selected[index]!.close;
    points.push({
      pointCount: 1,
      x: selected[index]!.timestamp,
      y: query.method === "log" ? Math.log(current / previous) : current / previous - 1,
    });
  }

  if (!query.targetPointCount || points.length <= query.targetPointCount) {
    return { points };
  }

  return { points: aggregateReturns(points, query.targetPointCount) };
}

export function limitCasesForBrowser(cases: BenchmarkCase[], config: BenchmarkConfig) {
  if (config.runtime !== "browser" || config.mode !== "quick") {
    return cases;
  }

  return cases.filter((benchmarkCase) => {
    if (benchmarkCase.category === "startup") {
      return true;
    }
    return benchmarkCase.sizeValue == null || benchmarkCase.sizeValue <= 10_000;
  });
}

function aggregateReturns(
  points: Array<{ pointCount: number; x: number; y: number }>,
  target: number,
) {
  const output = [];
  for (let bucketIndex = 0; bucketIndex < target; bucketIndex++) {
    const start = Math.floor((bucketIndex * points.length) / target);
    const end = Math.max(start + 1, Math.floor(((bucketIndex + 1) * points.length) / target));
    const bucket = points.slice(start, end);
    output.push({
      pointCount: bucket.length,
      x: bucket[0]?.x ?? 0,
      y: bucket.reduce((total, point) => total + point.y, 0) / Math.max(1, bucket.length),
    });
  }
  return output;
}
