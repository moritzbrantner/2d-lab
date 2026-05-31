import { mean, sampleStandardDeviation } from "simple-statistics";

import type { VizRollingStatistic, VizSeriesPoint } from "../../src/types";

export type SimpleStatisticsRollingPoint = {
  index: number;
  pointCount: number;
  x: number;
  y: number | null;
};

export function getSimpleStatisticsRollingSeries(
  points: readonly VizSeriesPoint[],
  query: {
    minPeriods?: number;
    statistic: Extract<VizRollingStatistic, "mean" | "stdDev" | "zScore">;
    windowSize: number;
    xDomain: [number, number];
  },
) {
  const selected = points
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((left, right) => left.x - right.x)
    .filter((point) => point.x >= query.xDomain[0] && point.x <= query.xDomain[1]);
  const minPeriods = query.minPeriods ?? query.windowSize;
  const rolling: SimpleStatisticsRollingPoint[] = [];

  for (let index = 0; index < selected.length; index++) {
    const start = Math.max(0, index - query.windowSize + 1);
    const window = selected.slice(start, index + 1).map((point) => point.y);
    let y: number | null = null;

    if (window.length >= minPeriods) {
      const windowMean = mean(window);
      if (query.statistic === "mean") {
        y = windowMean;
      } else if (query.statistic === "stdDev") {
        y = window.length > 1 ? sampleStandardDeviation(window) : 0;
      } else {
        const stdDev = window.length > 1 ? sampleStandardDeviation(window) : 0;
        y = stdDev > Number.EPSILON ? (selected[index]!.y - windowMean) / stdDev : null;
      }
    }

    rolling.push({
      index,
      pointCount: Math.min(index + 1, query.windowSize),
      x: selected[index]!.x,
      y,
    });
  }

  return {
    points: rolling,
    summary: {
      pointCount: selected.length,
      sampleCount: rolling.length,
      statistic: query.statistic,
      windowSize: query.windowSize,
    },
  };
}
