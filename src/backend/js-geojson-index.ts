import type {
  VizGeoBounds,
  VizGeoJsonFeatureCollection,
  VizGeoJsonIndex,
  VizGeoJsonOptions,
  VizGeoJsonViewport,
  VizGeoViewportQuery,
} from "../types";

export class JsVizGeoJsonIndex<
  TProperties = Record<string, unknown>,
> implements VizGeoJsonIndex<TProperties> {
  constructor(private readonly featureCollection: VizGeoJsonFeatureCollection<TProperties>) {}

  getBackendCapabilities() {
    return {
      backend: "js" as const,
      implementation: "js" as const,
      usesWasm: false,
    };
  }

  getBounds(): VizGeoBounds | null {
    return getFeatureCollectionBounds(this.featureCollection);
  }

  getViewportFeatures(
    query: VizGeoViewportQuery,
    options: VizGeoJsonOptions = {},
  ): VizGeoJsonViewport<TProperties> {
    const clipToViewport = options.clipToViewport ?? true;
    const features = clipToViewport
      ? this.featureCollection.features.filter((feature) =>
          geometryIntersectsBounds(feature.geometry, query.bounds),
        )
      : this.featureCollection.features;
    const featureCollection = {
      ...this.featureCollection,
      features,
    };

    return {
      bounds: getFeatureCollectionBounds(featureCollection),
      featureCollection,
      featureCount: features.length,
      viewportBounds: query.bounds,
      zoom: query.zoom,
    };
  }
}

function getFeatureCollectionBounds<TProperties>(
  featureCollection: VizGeoJsonFeatureCollection<TProperties>,
): VizGeoBounds | null {
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  let hasPositions = false;

  for (const feature of featureCollection.features) {
    for (const [longitude, latitude] of collectPositions(feature.geometry)) {
      hasPositions = true;
      west = Math.min(west, longitude);
      south = Math.min(south, latitude);
      east = Math.max(east, longitude);
      north = Math.max(north, latitude);
    }
  }

  return hasPositions ? [west, south, east, north] : null;
}

function geometryIntersectsBounds(geometry: unknown, bounds: VizGeoBounds) {
  return collectPositions(geometry).some((position) => pointInBounds(position, bounds));
}

function collectPositions(geometry: unknown): Array<[number, number]> {
  if (!geometry || typeof geometry !== "object") {
    return [];
  }

  const value = geometry as { coordinates?: unknown; geometries?: unknown[]; type?: string };

  if (value.type === "GeometryCollection") {
    return (value.geometries ?? []).flatMap(collectPositions);
  }

  return collectCoordinatePositions(value.coordinates);
}

function collectCoordinatePositions(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) {
    return [];
  }

  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    const position = [value[0], value[1]] as [number, number];
    return position.every(Number.isFinite) ? [position] : [];
  }

  return value.flatMap(collectCoordinatePositions);
}

function pointInBounds(point: [number, number], bounds: VizGeoBounds) {
  const longitudeVisible =
    bounds[0] <= bounds[2]
      ? point[0] >= bounds[0] && point[0] <= bounds[2]
      : point[0] >= bounds[0] || point[0] <= bounds[2];

  return longitudeVisible && point[1] >= bounds[1] && point[1] <= bounds[3];
}
