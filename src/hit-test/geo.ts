import type {
  VizAnyRenderLayer,
  VizGeoFlowHitTestResult,
  VizGeoJsonFeatureCollection,
  VizGeoJsonHitTestResult,
  VizGeoPointHitTestResult,
  VizHitTestOptions,
  VizHitTestResult,
  VizIndexedGeoFlow,
  VizIndexedGeoPoint,
  VizTypedGeoClusters,
  VizTypedGeoFlows,
  VizTypedGeoHeat,
  VizTypedGeoPoints,
  VizViewport,
} from "../types";
import {
  distanceToSegment,
  geoCoordinateToPixel,
  geometryBounds,
  pixelToGeoCoordinate,
} from "./geometry";
import type { HitLayerBase } from "./types";

export function hitTestGeoLayers<TProperties>(
  layers: readonly VizAnyRenderLayer<TProperties>[],
  viewport: Extract<VizViewport, { kind: "geo" }>,
  options: VizHitTestOptions<TProperties>,
): VizHitTestResult<TProperties> | null {
  const coordinate = pixelToGeoCoordinate(
    options.x,
    options.y,
    viewport.width,
    viewport.height,
    viewport.bounds,
  );
  let nearest: VizHitTestResult<TProperties> | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const layer of layers) {
    const result = hitTestGeoLayer(layer, viewport, coordinate, options);
    if (!result) {
      continue;
    }

    const distance = "distancePx" in result ? (result.distancePx ?? 0) : 0;
    if (distance < nearestDistance) {
      nearest = result;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function hitTestGeoLayer<TProperties>(
  layer: VizAnyRenderLayer<TProperties>,
  viewport: Extract<VizViewport, { kind: "geo" }>,
  coordinate: [longitude: number, latitude: number],
  options: VizHitTestOptions<TProperties>,
): VizHitTestResult<TProperties> | null {
  switch (layer.kind) {
    case "geo-points":
      return nearestGeoPoint(
        "typedGeoPoints" in layer
          ? geoPointsFromTyped<TProperties>(layer.typedGeoPoints)
          : layer.features,
        layer,
        viewport,
        coordinate,
        options,
      );
    case "geo-heat":
      return nearestGeoPoint(
        "typedGeoHeat" in layer
          ? geoPointsFromTyped<TProperties>(layer.typedGeoHeat)
          : layer.features.map((feature) => feature.point),
        layer,
        viewport,
        coordinate,
        options,
      );
    case "geo-clusters":
      return nearestGeoPoint(
        "typedGeoClusters" in layer
          ? geoClusterPointsFromTyped<TProperties>(layer.typedGeoClusters)
          : layer.features.map((feature, index) =>
              feature.kind === "point"
                ? feature.point
                : {
                    id: String(feature.clusterId),
                    label: feature.pointCountAbbreviated,
                    latitude: feature.coordinates[1],
                    longitude: feature.coordinates[0],
                    metrics: feature.metrics,
                    properties: {} as TProperties,
                    sourceIndex: index,
                  },
            ),
        layer,
        viewport,
        coordinate,
        options,
      );
    case "geo-flows":
      return nearestGeoFlow(
        "typedGeoFlows" in layer
          ? geoFlowsFromTyped<TProperties>(layer.typedGeoFlows)
          : layer.features.map((feature) => feature.flow),
        layer,
        viewport,
        options,
      );
    case "geojson":
      return hitTestGeoJson(layer.featureCollection, layer, coordinate, options);
    default:
      return null;
  }
}

function nearestGeoPoint<TProperties>(
  points: readonly VizIndexedGeoPoint<TProperties>[],
  layer: HitLayerBase,
  viewport: Extract<VizViewport, { kind: "geo" }>,
  coordinate: [longitude: number, latitude: number],
  options: VizHitTestOptions<TProperties>,
): VizGeoPointHitTestResult<TProperties> | null {
  let nearest: VizGeoPointHitTestResult<TProperties> | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const point of points) {
    const pointPixel = geoCoordinateToPixel([point.longitude, point.latitude], viewport);
    const distancePx = Math.hypot(pointPixel[0] - options.x, pointPixel[1] - options.y);

    if (options.mode === "contains" && distancePx > 8) {
      continue;
    }

    if (distancePx < nearestDistance) {
      nearestDistance = distancePx;
      nearest = {
        datasetId: layer.datasetId,
        distance: Math.hypot(point.longitude - coordinate[0], point.latitude - coordinate[1]),
        distancePx,
        kind: "geo-point",
        layerId: layer.layerId,
        layerKind: layer.kind,
        point,
      };
    }
  }

  return nearest;
}

function nearestGeoFlow<TProperties>(
  flows: readonly VizIndexedGeoFlow<TProperties>[],
  layer: HitLayerBase & { kind: "geo-flows" },
  viewport: Extract<VizViewport, { kind: "geo" }>,
  options: VizHitTestOptions<TProperties>,
): VizGeoFlowHitTestResult<TProperties> | null {
  let nearest: VizGeoFlowHitTestResult<TProperties> | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const flow of flows) {
    const from = geoCoordinateToPixel(flow.from, viewport);
    const to = geoCoordinateToPixel(flow.to, viewport);
    const distancePx = distanceToSegment([options.x, options.y], from, to);

    if (options.mode === "contains" && distancePx > 8) {
      continue;
    }

    if (distancePx < nearestDistance) {
      nearestDistance = distancePx;
      nearest = {
        datasetId: layer.datasetId,
        distancePx,
        flow,
        kind: "geo-flow",
        layerId: layer.layerId,
        layerKind: layer.kind,
      };
    }
  }

  return nearest;
}

function hitTestGeoJson<TProperties>(
  featureCollection: VizGeoJsonFeatureCollection<TProperties>,
  layer: HitLayerBase & { kind: "geojson" },
  coordinate: [longitude: number, latitude: number],
  options: VizHitTestOptions<TProperties>,
): VizGeoJsonHitTestResult | null {
  for (let index = 0; index < featureCollection.features.length; index += 1) {
    const bounds = geometryBounds(featureCollection.features[index]?.geometry);
    if (!bounds) {
      continue;
    }

    const contains =
      coordinate[0] >= bounds[0] &&
      coordinate[0] <= bounds[2] &&
      coordinate[1] >= bounds[1] &&
      coordinate[1] <= bounds[3];

    if (contains || options.mode !== "contains") {
      return {
        datasetId: layer.datasetId,
        featureIndex: index,
        kind: "geojson",
        layerId: layer.layerId,
        layerKind: layer.kind,
      };
    }
  }

  return null;
}

function geoPointsFromTyped<TProperties>(
  points: VizTypedGeoPoints | VizTypedGeoHeat,
): Array<VizIndexedGeoPoint<TProperties>> {
  return Array.from({ length: points.longitude.length }, (_, index) => ({
    id: points.id[index] ?? String(index),
    label: points.label[index] ?? "",
    latitude: points.latitude[index] ?? 0,
    longitude: points.longitude[index] ?? 0,
    metrics: metricsAt(points.metrics, points.summary.metricKeys, index),
    properties: {} as TProperties,
    sourceIndex: points.sourceIndex[index] ?? index,
  }));
}

function geoClusterPointsFromTyped<TProperties>(
  clusters: VizTypedGeoClusters,
): Array<VizIndexedGeoPoint<TProperties>> {
  return Array.from({ length: clusters.longitude.length }, (_, index) => ({
    id: clusters.id[index] ?? String(index),
    label: clusters.label[index] ?? "",
    latitude: clusters.latitude[index] ?? 0,
    longitude: clusters.longitude[index] ?? 0,
    metrics: metricsAt(clusters.metrics, clusters.summary.metricKeys, index),
    properties: {} as TProperties,
    sourceIndex: clusters.sourceIndex[index] ?? index,
  }));
}

function geoFlowsFromTyped<TProperties>(
  flows: VizTypedGeoFlows,
): Array<VizIndexedGeoFlow<TProperties>> {
  return Array.from({ length: flows.fromLongitude.length }, (_, index) => ({
    from: [flows.fromLongitude[index] ?? 0, flows.fromLatitude[index] ?? 0],
    id: flows.id[index] ?? String(index),
    label: flows.label[index] ?? "",
    metrics: metricsAt(flows.metrics, flows.summary.metricKeys, index),
    properties: {} as TProperties,
    sourceIndex: flows.sourceIndex[index] ?? index,
    to: [flows.toLongitude[index] ?? 0, flows.toLatitude[index] ?? 0],
  }));
}

function metricsAt(
  metrics: Record<string, Float64Array> | undefined,
  metricKeys: readonly string[],
  index: number,
) {
  const output: Record<string, number> = {};
  for (const metricKey of metricKeys) {
    output[metricKey] = metrics?.[metricKey]?.[index] ?? 0;
  }
  return output;
}
