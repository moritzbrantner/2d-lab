import { createSeededRandom } from "./random";

import type { VizGeoBounds, VizGeoPoint } from "../../src/types";

export type GeoFixture = {
  points: VizGeoPoint<{ cluster: string }>[];
  viewports: {
    antimeridian: { bounds: VizGeoBounds; zoom: number };
    city: { bounds: VizGeoBounds; zoom: number };
    dense: { bounds: VizGeoBounds; zoom: number };
    world: { bounds: VizGeoBounds; zoom: number };
  };
};

const geoCache = new Map<string, GeoFixture>();

const centers = [
  { cluster: "berlin", latitude: 52.52, longitude: 13.405 },
  { cluster: "london", latitude: 51.5074, longitude: -0.1278 },
  { cluster: "new-york", latitude: 40.7128, longitude: -74.006 },
  { cluster: "tokyo", latitude: 35.6762, longitude: 139.6503 },
  { cluster: "sydney", latitude: -33.8688, longitude: 151.2093 },
];

export function createGeoFixture(size: number, seed: number): GeoFixture {
  const cacheKey = `${size}:${seed}`;
  const cached = geoCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const random = createSeededRandom(seed ^ (size * 17));
  const points: VizGeoPoint<{ cluster: string }>[] = [];

  for (let index = 0; index < size; index++) {
    const center = centers[index % centers.length]!;
    const outlier = index % 29 === 0;
    const antimeridian = index % 211 === 0;
    const longitude = antimeridian
      ? (index % 2 === 0 ? 179.25 : -179.25) + random.normal(0, 0.15)
      : outlier
        ? random.between(-180, 180)
        : center.longitude + random.normal(0, 0.12);
    const latitude = antimeridian
      ? random.between(-12, 12)
      : outlier
        ? random.between(-70, 70)
        : center.latitude + random.normal(0, 0.08);

    points.push({
      id: `geo-${index}`,
      latitude: Math.max(-89.9, Math.min(89.9, latitude)),
      longitude: normalizeLongitude(longitude),
      metrics: {
        demand: Math.max(0, 100 + random.normal(0, 30)),
        weight: Math.max(0, 1 + random.normal(0, 0.25)),
      },
      properties: { cluster: antimeridian ? "antimeridian" : outlier ? "outlier" : center.cluster },
    });
  }

  const fixture = {
    points,
    viewports: {
      antimeridian: { bounds: [170, -20, -170, 20] as VizGeoBounds, zoom: 5 },
      city: { bounds: [13.0, 52.25, 13.8, 52.75] as VizGeoBounds, zoom: 10 },
      dense: { bounds: [13.34, 52.48, 13.48, 52.57] as VizGeoBounds, zoom: 13 },
      world: { bounds: [-180, -85, 180, 85] as VizGeoBounds, zoom: 2 },
    },
  };

  geoCache.set(cacheKey, fixture);
  return fixture;
}

function normalizeLongitude(value: number) {
  if (value < -180) {
    return value + 360;
  }
  if (value > 180) {
    return value - 360;
  }
  return value;
}
