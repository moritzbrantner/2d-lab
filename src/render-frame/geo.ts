import {
  getGeoFlowIndex,
  getGeoJsonIndex,
  getGeoPointIndex,
  getGeoViewport,
  resolveFrameFormat,
} from "./utils";

import type {
  VizAnyRenderLayer,
  VizTypedMetricArrays,
  VizComputeFrameOptions,
  VizEngineDatasetRecord,
  VizFrameDiagnostic,
  VizGeoAggregation,
  VizGeoAggregationFeature,
  VizGeoFlowAggregation,
  VizGeoHeatAggregation,
  VizGeoScalarFieldGrid,
  VizIndexedGeoPoint,
  VizLayer,
  VizLayerId,
  VizTypedGeoClusters,
  VizTypedGeoFlows,
  VizTypedGeoHeat,
  VizTypedGeoPoints,
  VizTypedGeoScalarField,
} from "../types";

type GeoLayer = Extract<
  VizLayer,
  {
    kind: "geo-clusters" | "geo-flows" | "geo-heat" | "geo-points" | "geo-scalar-field" | "geojson";
  }
>;

export function computeGeoRenderLayer<TProperties>(
  layerId: VizLayerId,
  layer: GeoLayer,
  datasetRecord: VizEngineDatasetRecord<TProperties>,
  options: VizComputeFrameOptions,
  diagnostics: VizFrameDiagnostic[],
): VizAnyRenderLayer<TProperties> | null {
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

      if (resolveFrameFormat(options) === "typed") {
        const typedGeoClusters = createTypedGeoClusters(aggregation);

        return {
          aggregation,
          bounds: aggregation.summary.bounds,
          datasetId: layer.datasetId,
          features: aggregation.features,
          kind: "geo-clusters",
          layerId,
          typedGeoClusters,
        } satisfies VizAnyRenderLayer<TProperties>;
      }

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
      const features = aggregation.features.flatMap((feature) =>
        feature.kind === "point"
          ? [feature.point]
          : index.getClusterLeaves(feature.clusterId, feature.pointCount, 0),
      );

      if (resolveFrameFormat(options) === "typed") {
        const typedGeoPoints = createTypedGeoPoints(features, aggregation.summary.bounds);

        return {
          bounds: aggregation.summary.bounds,
          datasetId: layer.datasetId,
          features,
          kind: "geo-points",
          layerId,
          typedGeoPoints,
        } satisfies VizAnyRenderLayer<TProperties>;
      }

      return {
        bounds: aggregation.summary.bounds,
        datasetId: layer.datasetId,
        features,
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

      if (resolveFrameFormat(options) === "typed") {
        const typedGeoHeat = createTypedGeoHeat(heat);

        return {
          bounds: heat.summary.bounds,
          datasetId: layer.datasetId,
          features: heat.features,
          kind: "geo-heat",
          layerId,
          maxWeight: heat.summary.maxWeight,
          typedGeoHeat,
        } satisfies VizAnyRenderLayer<TProperties>;
      }

      return {
        bounds: heat.summary.bounds,
        datasetId: layer.datasetId,
        features: heat.features,
        kind: "geo-heat",
        layerId,
        maxWeight: heat.summary.maxWeight,
      };
    }
    case "geo-scalar-field": {
      const index = getGeoPointIndex(layerId, layer.kind, datasetRecord, diagnostics);
      const viewport = getGeoViewport(options.viewport, layerId, diagnostics);
      if (!index || !viewport) {
        return null;
      }
      const grid = index.getScalarFieldGrid(
        {
          bounds: viewport.bounds,
          zoom: viewport.zoom,
        },
        {
          fieldCellSizeMeters: layer.fieldCellSizeMeters,
          fieldColumns: layer.fieldColumns,
          fieldRows: layer.fieldRows,
          interpolationExtrapolate: layer.interpolationExtrapolate,
          interpolationK: layer.interpolationK,
          interpolationMaxDistanceMeters: layer.interpolationMaxDistanceMeters,
          interpolationPower: layer.interpolationPower,
          valueDomain: layer.valueDomain,
          valueMetric: layer.valueMetric,
        },
      );

      if (resolveFrameFormat(options) === "typed") {
        return {
          bounds: grid.bounds,
          datasetId: layer.datasetId,
          grid,
          kind: "geo-scalar-field",
          layerId,
          typedGeoScalarField: createTypedGeoScalarField(grid),
        } satisfies VizAnyRenderLayer<TProperties>;
      }

      return {
        bounds: grid.bounds,
        datasetId: layer.datasetId,
        grid,
        kind: "geo-scalar-field",
        layerId,
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

      if (resolveFrameFormat(options) === "typed") {
        return {
          aggregation,
          bounds: aggregation.summary.bounds,
          datasetId: layer.datasetId,
          features: aggregation.features,
          kind: "geo-flows",
          layerId,
          typedGeoFlows: createTypedGeoFlows(aggregation),
        } satisfies VizAnyRenderLayer<TProperties>;
      }

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

function createTypedGeoPoints<TProperties>(
  points: readonly VizIndexedGeoPoint<TProperties>[],
  bounds: VizTypedGeoPoints["summary"]["bounds"],
): VizTypedGeoPoints {
  const metricKeys = collectMetricKeys(points);
  const metrics = createMetricArrays(points, metricKeys);
  const latitude = new Float64Array(points.length);
  const longitude = new Float64Array(points.length);
  const sourceIndex = new Uint32Array(points.length);
  const id: string[] = [];
  const label: string[] = [];

  points.forEach((point, index) => {
    id.push(point.id);
    label.push(point.label);
    latitude[index] = point.latitude;
    longitude[index] = point.longitude;
    sourceIndex[index] = point.sourceIndex;
  });

  return {
    id,
    label,
    latitude,
    longitude,
    metrics,
    sourceIndex,
    summary: {
      bounds,
      metricKeys,
      pointCount: points.length,
    },
  };
}

function createTypedGeoHeat<TProperties>(
  heat: VizGeoHeatAggregation<TProperties>,
): VizTypedGeoHeat {
  const points = heat.features.map((feature) => feature.point);
  const base = createTypedGeoPoints(points, heat.summary.bounds);
  const pointCount = new Uint32Array(heat.features.length);
  const rawWeight = new Float64Array(heat.features.length);
  const value = new Float64Array(heat.features.length);

  heat.features.forEach((feature, index) => {
    pointCount[index] = feature.pointCount;
    rawWeight[index] = feature.rawWeight;
    value[index] = feature.value;
  });

  return {
    ...base,
    pointCount,
    rawWeight,
    summary: {
      ...base.summary,
      maxWeight: heat.summary.maxWeight,
    },
    value,
  };
}

function createTypedGeoScalarField(grid: VizGeoScalarFieldGrid): VizTypedGeoScalarField {
  const values = new Float64Array(grid.values.length);

  grid.values.forEach((value, index) => {
    values[index] = value == null ? Number.NaN : value;
  });

  return {
    bounds: grid.bounds,
    columns: grid.columns,
    rows: grid.rows,
    valueDomain: grid.valueDomain,
    values,
  };
}

function createTypedGeoFlows<TProperties>(
  aggregation: VizGeoFlowAggregation<TProperties>,
): VizTypedGeoFlows {
  const flows = aggregation.features.map((feature) => feature.flow);
  const metricKeys = collectMetricKeys(flows);
  const metrics = createMetricArrays(flows, metricKeys);
  const fromLatitude = new Float64Array(flows.length);
  const fromLongitude = new Float64Array(flows.length);
  const rawWeight = new Float64Array(flows.length);
  const sourceIndex = new Uint32Array(flows.length);
  const toLatitude = new Float64Array(flows.length);
  const toLongitude = new Float64Array(flows.length);
  const value = new Float64Array(flows.length);
  const id: string[] = [];
  const label: string[] = [];

  aggregation.features.forEach((feature, index) => {
    const flow = feature.flow;
    id.push(flow.id);
    label.push(flow.label);
    fromLongitude[index] = flow.from[0];
    fromLatitude[index] = flow.from[1];
    toLongitude[index] = flow.to[0];
    toLatitude[index] = flow.to[1];
    rawWeight[index] = feature.rawWeight;
    sourceIndex[index] = flow.sourceIndex;
    value[index] = feature.value;
  });

  return {
    fromLatitude,
    fromLongitude,
    id,
    label,
    metrics,
    rawWeight,
    sourceIndex,
    summary: {
      bounds: aggregation.summary.bounds,
      flowCount: flows.length,
      maxWeight: aggregation.summary.maxWeight,
      metricKeys,
    },
    toLatitude,
    toLongitude,
    value,
  };
}

function createTypedGeoClusters<TProperties>(
  aggregation: VizGeoAggregation<TProperties>,
): VizTypedGeoClusters {
  const features = aggregation.features;
  const metricKeys = collectFeatureMetricKeys(features);
  const metrics = createFeatureMetricArrays(features, metricKeys);
  const clusterId = new Int32Array(features.length);
  const expansionZoom = new Int32Array(features.length);
  const kindCode = new Uint8Array(features.length);
  const latitude = new Float64Array(features.length);
  const longitude = new Float64Array(features.length);
  const pointCount = new Uint32Array(features.length);
  const sourceIndex = new Int32Array(features.length);
  const id: string[] = [];
  const label: string[] = [];

  features.forEach((feature, index) => {
    longitude[index] = feature.coordinates[0];
    latitude[index] = feature.coordinates[1];

    if (feature.kind === "cluster") {
      clusterId[index] = feature.clusterId;
      expansionZoom[index] = feature.expansionZoom;
      id.push(String(feature.clusterId));
      kindCode[index] = 1;
      label.push(feature.pointCountAbbreviated);
      pointCount[index] = feature.pointCount;
      sourceIndex[index] = -1;
      return;
    }

    clusterId[index] = -1;
    expansionZoom[index] = -1;
    id.push(feature.point.id);
    kindCode[index] = 0;
    label.push(feature.point.label);
    pointCount[index] = 1;
    sourceIndex[index] = feature.point.sourceIndex;
  });

  return {
    clusterId,
    expansionZoom,
    id,
    kindCode,
    label,
    latitude,
    longitude,
    metrics,
    pointCount,
    sourceIndex,
    summary: {
      bounds: aggregation.summary.bounds,
      featureCount: features.length,
      metricKeys,
    },
  };
}

function collectMetricKeys(items: ReadonlyArray<{ metrics: Record<string, number> }>): string[] {
  return [...new Set(items.flatMap((item) => Object.keys(item.metrics)))].sort();
}

function collectFeatureMetricKeys<TProperties>(
  features: readonly VizGeoAggregationFeature<TProperties>[],
) {
  return [...new Set(features.flatMap((feature) => Object.keys(feature.metrics)))].sort();
}

function createMetricArrays(
  items: ReadonlyArray<{ metrics: Record<string, number> }>,
  metricKeys: readonly string[],
): VizTypedMetricArrays | undefined {
  if (!metricKeys.length) {
    return undefined;
  }

  const metrics: VizTypedMetricArrays = {};
  for (const metricKey of metricKeys) {
    const values = new Float64Array(items.length);
    items.forEach((item, index) => {
      values[index] = item.metrics[metricKey] ?? 0;
    });
    metrics[metricKey] = values;
  }

  return metrics;
}

function createFeatureMetricArrays<TProperties>(
  features: readonly VizGeoAggregationFeature<TProperties>[],
  metricKeys: readonly string[],
): VizTypedMetricArrays | undefined {
  if (!metricKeys.length) {
    return undefined;
  }

  const metrics: VizTypedMetricArrays = {};
  for (const metricKey of metricKeys) {
    const values = new Float64Array(features.length);
    features.forEach((feature, index) => {
      values[index] = feature.metrics[metricKey] ?? 0;
    });
    metrics[metricKey] = values;
  }

  return metrics;
}
