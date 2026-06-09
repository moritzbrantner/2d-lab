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
  VizGeoScalarFieldGrid,
  VizGeoScalarFieldOptions,
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

  getScalarFieldGrid(
    query: VizGeoViewportQuery,
    options: VizGeoScalarFieldOptions = {},
  ): VizGeoScalarFieldGrid {
    return createGeoScalarFieldGrid(this.points, {
      ...options,
      domainBounds: query.bounds,
    });
  }

  getViewportAggregation(
    query: VizGeoViewportQuery,
    options: VizGeoAggregationOptions = {},
  ): VizGeoAggregation<TProperties> {
    const cacheEntry = this.getClusterIndex(options);
    this.latestClusterIndexKey = cacheEntry.key;
    if (options.fast === true || !needsRichClusterMetadata(options)) {
      return this.getFastViewportAggregation(cacheEntry.index, query);
    }

    const features = getClusterFeatures(cacheEntry.index, query.bounds, query.zoom).map((feature) =>
      this.mapClusterFeature(
        feature,
        options.includeExpansionZoom === true,
        options.includeClusterMetrics === true,
      ),
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
    includeExpansionZoom: boolean,
    includeClusterMetrics: boolean,
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
        expansionZoom: includeExpansionZoom ? this.getClusterExpansionZoom(clusterId) : 0,
        kind: "cluster",
        metrics: includeClusterMetrics
          ? pickMetrics(properties, this.metricKeys)
          : EMPTY_GEO_METRICS,
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

  private getFastViewportAggregation(
    index: GeoSupercluster,
    query: VizGeoViewportQuery,
  ): VizGeoAggregation<TProperties> {
    const rawFeatures = getClusterFeatures(index, query.bounds, query.zoom);
    const features: VizGeoAggregation<TProperties>["features"] = [];
    let visibleClusterCount = 0;
    let visiblePointCount = 0;
    let visibleUnclusteredCount = 0;

    for (const feature of rawFeatures) {
      const properties = feature.properties as GeoPointFeatureProperties &
        GeoClusterProperties & {
          cluster?: boolean;
          cluster_id?: number;
          point_count?: number;
          point_count_abbreviated?: string | number;
        };

      if (properties.cluster) {
        const pointCount = properties.point_count ?? 0;

        visibleClusterCount += 1;
        visiblePointCount += pointCount;
        features.push({
          clusterId: properties.cluster_id ?? 0,
          coordinates: feature.geometry.coordinates as [number, number],
          expansionZoom: 0,
          kind: "cluster",
          metrics: EMPTY_GEO_METRICS,
          pointCount,
          pointCountAbbreviated: String(properties.point_count_abbreviated ?? pointCount),
        });
        continue;
      }

      const point = this.points[properties.sourceIndex];
      if (!point) {
        throw new Error(`Missing geo point for source index ${properties.sourceIndex}.`);
      }

      visiblePointCount += 1;
      visibleUnclusteredCount += 1;
      features.push({
        coordinates: [point.longitude, point.latitude],
        kind: "point",
        metrics: point.metrics,
        point,
      });
    }

    return {
      features,
      summary: {
        bounds: query.bounds,
        metrics: EMPTY_GEO_METRICS,
        visibleClusterCount,
        visiblePointCount,
        visibleUnclusteredCount,
        zoom: query.zoom,
      },
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
    addMetricRecord(result, record);
  }

  return result;
}

function addMetricRecord(target: VizMetricRecord, record: VizMetricRecord) {
  for (const [key, value] of Object.entries(record)) {
    target[key] = (target[key] ?? 0) + value;
  }
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

function needsRichClusterMetadata(options: VizGeoAggregationOptions) {
  return options.includeExpansionZoom === true || options.includeClusterMetrics === true;
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

type InternalScalarFieldOptions = VizGeoScalarFieldOptions & {
  domainBounds?: VizGeoBounds;
};

const EMPTY_GEO_METRICS: VizMetricRecord = {};

export function createGeoScalarFieldGrid<TProperties>(
  points: readonly VizIndexedGeoPoint<TProperties>[],
  options: InternalScalarFieldOptions = {},
): VizGeoScalarFieldGrid {
  const valuePoints = points
    .map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      value: resolveScalarPointValue(point.metrics, options.valueMetric),
    }))
    .filter((point) => Number.isFinite(point.value));
  const bounds = normalizeScalarBounds(options.domainBounds ?? getBoundsFromGeoPoints(valuePoints));

  if (!bounds) {
    return {
      bounds: [0, 0, 0, 0],
      columns: 0,
      rows: 0,
      valueDomain: null,
      values: [],
    };
  }

  const [columns, rows] = resolveScalarGridDimensions(bounds, options);
  const values: Array<number | null> = [];
  const [west, south, east, north] = bounds;
  const longitudeStep = (east - west) / columns;
  const latitudeStep = (north - south) / rows;

  for (let row = 0; row < rows; row += 1) {
    const latitude = north - latitudeStep * (row + 0.5);
    for (let column = 0; column < columns; column += 1) {
      const longitude = west + longitudeStep * (column + 0.5);
      values.push(interpolateScalarValue([longitude, latitude], valuePoints, bounds, options));
    }
  }

  return {
    bounds,
    columns,
    rows,
    valueDomain: resolveScalarValueDomain(valuePoints, values, options.valueDomain),
    values,
  };
}

function resolveScalarPointValue(metrics: VizMetricRecord, valueMetric: string | undefined) {
  return valueMetric != null
    ? (metrics[valueMetric] ?? Number.NaN)
    : (metrics.value ?? metrics.weight);
}

function normalizeScalarBounds(bounds: VizGeoBounds | null): VizGeoBounds | null {
  if (!bounds || bounds.some((value) => !Number.isFinite(value))) {
    return null;
  }

  const west = Math.min(bounds[0], bounds[2]);
  const east = Math.max(bounds[0], bounds[2]);
  const south = Math.min(bounds[1], bounds[3]);
  const north = Math.max(bounds[1], bounds[3]);

  if (west === east || south === north) {
    return null;
  }

  return [Math.max(-180, west), Math.max(-90, south), Math.min(180, east), Math.min(90, north)];
}

function resolveScalarGridDimensions(
  bounds: VizGeoBounds,
  options: VizGeoScalarFieldOptions,
): [columns: number, rows: number] {
  const explicitColumns = positiveInteger(options.fieldColumns);
  const explicitRows = positiveInteger(options.fieldRows);
  const widthMeters = Math.max(1, approximateLongitudeMeters(bounds));
  const heightMeters = Math.max(1, approximateLatitudeMeters(bounds));
  const aspectRatio = widthMeters / heightMeters;

  if (explicitColumns != null && explicitRows != null) {
    return [clampGridSize(explicitColumns), clampGridSize(explicitRows)];
  }

  if (Number.isFinite(options.fieldCellSizeMeters) && (options.fieldCellSizeMeters ?? 0) > 0) {
    const cellSize = options.fieldCellSizeMeters!;
    return [
      clampGridSize(Math.ceil(widthMeters / cellSize)),
      clampGridSize(Math.ceil(heightMeters / cellSize)),
    ];
  }

  if (explicitColumns != null) {
    return [
      clampGridSize(explicitColumns),
      clampGridSize(Math.round(explicitColumns / aspectRatio)),
    ];
  }

  if (explicitRows != null) {
    return [clampGridSize(Math.round(explicitRows * aspectRatio)), clampGridSize(explicitRows)];
  }

  const columns = 256;
  return [
    columns,
    Math.min(columns, clampGridSize(Math.round(columns / Math.max(0.001, aspectRatio)))),
  ];
}

function interpolateScalarValue(
  coordinate: [longitude: number, latitude: number],
  points: readonly { latitude: number; longitude: number; value: number }[],
  bounds: VizGeoBounds,
  options: VizGeoScalarFieldOptions,
) {
  if (!points.length) {
    return null;
  }

  const projection = createMetricProjection(bounds);
  const target = projectCoordinate(coordinate, projection);
  const epsilonMeters = 1;
  const k = Math.max(1, Math.floor(options.interpolationK ?? 12));
  const maxDistanceMeters =
    options.interpolationMaxDistanceMeters != null &&
    Number.isFinite(options.interpolationMaxDistanceMeters)
      ? Math.max(0, options.interpolationMaxDistanceMeters)
      : null;
  const candidates = points
    .map((point) => {
      const projected = projectCoordinate([point.longitude, point.latitude], projection);
      const distanceMeters = Math.hypot(projected.x - target.x, projected.y - target.y);
      return { distanceMeters, value: point.value };
    })
    .sort((left, right) => left.distanceMeters - right.distanceMeters);
  const nearest = candidates[0];

  if (!nearest) {
    return null;
  }
  if (nearest.distanceMeters <= epsilonMeters) {
    return nearest.value;
  }

  const withinDistance = candidates.filter(
    (candidate) => maxDistanceMeters == null || candidate.distanceMeters <= maxDistanceMeters,
  );
  const selected = (
    withinDistance.length || options.interpolationExtrapolate === true
      ? withinDistance.length
        ? withinDistance
        : candidates
      : []
  ).slice(0, k);

  if (!selected.length) {
    return null;
  }

  const power = positiveFinite(options.interpolationPower, 2);
  let weightedSum = 0;
  let weightSum = 0;

  for (const candidate of selected) {
    const weight = 1 / candidate.distanceMeters ** power;
    weightedSum += candidate.value * weight;
    weightSum += weight;
  }

  return weightSum > 0 ? weightedSum / weightSum : null;
}

function resolveScalarValueDomain(
  points: readonly { value: number }[],
  values: readonly (number | null)[],
  fixedDomain: [number, number] | undefined,
) {
  if (fixedDomain) {
    return fixedDomain;
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    min = Math.min(min, point.value);
    max = Math.max(max, point.value);
  }
  for (const value of values) {
    if (value != null && Number.isFinite(value)) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }

  return min <= max ? ([min, max] as [number, number]) : null;
}

function positiveInteger(value: number | undefined) {
  return Number.isFinite(value) && value != null && value > 0 ? Math.floor(value) : null;
}

function positiveFinite(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && value != null && value > 0 ? value : fallback;
}

function clampGridSize(value: number) {
  return Math.max(1, Math.min(2048, Math.floor(value)));
}

function approximateLongitudeMeters(bounds: VizGeoBounds) {
  const latitude = (bounds[1] + bounds[3]) / 2;
  return (
    Math.abs(bounds[2] - bounds[0]) *
    111_320 *
    Math.max(0.001, Math.cos((latitude * Math.PI) / 180))
  );
}

function approximateLatitudeMeters(bounds: VizGeoBounds) {
  return Math.abs(bounds[3] - bounds[1]) * 110_574;
}

function createMetricProjection(bounds: VizGeoBounds) {
  const latitude = ((bounds[1] + bounds[3]) / 2) * (Math.PI / 180);
  return {
    longitudeScale: Math.max(0.001, Math.cos(latitude)),
  };
}

function projectCoordinate(
  coordinate: [longitude: number, latitude: number],
  projection: { longitudeScale: number },
) {
  return {
    x: coordinate[0] * 111_320 * projection.longitudeScale,
    y: coordinate[1] * 110_574,
  };
}
