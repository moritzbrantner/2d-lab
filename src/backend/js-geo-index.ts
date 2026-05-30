import { normalizeMetrics } from "./density-utils";

import type {
  VizGeoAggregation,
  VizGeoAggregationOptions,
  VizGeoBounds,
  VizGeoHeatAggregation,
  VizGeoHeatOptions,
  VizGeoPoint,
  VizGeoPointIndex,
  VizGeoViewportQuery,
  VizIndexedGeoPoint,
  VizMetricRecord,
} from "../types";

type JsCluster<TProperties> = {
  id: number;
  leaves: Array<VizIndexedGeoPoint<TProperties>>;
};

export class JsVizGeoPointIndex<
  TProperties = Record<string, unknown>,
> implements VizGeoPointIndex<TProperties> {
  private readonly byId = new Map<string, VizIndexedGeoPoint<TProperties>>();
  private readonly clusters = new Map<number, JsCluster<TProperties>>();
  private nextClusterId = 1;
  private readonly points: Array<VizIndexedGeoPoint<TProperties>>;

  constructor(points: readonly VizGeoPoint<TProperties>[]) {
    this.points = normalizeGeoPoints(points);
    for (const point of this.points) {
      this.byId.set(point.id, point);
    }
  }

  getBackendCapabilities() {
    return {
      backend: "js" as const,
      implementation: "js" as const,
      usesWasm: false,
    };
  }

  getBounds(): VizGeoBounds | null {
    return getBoundsFromGeoPoints(this.points);
  }

  getClusterExpansionZoom(clusterId: number): number {
    return this.clusters.has(clusterId) ? 16 : 0;
  }

  getClusterLeaves(
    clusterId: number,
    limit = 10,
    offset = 0,
  ): Array<VizIndexedGeoPoint<TProperties>> {
    return this.clusters.get(clusterId)?.leaves.slice(offset, offset + limit) ?? [];
  }

  getPointById(pointId: string): VizIndexedGeoPoint<TProperties> | null {
    return this.byId.get(pointId) ?? null;
  }

  getHeatFeatures(
    query: VizGeoViewportQuery,
    options: VizGeoHeatOptions = {},
  ): VizGeoHeatAggregation<TProperties> {
    const visiblePoints = this.points.filter((point) => pointInBounds(point, query.bounds));
    const weighted = visiblePoints
      .map((point) => ({
        point,
        rawWeight: getGeoWeight(point.metrics, options.weightMetric),
      }))
      .filter((entry) => entry.rawWeight > 0);
    let maxWeight = 1;

    for (const entry of weighted) {
      maxWeight = Math.max(maxWeight, entry.rawWeight);
    }

    const features = weighted.map(({ point, rawWeight }) => ({
      coordinates: [point.longitude, point.latitude] as [number, number],
      id: point.id,
      label: point.label,
      metrics: point.metrics,
      point,
      pointCount: 1,
      rawWeight,
      value: rawWeight / maxWeight,
    }));

    return {
      features,
      summary: {
        bounds: query.bounds,
        maxWeight,
        metrics: sumMetrics(features.map((feature) => feature.metrics)),
        visiblePointCount: features.length,
        zoom: query.zoom,
      },
    };
  }

  getViewportAggregation(
    query: VizGeoViewportQuery,
    options: VizGeoAggregationOptions = {},
  ): VizGeoAggregation<TProperties> {
    const visiblePoints = this.points.filter((point) => pointInBounds(point, query.bounds));
    const features = createJsAggregationFeatures(
      visiblePoints,
      query,
      options,
      this.clusters,
      () => this.nextClusterId++,
    );

    return {
      features,
      summary: summarizeGeoFeatures(query, features),
    };
  }

  nearestPoint(query: {
    latitude: number;
    longitude: number;
    maxDistance?: number;
  }): VizIndexedGeoPoint<TProperties> | null {
    let nearest: VizIndexedGeoPoint<TProperties> | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const point of this.points) {
      const distance = Math.hypot(
        point.longitude - query.longitude,
        point.latitude - query.latitude,
      );
      if (distance < nearestDistance) {
        nearest = point;
        nearestDistance = distance;
      }
    }

    if (query.maxDistance != null && nearestDistance > query.maxDistance) {
      return null;
    }

    return nearest;
  }
}

export function normalizeGeoPoints<TProperties>(
  points: readonly VizGeoPoint<TProperties>[],
): Array<VizIndexedGeoPoint<TProperties>> {
  return points
    .map(
      (point, sourceIndex): VizIndexedGeoPoint<TProperties> => ({
        id: String(point.id ?? sourceIndex),
        label: point.label ?? "",
        latitude: point.latitude,
        longitude: point.longitude,
        metrics: normalizeMetrics(point.metrics),
        properties: point.properties ?? ({} as TProperties),
        sourceIndex,
      }),
    )
    .filter(
      (point) =>
        Number.isFinite(point.longitude) &&
        Number.isFinite(point.latitude) &&
        point.longitude >= -180 &&
        point.longitude <= 180 &&
        point.latitude >= -90 &&
        point.latitude <= 90,
    );
}

export function getBoundsFromGeoPoints<TProperties>(
  points: readonly Pick<VizIndexedGeoPoint<TProperties>, "latitude" | "longitude">[],
): VizGeoBounds | null {
  const first = points[0];

  if (!first) {
    return null;
  }

  let west = first.longitude;
  let south = first.latitude;
  let east = first.longitude;
  let north = first.latitude;

  for (const point of points) {
    west = Math.min(west, point.longitude);
    south = Math.min(south, point.latitude);
    east = Math.max(east, point.longitude);
    north = Math.max(north, point.latitude);
  }

  return [west, south, east, north];
}

function createJsAggregationFeatures<TProperties>(
  points: Array<VizIndexedGeoPoint<TProperties>>,
  query: VizGeoViewportQuery,
  options: VizGeoAggregationOptions,
  clusters: Map<number, JsCluster<TProperties>>,
  nextClusterId: () => number,
): VizGeoAggregation<TProperties>["features"] {
  const radius = Math.max(1, options.radius ?? 72);
  const cellSize = Math.max(0.01, radius / Math.max(1, query.zoom + 1));
  const cells = new Map<string, Array<VizIndexedGeoPoint<TProperties>>>();

  clusters.clear();

  for (const point of points) {
    const key = `${Math.floor(point.longitude / cellSize)}:${Math.floor(point.latitude / cellSize)}`;
    const cell = cells.get(key) ?? [];
    cell.push(point);
    cells.set(key, cell);
  }

  return [...cells.values()].flatMap((cell): VizGeoAggregation<TProperties>["features"] => {
    if (cell.length === 1) {
      const point = cell[0]!;
      return [
        {
          coordinates: [point.longitude, point.latitude],
          kind: "point" as const,
          metrics: point.metrics,
          point,
        },
      ];
    }

    const clusterId = nextClusterId();
    clusters.set(clusterId, { id: clusterId, leaves: cell });
    const pointCount = cell.length;

    return [
      {
        clusterId,
        coordinates: [
          cell.reduce((sum, point) => sum + point.longitude, 0) / pointCount,
          cell.reduce((sum, point) => sum + point.latitude, 0) / pointCount,
        ] as [number, number],
        expansionZoom: Math.min(16, Math.ceil(query.zoom + 1)),
        kind: "cluster" as const,
        metrics: sumMetrics(cell.map((point) => point.metrics)),
        pointCount,
        pointCountAbbreviated: abbreviateCount(pointCount),
      },
    ];
  });
}

function summarizeGeoFeatures<TProperties>(
  query: VizGeoViewportQuery,
  features: VizGeoAggregation<TProperties>["features"],
): VizGeoAggregation<TProperties>["summary"] {
  let visibleClusterCount = 0;
  let visiblePointCount = 0;
  let visibleUnclusteredCount = 0;

  for (const feature of features) {
    if (feature.kind === "cluster") {
      visibleClusterCount += 1;
      visiblePointCount += feature.pointCount;
    } else {
      visibleUnclusteredCount += 1;
      visiblePointCount += 1;
    }
  }

  return {
    bounds: query.bounds,
    metrics: sumMetrics(features.map((feature) => feature.metrics)),
    visibleClusterCount,
    visiblePointCount,
    visibleUnclusteredCount,
    zoom: query.zoom,
  };
}

function pointInBounds<TProperties>(point: VizIndexedGeoPoint<TProperties>, bounds: VizGeoBounds) {
  const [west, south, east, north] = bounds;
  const longitudeVisible =
    west <= east
      ? point.longitude >= west && point.longitude <= east
      : point.longitude >= west || point.longitude <= east;

  return longitudeVisible && point.latitude >= south && point.latitude <= north;
}

function sumMetrics(records: readonly VizMetricRecord[]): VizMetricRecord {
  const result: VizMetricRecord = {};

  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      result[key] = (result[key] ?? 0) + value;
    }
  }

  return result;
}

export function getGeoWeight(metrics: VizMetricRecord, weightMetric: string | undefined) {
  const weight = weightMetric ? (metrics[weightMetric] ?? 0) : (metrics.weight ?? 1);
  return Number.isFinite(weight) ? Math.max(0, weight) : 0;
}

function abbreviateCount(count: number) {
  if (count >= 1_000) {
    return `${Number((count / 1_000).toFixed(1))}k`;
  }

  return count.toString();
}
