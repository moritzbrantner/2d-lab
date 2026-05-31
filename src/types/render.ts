import type {
  VizBackendOption,
  VizBackendImplementation,
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
} from "./core";
import type {
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
    }
  | VizFinanceDataset<TProperties>;

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
      alpha?: number;
      datasetId: VizDatasetId;
      kind: "rolling-series";
      minPeriods?: number;
      statistic?: VizRollingStatistic;
      windowSize: number;
      xDomain: [number, number];
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

export type VizComputeFrameOptions = {
  viewport: VizViewport;
};

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
      bounds: VizRenderBounds | null;
      datasetId: VizDatasetId;
      kind: "rolling-series";
      layerId: VizLayerId;
      rows: Array<VizRenderDatum<TProperties>>;
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
      rows: Array<VizRenderDatum<TProperties>>;
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
  computeFrame(options: VizComputeFrameOptions): VizRenderFrame<TProperties>;
  getDatasetCount(): number;
  getLayerCount(): number;
  hitTest(options: VizHitTestOptions): VizHitTestResult<TProperties> | null;
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
