import Supercluster from "supercluster";

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

type GeoPointFeatureProperties = {
  id: string;
  label: string;
  sourceIndex: number;
  [key: string]: number | string;
};

type GeoClusterProperties = {
  [key: string]: number;
};

type GeoPointFeature = Supercluster.PointFeature<GeoPointFeatureProperties>;
type GeoClusterFeature = Supercluster.ClusterFeature<GeoClusterProperties>;
type GeoSupercluster = Supercluster<GeoPointFeatureProperties, GeoClusterProperties>;

type ClusterOptions = Required<
  Pick<VizGeoAggregationOptions, "extent" | "maxZoom" | "minZoom" | "radius">
>;

type ClusterCacheEntry = {
  index: GeoSupercluster;
  key: string;
};

export class JsVizGeoPointIndex<
  TProperties = Record<string, unknown>,
> implements VizGeoPointIndex<TProperties> {
  private readonly byId = new Map<string, VizIndexedGeoPoint<TProperties>>();
  private readonly clusterIndexes = new Map<string, ClusterCacheEntry>();
  private readonly clusterFeatures: GeoPointFeature[];
  private readonly metricKeys: string[];
  private latestClusterIndexKey: string | null = null;
  private readonly points: Array<VizIndexedGeoPoint<TProperties>>;

  constructor(points: readonly VizGeoPoint<TProperties>[]) {
    this.points = normalizeGeoPoints(points);
    this.metricKeys = collectGeoMetricKeys(this.points);
    this.clusterFeatures = this.points.map((point) => createGeoPointFeature(point));
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
    const index = this.latestClusterIndex();
    if (!index) {
      return 0;
    }

    try {
      return index.getClusterExpansionZoom(clusterId);
    } catch {
      return 0;
    }
  }

  getClusterLeaves(
    clusterId: number,
    limit = 10,
    offset = 0,
  ): Array<VizIndexedGeoPoint<TProperties>> {
    const index = this.latestClusterIndex();
    if (!index) {
      return [];
    }

    try {
      return index
        .getLeaves(clusterId, limit, offset)
        .map((feature) => this.points[feature.properties.sourceIndex])
        .filter((point): point is VizIndexedGeoPoint<TProperties> => point != null);
    } catch {
      return [];
    }
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
    const cacheEntry = this.getClusterIndex(options);
    this.latestClusterIndexKey = cacheEntry.key;
    const features = getClusterFeatures(cacheEntry.index, query.bounds, query.zoom).map((feature) =>
      this.mapClusterFeature(feature),
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

  private getClusterIndex(options: VizGeoAggregationOptions): ClusterCacheEntry {
    const clusterOptions = normalizeClusterOptions(options);
    const key = clusterOptionsKey(clusterOptions);
    const existing = this.clusterIndexes.get(key);
    if (existing) {
      return existing;
    }

    const metricKeys = this.metricKeys;
    const index = new Supercluster<GeoPointFeatureProperties, GeoClusterProperties>({
      extent: clusterOptions.extent,
      map: (properties) => {
        const metrics: VizMetricRecord = {};
        for (const metricKey of metricKeys) {
          const value = properties[metricKey];
          metrics[metricKey] = typeof value === "number" ? value : 0;
        }
        return metrics;
      },
      maxZoom: clusterOptions.maxZoom,
      minZoom: clusterOptions.minZoom,
      radius: clusterOptions.radius,
      reduce: (accumulated, properties) => {
        for (const metricKey of metricKeys) {
          accumulated[metricKey] = (accumulated[metricKey] ?? 0) + (properties[metricKey] ?? 0);
        }
      },
    }).load(this.clusterFeatures);
    const entry = { index, key };
    this.clusterIndexes.set(key, entry);

    return entry;
  }

  private latestClusterIndex() {
    return this.latestClusterIndexKey
      ? (this.clusterIndexes.get(this.latestClusterIndexKey)?.index ?? null)
      : null;
  }

  private mapClusterFeature(
    feature: GeoClusterFeature | GeoPointFeature,
  ): VizGeoAggregation<TProperties>["features"][number] {
    const [longitude, latitude] = feature.geometry.coordinates as [number, number];
    const properties = feature.properties as GeoPointFeatureProperties &
      GeoClusterProperties & {
        cluster?: boolean;
        cluster_id?: number;
        point_count?: number;
        point_count_abbreviated?: string | number;
      };

    if (properties.cluster) {
      const clusterId = properties.cluster_id ?? 0;

      return {
        clusterId,
        coordinates: [longitude, latitude],
        expansionZoom: this.getClusterExpansionZoom(clusterId),
        kind: "cluster",
        metrics: pickMetrics(properties, this.metricKeys),
        pointCount: properties.point_count ?? 0,
        pointCountAbbreviated: String(
          properties.point_count_abbreviated ?? properties.point_count ?? 0,
        ),
      };
    }

    const point = this.points[properties.sourceIndex];

    if (!point) {
      throw new Error(`Missing geo point for source index ${properties.sourceIndex}.`);
    }

    return {
      coordinates: [point.longitude, point.latitude],
      kind: "point",
      metrics: point.metrics,
      point,
    };
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

function createGeoPointFeature<TProperties>(
  point: VizIndexedGeoPoint<TProperties>,
): GeoPointFeature {
  return {
    geometry: {
      coordinates: [point.longitude, point.latitude],
      type: "Point",
    },
    properties: {
      ...point.metrics,
      id: point.id,
      label: point.label,
      sourceIndex: point.sourceIndex,
    },
    type: "Feature",
  };
}

function collectGeoMetricKeys<TProperties>(points: readonly VizIndexedGeoPoint<TProperties>[]) {
  const keys = new Set<string>();

  for (const point of points) {
    for (const key of Object.keys(point.metrics)) {
      keys.add(key);
    }
  }

  return [...keys].sort();
}

function normalizeClusterOptions(options: VizGeoAggregationOptions): ClusterOptions {
  return {
    extent: Math.max(1, Math.floor(options.extent ?? 512)),
    maxZoom: Math.max(0, Math.floor(options.maxZoom ?? 16)),
    minZoom: Math.max(0, Math.floor(options.minZoom ?? 0)),
    radius: Math.max(1, options.radius ?? 72),
  };
}

function clusterOptionsKey(options: ClusterOptions) {
  return `${options.radius}|${options.minZoom}|${options.maxZoom}|${options.extent}`;
}

function getClusterFeatures(index: GeoSupercluster, bounds: VizGeoBounds, zoom: number) {
  const [west, south, east, north] = bounds;
  const roundedZoom = Math.round(zoom);

  if (west <= east) {
    return index.getClusters([west, south, east, north], roundedZoom);
  }

  return [
    ...index.getClusters([west, south, 180, north], roundedZoom),
    ...index.getClusters([-180, south, east, north], roundedZoom),
  ];
}

function pickMetrics(properties: GeoClusterProperties, metricKeys: readonly string[]) {
  const metrics: VizMetricRecord = {};

  for (const metricKey of metricKeys) {
    metrics[metricKey] = properties[metricKey] ?? 0;
  }

  return metrics;
}
