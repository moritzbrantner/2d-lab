export type VizDatasetId = string;
export type VizLayerId = string;

export type VizBackendOption = "auto" | "js" | "wasm";
export type VizResolvedBackend = "js" | "mixed" | "wasm";
export type VizBackendImplementation = "js" | "legacy-wasm" | "mixed" | "rust-viz-engine-wasm";

export type VizMetricRecord = Record<string, number>;
export type VizValueMode = "average" | "count" | "max" | "min" | "sum";
export type VizMapDisplayMode = "flat" | "globe";
export type VizGeoBounds = [west: number, south: number, east: number, north: number];

export type VizSeriesPoint<TProperties = Record<string, unknown>> = {
  id?: string;
  label?: string;
  metrics?: VizMetricRecord;
  properties?: TProperties;
  x: number;
  y: number;
};

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

export type VizIndexedSeriesPoint<TProperties = Record<string, unknown>> =
  VizSeriesPoint<TProperties> & {
    sourceIndex: number;
  };

export type VizDensityBin<TProperties = Record<string, unknown>> = {
  averageY: number | null;
  firstPoint: VizIndexedSeriesPoint<TProperties> | null;
  firstPointIndex: number | null;
  index: number;
  lastPoint: VizIndexedSeriesPoint<TProperties> | null;
  lastPointIndex: number | null;
  maxY: number | null;
  metrics: VizMetricRecord;
  minY: number | null;
  pointCount: number;
  sumY: number;
  x0: number;
  x1: number;
};

export type VizDensitySample<TProperties = Record<string, unknown>> = VizDensityBin<TProperties> & {
  x: number;
  y: number | null;
};

export type VizDensitySeries<TProperties = Record<string, unknown>> = {
  bins: Array<VizDensityBin<TProperties>>;
  samples: Array<VizDensitySample<TProperties>>;
  summary: {
    binCount: number;
    metrics: VizMetricRecord;
    pointCount: number;
    sampleCount: number;
    valueMode: VizValueMode;
    xDomain: [number, number];
  };
};

export type VizHistogramBucket<TProperties = Record<string, unknown>> = {
  averageValue: number | null;
  firstPoint: VizIndexedSeriesPoint<TProperties> | null;
  firstPointIndex: number | null;
  index: number;
  lastPoint: VizIndexedSeriesPoint<TProperties> | null;
  lastPointIndex: number | null;
  maxValue: number | null;
  metrics: VizMetricRecord;
  minValue: number | null;
  pointCount: number;
  sumValue: number;
  value: number;
  value0: number;
  value1: number;
};

export type VizHistogram<TProperties = Record<string, unknown>> = {
  buckets: Array<VizHistogramBucket<TProperties>>;
  summary: {
    bucketCount: number;
    metrics: VizMetricRecord;
    pointCount: number;
    valueDomain: [number, number];
    xDomain: [number, number] | null;
  };
};

export type VizHeatmapCell<TProperties = Record<string, unknown>> = {
  averageValue: number | null;
  firstPoint: VizIndexedSeriesPoint<TProperties> | null;
  firstPointIndex: number | null;
  index: number;
  lastPoint: VizIndexedSeriesPoint<TProperties> | null;
  lastPointIndex: number | null;
  metrics: VizMetricRecord;
  pointCount: number;
  sumValue: number;
  value: number;
  x: number;
  x0: number;
  x1: number;
  xIndex: number;
  y: number;
  y0: number;
  y1: number;
  yIndex: number;
};

export type VizHeatmap<TProperties = Record<string, unknown>> = {
  cells: Array<VizHeatmapCell<TProperties>>;
  summary: {
    maxCellCount: number;
    metrics: VizMetricRecord;
    pointCount: number;
    xBinCount: number;
    xDomain: [number, number];
    yBinCount: number;
    yDomain: [number, number];
  };
};

export type VizDensityQuery = {
  includeEmptyBins?: boolean;
  targetBinCount: number;
  valueMode?: VizValueMode;
  xDomain: [number, number];
};

export type VizBinnedSeriesQuery = {
  includeEmptyBins?: boolean;
  targetBinCount: number;
  xDomain: [number, number];
};

export type VizHistogramQuery = {
  bucketCount: number;
  includeEmptyBuckets?: boolean;
  valueDomain?: [number, number];
  xDomain?: [number, number];
};

export type VizHeatmapQuery = {
  includeEmptyCells?: boolean;
  xBinCount: number;
  xDomain: [number, number];
  yBinCount: number;
  yDomain?: [number, number];
};

export type VizSeriesBounds = {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
};

export type VizDensityIndex<TProperties = Record<string, unknown>> = {
  getBackendCapabilities(): {
    backend: Exclude<VizResolvedBackend, "mixed">;
    implementation?: Exclude<VizBackendImplementation, "mixed">;
    usesWasm: boolean;
  };
  getBinnedSeries(query: VizBinnedSeriesQuery): { bins: Array<VizDensityBin<TProperties>> };
  getChartSeries(query: VizDensityQuery): VizDensitySeries<TProperties>;
  getHeatmap(query: VizHeatmapQuery): VizHeatmap<TProperties>;
  getHistogram(query: VizHistogramQuery): VizHistogram<TProperties>;
  getPointById(pointId: string): VizIndexedSeriesPoint<TProperties> | null;
  getSeriesBounds(): VizSeriesBounds | null;
};

export type VizGeoViewportQuery = {
  bounds: VizGeoBounds;
  zoom: number;
};

export type VizGeoAggregationOptions = {
  extent?: number;
  maxZoom?: number;
  minZoom?: number;
  radius?: number;
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

export type VizGeoPointIndex<TProperties = Record<string, unknown>> = {
  getBackendCapabilities(): {
    backend: Exclude<VizResolvedBackend, "mixed">;
    implementation?: Exclude<VizBackendImplementation, "mixed">;
    usesWasm: boolean;
  };
  getBounds(): VizGeoBounds | null;
  getClusterExpansionZoom(clusterId: number): number;
  getClusterLeaves(
    clusterId: number,
    limit?: number,
    offset?: number,
  ): Array<VizIndexedGeoPoint<TProperties>>;
  getPointById(pointId: string): VizIndexedGeoPoint<TProperties> | null;
  getViewportAggregation(
    query: VizGeoViewportQuery,
    options?: VizGeoAggregationOptions,
  ): VizGeoAggregation<TProperties>;
};

export type VizDataset<TProperties = Record<string, unknown>> =
  | {
      kind: "xy";
      points: readonly VizSeriesPoint<TProperties>[];
    }
  | {
      kind: "geo-points";
      points: readonly VizGeoPoint<TProperties>[];
    }
  | {
      featureCollection: VizGeoJsonFeatureCollection<TProperties>;
      kind: "geojson";
    }
  | {
      flows: readonly VizGeoFlow<TProperties>[];
      kind: "geo-flows";
    };

export type VizLayer =
  | {
      datasetId: VizDatasetId;
      includeEmptyBins?: boolean;
      kind: "binned-series";
      targetBinCount: number;
      valueMode?: VizValueMode;
      xDomain: [number, number];
    }
  | {
      bucketCount: number;
      datasetId: VizDatasetId;
      kind: "histogram";
      xDomain?: [number, number];
    }
  | {
      datasetId: VizDatasetId;
      kind: "heatmap";
      xBinCount: number;
      xDomain: [number, number];
      yBinCount: number;
      yDomain?: [number, number];
    }
  | {
      datasetId: VizDatasetId;
      kind: "geo-clusters";
      maxZoom?: number;
      minZoom?: number;
      radius?: number;
    }
  | {
      datasetId: VizDatasetId;
      kind: "geo-points";
    }
  | {
      datasetId: VizDatasetId;
      kind: "geo-heat";
      radiusMeters?: number;
      weightMetric?: string;
    }
  | {
      datasetId: VizDatasetId;
      kind: "geojson";
    }
  | {
      datasetId: VizDatasetId;
      kind: "geo-flows";
      weightMetric?: string;
    };

export type VizCartesianViewport = {
  height: number;
  kind?: "cartesian";
  width: number;
  xDomain: [number, number];
};

export type VizGeoViewport = {
  bounds: VizGeoBounds;
  center: [longitude: number, latitude: number];
  display: VizMapDisplayMode;
  height: number;
  kind: "geo";
  width: number;
  zoom: number;
};

export type VizViewport = VizCartesianViewport | VizGeoViewport;

export type VizComputeFrameOptions = {
  viewport: VizViewport;
};

export type VizRenderBounds = [number, number, number, number];

export type VizRenderDatum<TProperties = Record<string, unknown>> = {
  average: number | null;
  count: number | null;
  index: number;
  label: string;
  max: number | null;
  metrics?: VizMetricRecord;
  min: number | null;
  pointCount: number;
  sample?: VizDensitySample<TProperties>;
  sum: number | null;
  value: number | null;
  x: number;
  x0: number;
  x1: number;
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

export type VizGeoFlowFeature<TProperties = Record<string, unknown>> = {
  flow: Required<VizGeoFlow<TProperties>> & { id: string };
  rawWeight: number;
  value: number;
};

export type VizRenderLayer<TProperties = Record<string, unknown>> =
  | {
      bounds: VizRenderBounds | null;
      datasetId: VizDatasetId;
      kind: "binned-series";
      layerId: VizLayerId;
      rows: Array<VizRenderDatum<TProperties>>;
      series: VizDensitySeries<TProperties>;
    }
  | {
      bounds: VizRenderBounds | null;
      buckets: Array<VizHistogramBucket<TProperties>>;
      datasetId: VizDatasetId;
      kind: "histogram";
      layerId: VizLayerId;
    }
  | {
      bounds: VizRenderBounds | null;
      cells: Array<VizHeatmapCell<TProperties>>;
      datasetId: VizDatasetId;
      kind: "heatmap";
      layerId: VizLayerId;
    }
  | {
      aggregation: VizGeoAggregation<TProperties>;
      bounds: VizGeoBounds | null;
      datasetId: VizDatasetId;
      features: Array<VizGeoAggregationFeature<TProperties>>;
      kind: "geo-clusters";
      layerId: VizLayerId;
    }
  | {
      bounds: VizGeoBounds | null;
      datasetId: VizDatasetId;
      features: Array<VizIndexedGeoPoint<TProperties>>;
      kind: "geo-points";
      layerId: VizLayerId;
    }
  | {
      bounds: VizGeoBounds | null;
      datasetId: VizDatasetId;
      features: Array<VizGeoHeatFeature<TProperties>>;
      kind: "geo-heat";
      layerId: VizLayerId;
      maxWeight: number;
    }
  | {
      bounds: VizGeoBounds | null;
      datasetId: VizDatasetId;
      featureCollection: VizGeoJsonFeatureCollection<TProperties>;
      kind: "geojson";
      layerId: VizLayerId;
    }
  | {
      bounds: VizGeoBounds | null;
      datasetId: VizDatasetId;
      features: Array<VizGeoFlowFeature<TProperties>>;
      kind: "geo-flows";
      layerId: VizLayerId;
    };

export type VizFrameDiagnostic = {
  code: string;
  layerId?: VizLayerId;
  message: string;
  severity: "error" | "warning";
};

export type VizRenderFrame<TProperties = Record<string, unknown>> = {
  layers: Array<VizRenderLayer<TProperties>>;
  stats: {
    backend: VizResolvedBackend;
    backendImplementation?: VizBackendImplementation;
    computeMs: number;
    datasetCount: number;
    diagnostics: VizFrameDiagnostic[];
    layerCount: number;
  };
};

export type VizHitTestOptions = {
  viewport?: VizViewport;
  x: number;
  y: number;
};

export type VizHitTestResult = {
  datasetId: VizDatasetId;
  layerId: VizLayerId;
  pointCount: number;
  sampleIndex: number;
  sourcePointId: string | null;
  x: number;
  y: number | null;
};

export type VizEngine<TProperties = Record<string, unknown>> = {
  addDataset(dataset: VizDataset<TProperties>): VizDatasetId;
  addLayer(layer: VizLayer): VizLayerId;
  computeFrame(options: VizComputeFrameOptions): VizRenderFrame<TProperties>;
  getDatasetCount(): number;
  getLayerCount(): number;
  hitTest(options: VizHitTestOptions): VizHitTestResult | null;
  removeDataset(datasetId: VizDatasetId): void;
  removeLayer(layerId: VizLayerId): void;
};

export type VizEngineBackend<TProperties = Record<string, unknown>> = {
  createIndex(dataset: VizDataset<TProperties>): VizDatasetIndex<TProperties>;
  option: VizBackendOption;
  resolveBackend(index: VizDatasetIndex<TProperties>): Exclude<VizResolvedBackend, "mixed">;
};

export type VizDatasetIndex<TProperties = Record<string, unknown>> =
  | {
      index: VizDensityIndex<TProperties>;
      kind: "xy";
    }
  | {
      index: VizGeoPointIndex<TProperties>;
      kind: "geo-points";
    }
  | {
      kind: "geojson";
    }
  | {
      kind: "geo-flows";
    };

export type VizEngineDatasetRecord<TProperties = Record<string, unknown>> = {
  dataset: VizDataset<TProperties>;
  index: VizDatasetIndex<TProperties>;
};
