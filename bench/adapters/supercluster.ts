import Supercluster from "supercluster";

import type { Point, GeoJsonProperties } from "geojson";
import type { VizGeoBounds, VizGeoPoint } from "../../src/types";

type ClusterProperties = GeoJsonProperties & {
  demand?: number;
  weight?: number;
};

export function createSupercluster(
  points: readonly VizGeoPoint[],
  options: { radius?: number } = {},
) {
  const features = points.map((point, index) => ({
    geometry: {
      coordinates: [point.longitude, point.latitude],
      type: "Point" as const,
    },
    properties: {
      demand: point.metrics?.demand ?? 0,
      id: point.id ?? `geo-${index}`,
      weight: point.metrics?.weight ?? 0,
    },
    type: "Feature" as const,
  }));

  return new Supercluster<ClusterProperties, ClusterProperties>({
    maxZoom: 16,
    radius: options.radius ?? 72,
  }).load(features);
}

export function getSuperclusterViewport(
  cluster: Supercluster<ClusterProperties, ClusterProperties>,
  bounds: VizGeoBounds,
  zoom: number,
) {
  const bbox: [number, number, number, number] =
    bounds[0] <= bounds[2] ? bounds : [bounds[0], bounds[1], 180, bounds[3]];
  const features = cluster.getClusters(bbox, Math.round(zoom));
  let representedPointCount = 0;

  for (const feature of features) {
    representedPointCount += getRepresentedPointCount(feature);
  }

  if (bounds[0] > bounds[2]) {
    const wrappedFeatures = cluster.getClusters(
      [-180, bounds[1], bounds[2], bounds[3]],
      Math.round(zoom),
    );
    for (const feature of wrappedFeatures) {
      representedPointCount += getRepresentedPointCount(feature);
    }
    return {
      features: [...features, ...wrappedFeatures],
      representedPointCount,
    };
  }

  return {
    features,
    representedPointCount,
  };
}

function getRepresentedPointCount(
  feature:
    | Supercluster.PointFeature<ClusterProperties>
    | Supercluster.ClusterFeature<ClusterProperties>,
) {
  const properties = feature.properties as { cluster?: boolean; point_count?: number };
  return properties.cluster ? (properties.point_count ?? 0) : 1;
}
