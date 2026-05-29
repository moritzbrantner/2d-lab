import type {
  ChartDensityIndex,
  ChartDensitySeries,
  ChartHeatmap,
  ChartHistogram,
  ChartRenderData,
  ChartSeriesPoint,
  ChartValueMode,
} from "@moritzbrantner/charts";

export type VizDatasetId = string;
export type VizLayerId = string;

export type VizBackendOption = "auto" | "js" | "wasm";
export type VizResolvedBackend = "js" | "wasm";

export type VizDataset<TProperties = Record<string, unknown>> = {
  kind: "xy";
  points: readonly ChartSeriesPoint<TProperties>[];
};

export type VizLayer =
  | {
      datasetId: VizDatasetId;
      includeEmptyBins?: boolean;
      kind: "binned-series";
      targetBinCount: number;
      valueMode?: ChartValueMode;
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
    };

export type VizViewport = {
  height: number;
  width: number;
  xDomain: [number, number];
};

export type VizComputeFrameOptions = {
  viewport: VizViewport;
};

export type VizRenderBounds = [number, number, number, number];

export type VizRenderLayer<TProperties = Record<string, unknown>> =
  | {
      bounds: VizRenderBounds | null;
      datasetId: VizDatasetId;
      kind: "binned-series";
      layerId: VizLayerId;
      rows: ChartRenderData<TProperties>["rows"];
      series: ChartDensitySeries<TProperties>;
    }
  | {
      bounds: VizRenderBounds | null;
      buckets: ChartHistogram<TProperties>["buckets"];
      datasetId: VizDatasetId;
      kind: "histogram";
      layerId: VizLayerId;
    }
  | {
      bounds: VizRenderBounds | null;
      cells: ChartHeatmap<TProperties>["cells"];
      datasetId: VizDatasetId;
      kind: "heatmap";
      layerId: VizLayerId;
    };

export type VizRenderFrame<TProperties = Record<string, unknown>> = {
  layers: Array<VizRenderLayer<TProperties>>;
  stats: {
    backend: VizResolvedBackend;
    computeMs: number;
    datasetCount: number;
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
  createIndex(dataset: VizDataset<TProperties>): ChartDensityIndex<TProperties>;
  option: VizBackendOption;
  resolveBackend(index: ChartDensityIndex<TProperties>): VizResolvedBackend;
};

export type VizEngineDatasetRecord<TProperties = Record<string, unknown>> = {
  dataset: VizDataset<TProperties>;
  index: ChartDensityIndex<TProperties>;
};
