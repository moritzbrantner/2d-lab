import { getGeoFlowIndex, getGeoJsonIndex, getGeoPointIndex, getGeoViewport } from "./utils";

import type {
  VizComputeFrameOptions,
  VizEngineDatasetRecord,
  VizFrameDiagnostic,
  VizLayer,
  VizLayerId,
  VizRenderLayer,
} from "../types";

type GeoLayer = Extract<
  VizLayer,
  { kind: "geo-clusters" | "geo-flows" | "geo-heat" | "geo-points" | "geojson" }
>;

export function computeGeoRenderLayer<TProperties>(
  layerId: VizLayerId,
  layer: GeoLayer,
  datasetRecord: VizEngineDatasetRecord<TProperties>,
  options: VizComputeFrameOptions,
  diagnostics: VizFrameDiagnostic[],
): VizRenderLayer<TProperties> | null {
  switch (layer.kind) {
    case "geo-clusters": {
      const index = getGeoPointIndex(layerId, layer.kind, datasetRecord, diagnostics);
      const viewport = getGeoViewport(options.viewport, layerId, diagnostics);
      if (!index || !viewport) {
        return null;
      }
      const aggregation = index.getViewportAggregation(
        {
          bounds: viewport.bounds,
          zoom: viewport.zoom,
        },
        {
          fast: true,
          maxZoom: layer.maxZoom,
          minZoom: layer.minZoom,
          radius: layer.radius,
        },
      );

      return {
        aggregation,
        bounds: aggregation.summary.bounds,
        datasetId: layer.datasetId,
        features: aggregation.features,
        kind: "geo-clusters",
        layerId,
      };
    }
    case "geo-points": {
      const index = getGeoPointIndex(layerId, layer.kind, datasetRecord, diagnostics);
      const viewport = getGeoViewport(options.viewport, layerId, diagnostics);
      if (!index || !viewport) {
        return null;
      }
      const aggregation = index.getViewportAggregation({
        bounds: viewport.bounds,
        zoom: viewport.zoom,
      });

      return {
        bounds: aggregation.summary.bounds,
        datasetId: layer.datasetId,
        features: aggregation.features.flatMap((feature) =>
          feature.kind === "point"
            ? [feature.point]
            : index.getClusterLeaves(feature.clusterId, feature.pointCount, 0),
        ),
        kind: "geo-points",
        layerId,
      };
    }
    case "geo-heat": {
      const index = getGeoPointIndex(layerId, layer.kind, datasetRecord, diagnostics);
      const viewport = getGeoViewport(options.viewport, layerId, diagnostics);
      if (!index || !viewport) {
        return null;
      }
      const heat = index.getHeatFeatures(
        {
          bounds: viewport.bounds,
          zoom: viewport.zoom,
        },
        {
          radiusMeters: layer.radiusMeters,
          weightMetric: layer.weightMetric,
        },
      );

      return {
        bounds: heat.summary.bounds,
        datasetId: layer.datasetId,
        features: heat.features,
        kind: "geo-heat",
        layerId,
        maxWeight: heat.summary.maxWeight,
      };
    }
    case "geojson": {
      const index = getGeoJsonIndex(layerId, layer.kind, datasetRecord, diagnostics);
      const viewport = getGeoViewport(options.viewport, layerId, diagnostics);
      if (!index || !viewport) {
        return null;
      }
      const geojson = index.getViewportFeatures(
        {
          bounds: viewport.bounds,
          zoom: viewport.zoom,
        },
        {
          clipToViewport: layer.clipToViewport,
          simplifyTolerance: layer.simplifyTolerance,
        },
      );

      return {
        bounds: geojson.bounds,
        datasetId: layer.datasetId,
        featureCollection: geojson.featureCollection,
        featureCount: geojson.featureCount,
        kind: "geojson",
        layerId,
        viewport: geojson,
      };
    }
    case "geo-flows": {
      const index = getGeoFlowIndex(layerId, layer.kind, datasetRecord, diagnostics);
      const viewport = getGeoViewport(options.viewport, layerId, diagnostics);
      if (!index || !viewport) {
        return null;
      }
      const aggregation = index.getViewportFlows(
        {
          bounds: viewport.bounds,
          zoom: viewport.zoom,
        },
        {
          aggregate: layer.aggregate,
          minWeight: layer.minWeight,
          weightMetric: layer.weightMetric,
        },
      );

      return {
        aggregation,
        bounds: aggregation.summary.bounds,
        datasetId: layer.datasetId,
        features: aggregation.features,
        kind: "geo-flows",
        layerId,
      };
    }
  }
}
