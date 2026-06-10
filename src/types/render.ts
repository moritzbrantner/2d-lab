import type {
  VizBackendOption,
  VizBackendConfig,
  VizBackendImplementation,
  VizCacheStats,
  VizCompactDensitySeries,
  VizCompactHeatmap,
  VizCompactHistogram,
  VizCompactRollingSeries,
  VizDensityIndex,
  VizDensitySample,
  VizDensitySeries,
  VizDatasetId,
  VizGeoBounds,
  VizHeatmapCell,
  VizHistogramBucket,
  VizLayerId,
  VizMetricRecord,
  VizRenderBounds,
  VizResourceStats,
  VizResolvedBackend,
  VizRollingSeries,
  VizRollingStatistic,
  VizSeriesPoint,
  VizValueMode,
  VizXyDataset,
} from "./core";
import type {
  VizCompactFinanceReturns,
  VizCompactOhlcvBars,
  VizFinanceDataset,
  VizFinanceIndex,
  VizFinancialInstrument,
  VizOhlcvBar,
} from "./finance";
import type {
  VizGeoAggregation,
  VizGeoAggregationFeature,
  VizGeoFlow,
  VizGeoFlowAggregation,
  VizGeoFlowFeature,
  VizGeoFlowIndex,
  VizGeoHeatFeature,
  VizGeoJsonFeatureCollection,
  VizGeoJsonIndex,
  VizGeoJsonViewport,
  VizGeoPoint,
  VizGeoPointIndex,
  VizGeoScalarFieldGrid,
  VizIndexedGeoFlow,
  VizIndexedGeoPoint,
  VizMapDisplayMode,
  VizTypedGeoClusters,
  VizTypedGeoFlows,
  VizTypedGeoHeat,
  VizTypedGeoPoints,
  VizTypedGeoScalarField,
} from "./geo";
import type {
  VizTableDataset,
  VizTableIndex,
  VizTableQuery,
  VizTableResult,
  VizTableViewport,
  VizTypedTable,
} from "./table";

export type VizDataset<TProperties = Record<string, unknown>> =
  | VizXyDataset<TProperties>
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
    }
  | VizFinanceDataset<TProperties>
  | VizTableDataset<TProperties>;

export type VizLayer =
  | {
      datasetId: VizDatasetId;
      includeEmptyBins?: boolean;
      kind: "binned-series";
      targetBinCount: number;
      valueMode?: VizValueMode;
      xDomain?: [number, number];
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
      xDomain?: [number, number];
      yBinCount: number;
      yDomain?: [number, number];
    }
  | {
      alpha?: number;
      datasetId: VizDatasetId;
      kind: "rolling-series";
      minPeriods?: number;
      statistic?: VizRollingStatistic;
      windowSize: number;
      xDomain?: [number, number];
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
      fieldCellSizeMeters?: number;
      fieldColumns?: number;
      fieldRows?: number;
      interpolationExtrapolate?: boolean;
      interpolationK?: number;
      interpolationMaxDistanceMeters?: number;
      interpolationPower?: number;
      kind: "geo-scalar-field";
      valueDomain?: [number, number];
      valueMetric?: string;
    }
  | {
      clipToViewport?: boolean;
      datasetId: VizDatasetId;
      kind: "geojson";
      simplifyTolerance?: number;
    }
  | {
      aggregate?: "none" | "origin-destination" | "grid";
      datasetId: VizDatasetId;
      kind: "geo-flows";
      minWeight?: number;
      weightMetric?: string;
    }
  | {
      datasetId: VizDatasetId;
      kind: "finance-candles";
      priceMode?: "adjusted" | "raw";
      targetBarCount?: number;
      xDomain: [number, number];
    }
  | {
      datasetId: VizDatasetId;
      kind: "finance-line";
      targetPointCount?: number;
      value?: "adjustedClose" | "close" | "high" | "low" | "open" | "volume";
      xDomain: [number, number];
    }
  | {
      datasetId: VizDatasetId;
      kind: "finance-returns";
      method?: "log" | "simple";
      priceMode?: "adjusted" | "raw";
      targetPointCount?: number;
      xDomain: [number, number];
    }
  | {
      datasetId: VizDatasetId;
      kind: "table";
      query?: VizTableQuery;
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

export type VizViewport = VizCartesianViewport | VizGeoViewport | VizTableViewport;

export type VizFrameFormat = "objects" | "typed";

export type VizObjectComputeFrameOptions = {
  frameFormat: "objects";
  layerIds?: readonly VizLayerId[];
  viewport: VizViewport;
};

export type VizTypedComputeFrameOptions = {
  frameFormat?: "typed";
  layerIds?: readonly VizLayerId[];
  viewport: VizViewport;
};

export type VizComputeFrameOptions = VizObjectComputeFrameOptions | VizTypedComputeFrameOptions;

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

export type VizRenderLayer<TProperties = Record<string, unknown>> =
  | {
      bounds: VizRenderBounds | null;
      datasetId: VizDatasetId;
      kind: "binned-series";
      layerId: VizLayerId;
      /** @deprecated Use typed frames for render workloads and hydrate only for debugging. */
      rows: Array<VizRenderDatum<TProperties>>;
      /** @deprecated Use typed frames for render workloads and hydrate only for debugging. */
      series: VizDensitySeries<TProperties>;
    }
  | {
      bounds: VizRenderBounds | null;
      /** @deprecated Use typed frames for render workloads and hydrate only for debugging. */
      buckets: Array<VizHistogramBucket<TProperties>>;
      datasetId: VizDatasetId;
      kind: "histogram";
      layerId: VizLayerId;
    }
  | {
      bounds: VizRenderBounds | null;
      /** @deprecated Use typed frames for render workloads and hydrate only for debugging. */
      cells: Array<VizHeatmapCell<TProperties>>;
      datasetId: VizDatasetId;
      kind: "heatmap";
      layerId: VizLayerId;
    }
  | {
      bounds: VizRenderBounds | null;
      datasetId: VizDatasetId;
      kind: "rolling-series";
      layerId: VizLayerId;
      /** @deprecated Use typed frames for render workloads and hydrate only for debugging. */
      rows: Array<VizRenderDatum<TProperties>>;
      /** @deprecated Use typed frames for render workloads and hydrate only for debugging. */
      series: VizRollingSeries<TProperties>;
      statistic: VizRollingStatistic;
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
      grid: VizGeoScalarFieldGrid;
      kind: "geo-scalar-field";
      layerId: VizLayerId;
    }
  | {
      bounds: VizGeoBounds | null;
      datasetId: VizDatasetId;
      featureCollection: VizGeoJsonFeatureCollection<TProperties>;
      featureCount: number;
      kind: "geojson";
      layerId: VizLayerId;
      viewport: VizGeoJsonViewport<TProperties>;
    }
  | {
      aggregation: VizGeoFlowAggregation<TProperties>;
      bounds: VizGeoBounds | null;
      datasetId: VizDatasetId;
      features: Array<VizGeoFlowFeature<TProperties>>;
      kind: "geo-flows";
      layerId: VizLayerId;
    }
  | {
      /** @deprecated Use typedCandles in typed frames, or hydrate only for debugging. */
      bars: Array<VizOhlcvBar<TProperties>>;
      bounds: VizRenderBounds | null;
      datasetId: VizDatasetId;
      instrument: VizFinancialInstrument;
      kind: "finance-candles";
      layerId: VizLayerId;
    }
  | {
      bounds: VizRenderBounds | null;
      datasetId: VizDatasetId;
      kind: "finance-line" | "finance-returns";
      layerId: VizLayerId;
      /** @deprecated Use typedFinanceLine/typedReturns in typed frames, or hydrate only for debugging. */
      rows: Array<VizRenderDatum<TProperties>>;
    }
  | {
      datasetId: VizDatasetId;
      kind: "table";
      layerId: VizLayerId;
      table: VizTableResult;
    };

export type VizTypedCartesianRenderLayer =
  | {
      bounds: VizRenderBounds | null;
      datasetId: VizDatasetId;
      kind: "binned-series";
      layerId: VizLayerId;
      typedSeries: VizCompactDensitySeries;
      valueMode: VizValueMode;
    }
  | {
      bounds: VizRenderBounds | null;
      datasetId: VizDatasetId;
      kind: "histogram";
      layerId: VizLayerId;
      typedHistogram: VizCompactHistogram;
    }
  | {
      bounds: VizRenderBounds | null;
      datasetId: VizDatasetId;
      kind: "heatmap";
      layerId: VizLayerId;
      typedHeatmap: VizCompactHeatmap;
    }
  | {
      bounds: VizRenderBounds | null;
      datasetId: VizDatasetId;
      kind: "rolling-series";
      layerId: VizLayerId;
      statistic: VizRollingStatistic;
      typedRollingSeries: VizCompactRollingSeries;
    };

export type VizTypedFinanceRenderLayer =
  | {
      bounds: VizRenderBounds | null;
      datasetId: VizDatasetId;
      instrument: VizFinancialInstrument;
      kind: "finance-candles";
      layerId: VizLayerId;
      typedCandles: VizCompactOhlcvBars;
    }
  | {
      bounds: VizRenderBounds | null;
      datasetId: VizDatasetId;
      kind: "finance-line";
      layerId: VizLayerId;
      typedFinanceLine: VizCompactFinanceReturns;
    }
  | {
      bounds: VizRenderBounds | null;
      datasetId: VizDatasetId;
      kind: "finance-returns";
      layerId: VizLayerId;
      typedReturns: VizCompactFinanceReturns;
    };

export type VizTypedGeoRenderLayer =
  | {
      aggregation: VizGeoAggregation;
      bounds: VizGeoBounds | null;
      datasetId: VizDatasetId;
      features: Array<VizGeoAggregationFeature>;
      kind: "geo-clusters";
      layerId: VizLayerId;
      typedGeoClusters: VizTypedGeoClusters;
    }
  | {
      bounds: VizGeoBounds | null;
      datasetId: VizDatasetId;
      features: Array<VizIndexedGeoPoint>;
      kind: "geo-points";
      layerId: VizLayerId;
      typedGeoPoints: VizTypedGeoPoints;
    }
  | {
      bounds: VizGeoBounds | null;
      datasetId: VizDatasetId;
      features: Array<VizGeoHeatFeature>;
      kind: "geo-heat";
      layerId: VizLayerId;
      maxWeight: number;
      typedGeoHeat: VizTypedGeoHeat;
    }
  | {
      bounds: VizGeoBounds | null;
      datasetId: VizDatasetId;
      grid: VizGeoScalarFieldGrid;
      kind: "geo-scalar-field";
      layerId: VizLayerId;
      typedGeoScalarField: VizTypedGeoScalarField;
    }
  | {
      aggregation: VizGeoFlowAggregation;
      bounds: VizGeoBounds | null;
      datasetId: VizDatasetId;
      features: Array<VizGeoFlowFeature>;
      kind: "geo-flows";
      layerId: VizLayerId;
      typedGeoFlows: VizTypedGeoFlows;
    };

export type VizTypedTableRenderLayer = {
  datasetId: VizDatasetId;
  kind: "table";
  layerId: VizLayerId;
  typedTable: VizTypedTable;
};

export type VizAnyRenderLayer<TProperties = Record<string, unknown>> =
  | VizRenderLayer<TProperties>
  | VizTypedCartesianRenderLayer
  | VizTypedFinanceRenderLayer
  | VizTypedGeoRenderLayer
  | VizTypedTableRenderLayer;

export type VizDiagnosticSeverity = "debug" | "info" | "warning" | "error";

export type VizDiagnosticDomain =
  | "backend"
  | "cache"
  | "dataset"
  | "engine"
  | "layer"
  | "table"
  | "wasm"
  | "worker";

export type VizDiagnosticCode =
  | "missing-layer"
  | "missing-dataset"
  | "incompatible-layer"
  | "incompatible-viewport"
  | "unknown-table-column"
  | "incompatible-table-filter"
  | "invalid-table-filter"
  | "wasm-loading-js-fallback"
  | "wasm-load-failed-js-fallback"
  | "wasm-unsupported-dataset-js-fallback"
  | "wasm-unsupported-query-js-fallback"
  | "wasm-query-partial-js-fallback"
  | "wasm-query-error-js-fallback"
  | "cache-entry-evicted"
  | "cache-disabled"
  | "resource-disposed"
  | "worker-request-cancelled"
  | "worker-request-failed";

export type VizFrameDiagnostic = {
  backend?: {
    implementation?: VizBackendImplementation;
    requested?: VizBackendOption;
    selected?: Exclude<VizResolvedBackend, "mixed">;
  };
  code: VizDiagnosticCode | string;
  datasetId?: VizDatasetId;
  details?: Record<string, unknown>;
  domain?: VizDiagnosticDomain;
  layerId?: VizLayerId;
  message: string;
  severity: VizDiagnosticSeverity;
};

export type VizBackendDecision = {
  datasetId: VizDatasetId;
  datasetKind: VizDataset["kind"];
  requested: VizBackendOption;
  selected: Exclude<VizResolvedBackend, "mixed">;
  implementation: VizBackendImplementation;
  fallbackReason?: VizDiagnosticCode | string;
  details?: Record<string, unknown>;
};

export type VizRenderFrameStats = {
  backend: VizResolvedBackend;
  backendDecisions?: VizBackendDecision[];
  backendImplementation?: VizBackendImplementation;
  computeMs: number;
  cacheEvictionCount?: number;
  cacheHitCount?: number;
  cacheMissCount?: number;
  datasetCount: number;
  diagnostics: VizFrameDiagnostic[];
  layerCount: number;
  renderedLayerCount?: number;
  skippedLayerCount?: number;
};

export type VizRenderFrame<TProperties = Record<string, unknown>> = {
  layers: Array<VizRenderLayer<TProperties>>;
  stats: VizRenderFrameStats;
};

export type VizTypedRenderFrame<TProperties = Record<string, unknown>> = Omit<
  VizRenderFrame<TProperties>,
  "layers"
> & {
  layers: Array<
    | VizRenderLayer<TProperties>
    | VizTypedCartesianRenderLayer
    | VizTypedFinanceRenderLayer
    | VizTypedGeoRenderLayer
    | VizTypedTableRenderLayer
  >;
};

export type VizAnyRenderFrame<TProperties = Record<string, unknown>> =
  | VizRenderFrame<TProperties>
  | VizTypedRenderFrame<TProperties>;

export type VizHitTestMode = "contains" | "nearest-point" | "nearest-x";

export type VizHitTestOptions<TProperties = Record<string, unknown>> = {
  frame?: VizAnyRenderFrame<TProperties>;
  layerIds?: readonly VizLayerId[];
  maxDistancePx?: number;
  mode?: VizHitTestMode;
  viewport?: VizViewport;
  x: number;
  y: number;
};

export type VizCartesianHitTestResult = {
  datasetId: VizDatasetId;
  distancePx?: number;
  kind: "cartesian";
  layerKind: VizLayer["kind"];
  layerId: VizLayerId;
  pointCount: number;
  sampleIndex: number;
  sourcePointId: string | null;
  x: number;
  y: number | null;
};

export type VizGeoPointHitTestResult<TProperties = Record<string, unknown>> = {
  datasetId: VizDatasetId;
  distance: number;
  distancePx?: number;
  kind: "geo-point";
  layerKind: VizLayer["kind"];
  layerId: VizLayerId;
  point: VizIndexedGeoPoint<TProperties>;
};

export type VizGeoFlowHitTestResult<TProperties = Record<string, unknown>> = {
  datasetId: VizDatasetId;
  distancePx?: number;
  flow: VizIndexedGeoFlow<TProperties>;
  kind: "geo-flow";
  layerKind: VizLayer["kind"];
  layerId: VizLayerId;
};

export type VizGeoJsonHitTestResult = {
  datasetId: VizDatasetId;
  featureIndex: number;
  kind: "geojson";
  layerKind: VizLayer["kind"];
  layerId: VizLayerId;
};

export type VizHitTestResult<TProperties = Record<string, unknown>> =
  | VizCartesianHitTestResult
  | VizGeoPointHitTestResult<TProperties>
  | VizGeoFlowHitTestResult<TProperties>
  | VizGeoJsonHitTestResult;

export type VizEngine<TProperties = Record<string, unknown>> = {
  addDataset(dataset: VizDataset<TProperties>): VizDatasetId;
  addLayer(layer: VizLayer): VizLayerId;
  clear(): void;
  clearCache(options?: { datasetId?: VizDatasetId; layerId?: VizLayerId }): void;
  computeFrame(options: VizObjectComputeFrameOptions): VizRenderFrame<TProperties>;
  computeFrame(options: VizTypedComputeFrameOptions): VizTypedRenderFrame<TProperties>;
  dispose(): void;
  getCacheStats(): VizCacheStats;
  getDatasetCount(): number;
  getLayerCount(): number;
  getResourceStats(): VizResourceStats;
  hydrateFrame(frame: VizAnyRenderFrame<TProperties>): VizRenderFrame<TProperties>;
  hydrateLayer(layer: VizAnyRenderLayer<TProperties>): VizRenderLayer<TProperties> | null;
  hitTest(options: VizHitTestOptions<TProperties>): VizHitTestResult<TProperties> | null;
  removeDataset(datasetId: VizDatasetId): void;
  removeLayer(layerId: VizLayerId): void;
  updateDataset(datasetId: VizDatasetId, dataset: VizDataset<TProperties>): boolean;
  updateLayer(layerId: VizLayerId, layer: VizLayer): boolean;
};

export type VizEngineBackend<TProperties = Record<string, unknown>> = {
  createIndex(dataset: VizDataset<TProperties>): VizDatasetIndex<TProperties>;
  option: Required<VizBackendConfig>;
  resolveBackend(index: VizDatasetIndex<TProperties>): Exclude<VizResolvedBackend, "mixed">;
};

export type VizDatasetIndex<TProperties = Record<string, unknown>> = (
  | {
      index: VizDensityIndex<TProperties>;
      kind: "xy";
    }
  | {
      index: VizGeoPointIndex<TProperties>;
      kind: "geo-points";
    }
  | {
      index: VizGeoJsonIndex<TProperties>;
      kind: "geojson";
    }
  | {
      index: VizGeoFlowIndex<TProperties>;
      kind: "geo-flows";
    }
  | {
      index: VizFinanceIndex<TProperties>;
      kind: "finance-ohlcv";
    }
  | {
      index: VizTableIndex;
      kind: "table";
    }
) & {
  backendImplementation?: VizBackendImplementation;
  diagnostics?: VizFrameDiagnostic[];
  details?: Record<string, unknown>;
  fallbackReason?: VizDiagnosticCode | string;
  requestedBackend?: VizBackendOption;
  selectedBackend?: Exclude<VizResolvedBackend, "mixed">;
};

export type VizEngineDatasetRecord<TProperties = Record<string, unknown>> = {
  dataset: VizDataset<TProperties>;
  index: VizDatasetIndex<TProperties>;
  version?: number;
};

export type VizEngineLayerRecord = {
  layer: VizLayer;
  version?: number;
};
