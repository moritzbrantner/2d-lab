import type {
  VizCartesianViewport,
  VizComputeFrameOptions,
  VizDensityIndex,
  VizDensitySeries,
  VizEngineDatasetRecord,
  VizFinanceIndex,
  VizFrameDiagnostic,
  VizGeoFlowIndex,
  VizGeoJsonIndex,
  VizGeoPointIndex,
  VizGeoViewport,
  VizLayer,
  VizLayerId,
  VizRenderBounds,
  VizRenderDatum,
  VizValueMode,
} from "../types";

export function now() {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}

export function createVizRenderRows<TProperties>(
  series: VizDensitySeries<TProperties>,
  valueMode: VizValueMode = "average",
): Array<VizRenderDatum<TProperties>> {
  return series.samples.map((sample) => ({
    average: sample.averageY,
    count: sample.pointCount,
    index: sample.index,
    label: sample.firstPoint?.label ?? sample.x.toString(),
    max: sample.maxY,
    metrics: sample.metrics,
    min: sample.minY,
    pointCount: sample.pointCount,
    sample,
    sum: sample.pointCount > 0 ? sample.sumY : null,
    value: getSampleRenderValue(sample, valueMode),
    x: sample.x,
    x0: sample.x0,
    x1: sample.x1,
  }));
}

export function getSeriesBounds<TProperties>(
  series: VizDensitySeries<TProperties>,
): VizRenderBounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let hasSamples = false;

  for (const sample of series.samples) {
    if (sample.y === null) {
      continue;
    }

    hasSamples = true;
    minX = Math.min(minX, sample.x0);
    maxX = Math.max(maxX, sample.x1);
    minY = Math.min(minY, sample.y);
    maxY = Math.max(maxY, sample.y);
  }

  if (!hasSamples) {
    return null;
  }

  return [minX, minY, maxX, maxY];
}

export function getDensityIndex<TProperties>(
  layerId: VizLayerId,
  layerKind: VizLayer["kind"],
  datasetRecord: VizEngineDatasetRecord<TProperties>,
  diagnostics: VizFrameDiagnostic[],
): VizDensityIndex<TProperties> | null {
  if (datasetRecord.index.kind === "xy") {
    return datasetRecord.index.index;
  }

  pushIncompatibleLayerDiagnostic(layerId, layerKind, datasetRecord.dataset.kind, diagnostics);
  return null;
}

export function getGeoPointIndex<TProperties>(
  layerId: VizLayerId,
  layerKind: VizLayer["kind"],
  datasetRecord: VizEngineDatasetRecord<TProperties>,
  diagnostics: VizFrameDiagnostic[],
): VizGeoPointIndex<TProperties> | null {
  if (datasetRecord.index.kind === "geo-points") {
    return datasetRecord.index.index;
  }

  pushIncompatibleLayerDiagnostic(layerId, layerKind, datasetRecord.dataset.kind, diagnostics);
  return null;
}

export function getGeoJsonIndex<TProperties>(
  layerId: VizLayerId,
  layerKind: VizLayer["kind"],
  datasetRecord: VizEngineDatasetRecord<TProperties>,
  diagnostics: VizFrameDiagnostic[],
): VizGeoJsonIndex<TProperties> | null {
  if (datasetRecord.index.kind === "geojson") {
    return datasetRecord.index.index;
  }

  pushIncompatibleLayerDiagnostic(layerId, layerKind, datasetRecord.dataset.kind, diagnostics);
  return null;
}

export function getGeoFlowIndex<TProperties>(
  layerId: VizLayerId,
  layerKind: VizLayer["kind"],
  datasetRecord: VizEngineDatasetRecord<TProperties>,
  diagnostics: VizFrameDiagnostic[],
): VizGeoFlowIndex<TProperties> | null {
  if (datasetRecord.index.kind === "geo-flows") {
    return datasetRecord.index.index;
  }

  pushIncompatibleLayerDiagnostic(layerId, layerKind, datasetRecord.dataset.kind, diagnostics);
  return null;
}

export function getFinanceIndex<TProperties>(
  layerId: VizLayerId,
  layerKind: VizLayer["kind"],
  datasetRecord: VizEngineDatasetRecord<TProperties>,
  diagnostics: VizFrameDiagnostic[],
): VizFinanceIndex<TProperties> | null {
  if (datasetRecord.index.kind === "finance-ohlcv") {
    return datasetRecord.index.index;
  }

  pushIncompatibleLayerDiagnostic(layerId, layerKind, datasetRecord.dataset.kind, diagnostics);
  return null;
}

export function isCartesianViewport(
  viewport: VizComputeFrameOptions["viewport"],
  layerId: VizLayerId,
  diagnostics: VizFrameDiagnostic[],
): viewport is VizCartesianViewport {
  if (viewport.kind === "geo") {
    diagnostics.push({
      code: "incompatible-viewport",
      layerId,
      message: `Layer ${layerId} needs a cartesian viewport.`,
      severity: "warning",
    });
    return false;
  }

  return true;
}

export function getGeoViewport(
  viewport: VizComputeFrameOptions["viewport"],
  layerId: VizLayerId,
  diagnostics: VizFrameDiagnostic[],
): VizGeoViewport | null {
  if (viewport.kind === "geo") {
    return viewport;
  }

  diagnostics.push({
    code: "incompatible-viewport",
    layerId,
    message: `Layer ${layerId} needs a geo viewport.`,
    severity: "warning",
  });
  return null;
}

function getSampleRenderValue<TProperties>(
  sample: VizDensitySeries<TProperties>["samples"][number],
  valueMode: VizValueMode,
) {
  switch (valueMode) {
    case "average":
      return sample.averageY;
    case "count":
      return sample.pointCount;
    case "max":
      return sample.maxY;
    case "min":
      return sample.minY;
    case "sum":
      return sample.pointCount > 0 ? sample.sumY : null;
  }
}

function pushIncompatibleLayerDiagnostic(
  layerId: VizLayerId,
  layerKind: VizLayer["kind"],
  datasetKind: VizEngineDatasetRecord["dataset"]["kind"],
  diagnostics: VizFrameDiagnostic[],
) {
  diagnostics.push({
    code: "incompatible-layer-dataset",
    layerId,
    message: `Layer ${layerId} of kind ${layerKind} cannot render dataset kind ${datasetKind}.`,
    severity: "warning",
  });
}
