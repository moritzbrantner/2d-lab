import type { VizBackendCapabilities, VizGeoBounds, VizMetricRecord } from "./core";

export type VizMapDisplayMode = "flat" | "globe";

export type VizGeoPoint<TProperties = Record<string, unknown>> = {
  id?: string;
  label?: string;
  latitude: number;
  longitude: number;
  metrics?: VizMetricRecord;
  properties?: TProperties;
};

export type VizIndexedGeoPoint<TProperties = Record<string, unknown>> = Required<
  VizGeoPoint<TProperties>
> & {
  id: string;
  sourceIndex: number;
};

export type VizGeoFlow<TProperties = Record<string, unknown>> = {
  from: [longitude: number, latitude: number];
  id?: string;
  label?: string;
  metrics?: VizMetricRecord;
  properties?: TProperties;
  to: [longitude: number, latitude: number];
};

export type VizGeoJsonFeatureCollection<TProperties = Record<string, unknown>> = {
  features: Array<{
    geometry: unknown;
    id?: string | number;
    properties?: TProperties;
    type: "Feature";
  }>;
  type: "FeatureCollection";
};

export type VizGeoViewportQuery = {
  bounds: VizGeoBounds;
  zoom: number;
};

export type VizGeoAggregationOptions = {
  extent?: number;
  fast?: boolean;
  maxZoom?: number;
  minZoom?: number;
  radius?: number;
};

export type VizGeoHeatOptions = {
  radiusMeters?: number;
  weightMetric?: string;
};

export type VizGeoAggregationFeature<TProperties = Record<string, unknown>> =
  | {
      coordinates: [longitude: number, latitude: number];
      kind: "point";
      metrics: VizMetricRecord;
      point: VizIndexedGeoPoint<TProperties>;
    }
  | {
      clusterId: number;
      coordinates: [longitude: number, latitude: number];
      expansionZoom: number;
      kind: "cluster";
      metrics: VizMetricRecord;
      pointCount: number;
      pointCountAbbreviated: string;
    };

export type VizGeoAggregation<TProperties = Record<string, unknown>> = {
  features: Array<VizGeoAggregationFeature<TProperties>>;
  summary: {
    bounds: VizGeoBounds;
    metrics: VizMetricRecord;
    visibleClusterCount: number;
    visiblePointCount: number;
    visibleUnclusteredCount: number;
    zoom: number;
  };
};

export type VizGeoHeatFeature<TProperties = Record<string, unknown>> = {
  coordinates: [longitude: number, latitude: number];
  id: string;
  label: string;
  metrics: VizMetricRecord;
  point: VizIndexedGeoPoint<TProperties>;
  pointCount: number;
  rawWeight: number;
  value: number;
};

export type VizGeoHeatAggregation<TProperties = Record<string, unknown>> = {
  features: Array<VizGeoHeatFeature<TProperties>>;
  summary: {
    bounds: VizGeoBounds;
    maxWeight: number;
    metrics: VizMetricRecord;
    visiblePointCount: number;
    zoom: number;
  };
};

export type VizGeoPointIndex<TProperties = Record<string, unknown>> = {
  getBackendCapabilities(): VizBackendCapabilities;
  getBounds(): VizGeoBounds | null;
  getClusterExpansionZoom(clusterId: number): number;
  getClusterLeaves(
    clusterId: number,
    limit?: number,
    offset?: number,
  ): Array<VizIndexedGeoPoint<TProperties>>;
  getPointById(pointId: string): VizIndexedGeoPoint<TProperties> | null;
  getHeatFeatures(
    query: VizGeoViewportQuery,
    options?: VizGeoHeatOptions,
  ): VizGeoHeatAggregation<TProperties>;
  getViewportAggregation(
    query: VizGeoViewportQuery,
    options?: VizGeoAggregationOptions,
  ): VizGeoAggregation<TProperties>;
  nearestPoint(query: {
    latitude: number;
    longitude: number;
    maxDistance?: number;
  }): VizIndexedGeoPoint<TProperties> | null;
};

export type VizGeoJsonOptions = {
  clipToViewport?: boolean;
  simplifyTolerance?: number;
};

export type VizGeoJsonViewport<TProperties = Record<string, unknown>> = {
  bounds: VizGeoBounds | null;
  featureCollection: VizGeoJsonFeatureCollection<TProperties>;
  featureCount: number;
  viewportBounds: VizGeoBounds;
  zoom: number;
};

export type VizGeoJsonIndex<TProperties = Record<string, unknown>> = {
  getBackendCapabilities(): VizBackendCapabilities;
  getBounds(): VizGeoBounds | null;
  getViewportFeatures(
    query: VizGeoViewportQuery,
    options?: VizGeoJsonOptions,
  ): VizGeoJsonViewport<TProperties>;
};

export type VizGeoFlowOptions = {
  aggregate?: "none" | "origin-destination" | "grid";
  minWeight?: number;
  weightMetric?: string;
};

export type VizIndexedGeoFlow<TProperties = Record<string, unknown>> = Required<
  VizGeoFlow<TProperties>
> & {
  id: string;
  sourceIndex: number;
};

export type VizGeoFlowFeature<TProperties = Record<string, unknown>> = {
  flow: VizIndexedGeoFlow<TProperties>;
  rawWeight: number;
  value: number;
};

export type VizGeoFlowAggregation<TProperties = Record<string, unknown>> = {
  features: Array<VizGeoFlowFeature<TProperties>>;
  summary: {
    bounds: VizGeoBounds | null;
    maxWeight: number;
    metrics: VizMetricRecord;
    viewportBounds: VizGeoBounds;
    visibleFlowCount: number;
    zoom: number;
  };
};

export type VizGeoFlowIndex<TProperties = Record<string, unknown>> = {
  getBackendCapabilities(): VizBackendCapabilities;
  getBounds(): VizGeoBounds | null;
  getViewportFlows(
    query: VizGeoViewportQuery,
    options?: VizGeoFlowOptions,
  ): VizGeoFlowAggregation<TProperties>;
};
