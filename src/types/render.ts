import type {
  VizBackendOption,
  VizBackendConfig,
  VizBackendImplementation,
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
  VizIndexedGeoFlow,
  VizIndexedGeoPoint,
  VizMapDisplayMode,
} from "./geo";

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
  | VizFinanceDataset<TProperties>;

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

export type VizFrameFormat = "objects" | "typed";

export type VizObjectComputeFrameOptions =
  | {
      frameFormat: "objects";
      /** @deprecated Use frameFormat: "objects". */
      outputMode?: "object";
      viewport: VizViewport;
    }
  | {
      frameFormat?: "objects";
      /** @deprecated Use frameFormat: "objects". */
      outputMode: "object";
      viewport: VizViewport;
    };

export type VizCompactComputeFrameOptions = {
  frameFormat?: "typed";
  /** @deprecated Use frameFormat: "typed". */
  outputMode: "compact";
  viewport: VizViewport;
};

export type VizTypedComputeFrameOptions = {
  frameFormat?: "typed";
  /** @deprecated Use frameFormat: "typed". */
  outputMode?: "compact";
  viewport: VizViewport;
};

export type VizComputeFrameOptions =
  | VizObjectComputeFrameOptions
  | VizCompactComputeFrameOptions
  | VizTypedComputeFrameOptions;

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
    };

export type VizTypedCartesianRenderLayer =
  | {
      bounds: VizRenderBounds | null;
      /** @deprecated Use typedSeries. */
      compactSeries: VizCompactDensitySeries;
      datasetId: VizDatasetId;
      kind: "binned-series";
      layerId: VizLayerId;
      /** @deprecated Use frameFormat on computeFrame options. */
      outputMode: "compact";
      typedSeries: VizCompactDensitySeries;
      valueMode: VizValueMode;
    }
  | {
      bounds: VizRenderBounds | null;
      /** @deprecated Use typedHistogram. */
      compactHistogram: VizCompactHistogram;
      datasetId: VizDatasetId;
      kind: "histogram";
      layerId: VizLayerId;
      /** @deprecated Use frameFormat on computeFrame options. */
      outputMode: "compact";
      typedHistogram: VizCompactHistogram;
    }
  | {
      bounds: VizRenderBounds | null;
      /** @deprecated Use typedHeatmap. */
      compactHeatmap: VizCompactHeatmap;
      datasetId: VizDatasetId;
      kind: "heatmap";
      layerId: VizLayerId;
      /** @deprecated Use frameFormat on computeFrame options. */
      outputMode: "compact";
      typedHeatmap: VizCompactHeatmap;
    }
  | {
      bounds: VizRenderBounds | null;
      /** @deprecated Use typedRollingSeries. */
      compactRollingSeries: VizCompactRollingSeries;
      datasetId: VizDatasetId;
      kind: "rolling-series";
      layerId: VizLayerId;
      /** @deprecated Use frameFormat on computeFrame options. */
      outputMode: "compact";
      statistic: VizRollingStatistic;
      typedRollingSeries: VizCompactRollingSeries;
    };

/** @deprecated Use VizTypedCartesianRenderLayer. */
export type VizCompactCartesianRenderLayer = VizTypedCartesianRenderLayer;

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

export type VizAnyRenderLayer<TProperties = Record<string, unknown>> =
  | VizRenderLayer<TProperties>
  | VizTypedCartesianRenderLayer
  | VizTypedFinanceRenderLayer;

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

export type VizCompactRenderFrame<TProperties = Record<string, unknown>> = Omit<
  VizRenderFrame<TProperties>,
  "layers"
> & {
  layers: Array<VizRenderLayer<TProperties> | VizTypedCartesianRenderLayer>;
};

export type VizTypedRenderFrame<TProperties = Record<string, unknown>> = Omit<
  VizRenderFrame<TProperties>,
  "layers"
> & {
  layers: Array<
    VizRenderLayer<TProperties> | VizTypedCartesianRenderLayer | VizTypedFinanceRenderLayer
  >;
};

export type VizAnyRenderFrame<TProperties = Record<string, unknown>> =
  | VizRenderFrame<TProperties>
  | VizCompactRenderFrame<TProperties>
  | VizTypedRenderFrame<TProperties>;

export type VizHitTestOptions = {
  viewport?: VizViewport;
  x: number;
  y: number;
};

export type VizCartesianHitTestResult = {
  datasetId: VizDatasetId;
  kind: "cartesian";
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
  kind: "geo-point";
  layerId: VizLayerId;
  point: VizIndexedGeoPoint<TProperties>;
};

export type VizGeoFlowHitTestResult<TProperties = Record<string, unknown>> = {
  datasetId: VizDatasetId;
  flow: VizIndexedGeoFlow<TProperties>;
  kind: "geo-flow";
  layerId: VizLayerId;
};

export type VizGeoJsonHitTestResult = {
  datasetId: VizDatasetId;
  featureIndex: number;
  kind: "geojson";
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
  computeFrame(options: VizObjectComputeFrameOptions): VizRenderFrame<TProperties>;
  computeFrame(options: VizCompactComputeFrameOptions): VizCompactRenderFrame<TProperties>;
  computeFrame(options: VizTypedComputeFrameOptions): VizTypedRenderFrame<TProperties>;
  getDatasetCount(): number;
  getLayerCount(): number;
  hydrateFrame(frame: VizAnyRenderFrame<TProperties>): VizRenderFrame<TProperties>;
  hydrateLayer(layer: VizAnyRenderLayer<TProperties>): VizRenderLayer<TProperties> | null;
  hitTest(options: VizHitTestOptions): VizHitTestResult<TProperties> | null;
  removeDataset(datasetId: VizDatasetId): void;
  removeLayer(layerId: VizLayerId): void;
};

export type VizEngineBackend<TProperties = Record<string, unknown>> = {
  createIndex(dataset: VizDataset<TProperties>): VizDatasetIndex<TProperties>;
  option: Required<VizBackendConfig>;
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
    };

export type VizEngineDatasetRecord<TProperties = Record<string, unknown>> = {
  dataset: VizDataset<TProperties>;
  index: VizDatasetIndex<TProperties>;
};
