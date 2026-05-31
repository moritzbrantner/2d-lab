import { createSeededRandom } from "./random";

import type { VizSeriesPoint } from "../../src/types";

export type XyFixture = {
  domains: {
    full: [number, number];
    sparse: [number, number];
    viewport: [number, number];
  };
  points: VizSeriesPoint<{ group: string }>[];
};

const xyCache = new Map<string, XyFixture>();

export function createXyFixture(size: number, seed: number): XyFixture {
  const cacheKey = `${size}:${seed}`;
  const cached = xyCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const random = createSeededRandom(seed ^ size);
  const points: VizSeriesPoint<{ group: string }>[] = [];
  const maxX = Math.max(1, size - 1);

  for (let index = 0; index < size; index++) {
    const disorder = index % 101 === 0 ? random.between(-25, 25) : random.between(-0.05, 0.05);
    const x = Math.max(0, Math.min(maxX, index + disorder));
    const trend = (index / Math.max(1, size)) * 50;
    const seasonal = Math.sin(index / 37) * 16 + Math.cos(index / 211) * 8;
    const spike = index % 997 === 0 ? random.between(40, 140) : 0;
    const y = 100 + trend + seasonal + random.normal(0, 3) + spike;

    points.push({
      id: `xy-${index}`,
      metrics: {
        volume: random.int(1, 1000),
        weight: Math.max(0, 1 + random.normal(0, 0.3)),
      },
      properties: { group: `g${index % 8}` },
      x,
      y,
    });
  }

  const fixture = {
    domains: {
      full: [0, maxX] as [number, number],
      sparse: [maxX * 0.715, maxX * 0.735] as [number, number],
      viewport: [maxX * 0.45, maxX * 0.55] as [number, number],
    },
    points,
  };

  xyCache.set(cacheKey, fixture);
  return fixture;
}
