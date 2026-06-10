import { createRollingRenderRows, createVizRenderRows } from "./render-frame/utils";

import type {
  VizAnyRenderFrame,
  VizAnyRenderLayer,
  VizCompactDensitySeries,
  VizCompactFinanceReturns,
  VizCompactHeatmap,
  VizCompactHistogram,
  VizCompactOhlcvBars,
  VizCompactRollingSeries,
  VizDensityBin,
  VizDensitySample,
  VizGeoAggregationFeature,
  VizGeoFlowFeature,
  VizGeoHeatFeature,
  VizHeatmapCell,
  VizHistogramBucket,
  VizIndexedGeoFlow,
  VizIndexedGeoPoint,
  VizOhlcvBar,
  VizRenderDatum,
  VizRenderFrame,
  VizRenderLayer,
  VizTableCellValue,
  VizTableResult,
  VizTypedGeoClusters,
  VizTypedGeoFlows,
  VizTypedGeoHeat,
  VizTypedGeoPoints,
  VizTypedGeoScalarField,
  VizTypedTable,
} from "./types";

export function hydrateVizRenderFrame<TProperties = Record<string, unknown>>(
  frame: VizAnyRenderFrame<TProperties>,
): VizRenderFrame<TProperties> {
  return {
    layers: frame.layers
      .map((layer) => hydrateVizRenderLayer(layer))
      .filter((layer): layer is VizRenderLayer<TProperties> => layer != null),
    stats: frame.stats,
  };
}

export function hydrateVizRenderLayer<TProperties = Record<string, unknown>>(
  layer: VizAnyRenderLayer<TProperties>,
): VizRenderLayer<TProperties> | null {
  const record = layer as Record<string, unknown>;
  const bounds = "bounds" in layer ? layer.bounds : null;

  if ("typedSeries" in record) {
    const typedLayer = layer as {
      typedSeries: VizCompactDensitySeries;
      valueMode: VizCompactDensitySeries["summary"]["valueMode"];
    };
    const series = densitySeriesFromTyped<TProperties>(typedLayer.typedSeries);
    return {
      bounds,
      datasetId: layer.datasetId,
      kind: "binned-series",
      layerId: layer.layerId,
      rows: createVizRenderRows(series, typedLayer.valueMode),
      series,
    };
  }

  if ("typedHistogram" in record) {
    const typedLayer = layer as {
      typedHistogram: VizCompactHistogram;
    };
    const histogram = histogramFromTyped<TProperties>(typedLayer.typedHistogram);
    return {
      bounds,
      buckets: histogram.buckets,
      datasetId: layer.datasetId,
      kind: "histogram",
      layerId: layer.layerId,
    };
  }

  if ("typedHeatmap" in record) {
    const typedLayer = layer as {
      typedHeatmap: VizCompactHeatmap;
    };
    const heatmap = heatmapFromTyped<TProperties>(typedLayer.typedHeatmap);
    return {
      bounds,
      cells: heatmap.cells,
      datasetId: layer.datasetId,
      kind: "heatmap",
      layerId: layer.layerId,
    };
  }

  if ("typedRollingSeries" in record) {
    const typedLayer = layer as {
      statistic: VizCompactRollingSeries["summary"]["statistic"];
      typedRollingSeries: VizCompactRollingSeries;
    };
    const series = rollingSeriesFromTyped<TProperties>(typedLayer.typedRollingSeries);
    return {
      bounds,
      datasetId: layer.datasetId,
      kind: "rolling-series",
      layerId: layer.layerId,
      rows: createRollingRenderRows(series),
      series,
      statistic: typedLayer.statistic,
    };
  }

  if ("typedCandles" in record) {
    const typedLayer = layer as {
      instrument: Extract<
        VizAnyRenderLayer<TProperties>,
        { kind: "finance-candles" }
      >["instrument"];
      typedCandles: VizCompactOhlcvBars;
    };
    return {
      bars: ohlcvBarsFromTyped<TProperties>(typedLayer.typedCandles),
      bounds,
      datasetId: layer.datasetId,
      instrument: typedLayer.instrument,
      kind: "finance-candles",
      layerId: layer.layerId,
    };
  }

  if ("typedFinanceLine" in record) {
    const typedLayer = layer as Extract<VizAnyRenderLayer<TProperties>, { kind: "finance-line" }>;
    return {
      bounds,
      datasetId: layer.datasetId,
      kind: "finance-line",
      layerId: layer.layerId,
      rows: rowsFromTypedFinance<TProperties>(typedLayer.typedFinanceLine),
    };
  }

  if ("typedReturns" in record) {
    const typedLayer = layer as Extract<
      VizAnyRenderLayer<TProperties>,
      { kind: "finance-returns" }
    >;
    return {
      bounds,
      datasetId: layer.datasetId,
      kind: "finance-returns",
      layerId: layer.layerId,
      rows: rowsFromTypedFinance<TProperties>(typedLayer.typedReturns),
    };
  }

  if ("typedGeoClusters" in record) {
    const typedLayer = layer as { typedGeoClusters: VizTypedGeoClusters };
    const aggregation = geoAggregationFromTyped<TProperties>(typedLayer.typedGeoClusters);

    return {
      aggregation,
      bounds,
      datasetId: layer.datasetId,
      features: aggregation.features,
      kind: "geo-clusters",
      layerId: layer.layerId,
    };
  }

  if ("typedGeoPoints" in record) {
    const typedLayer = layer as { typedGeoPoints: VizTypedGeoPoints };

    return {
      bounds,
      datasetId: layer.datasetId,
      features: geoPointsFromTyped<TProperties>(typedLayer.typedGeoPoints),
      kind: "geo-points",
      layerId: layer.layerId,
    };
  }

  if ("typedGeoHeat" in record) {
    const typedLayer = layer as { maxWeight: number; typedGeoHeat: VizTypedGeoHeat };

    return {
      bounds,
      datasetId: layer.datasetId,
      features: geoHeatFromTyped<TProperties>(typedLayer.typedGeoHeat),
      kind: "geo-heat",
      layerId: layer.layerId,
      maxWeight: typedLayer.maxWeight,
    };
  }

  if ("typedGeoScalarField" in record) {
    const typedLayer = layer as { typedGeoScalarField: VizTypedGeoScalarField };

    return {
      bounds,
      datasetId: layer.datasetId,
      grid: geoScalarFieldFromTyped(typedLayer.typedGeoScalarField),
      kind: "geo-scalar-field",
      layerId: layer.layerId,
    };
  }

  if ("typedGeoFlows" in record) {
    const typedLayer = layer as { typedGeoFlows: VizTypedGeoFlows };
    const aggregation = geoFlowsFromTyped<TProperties>(typedLayer.typedGeoFlows);

    return {
      aggregation,
      bounds,
      datasetId: layer.datasetId,
      features: aggregation.features,
      kind: "geo-flows",
      layerId: layer.layerId,
    };
  }

  if ("typedTable" in record) {
    const typedLayer = layer as { typedTable: VizTypedTable };

    return {
      datasetId: layer.datasetId,
      kind: "table",
      layerId: layer.layerId,
      table: tableFromTyped(typedLayer.typedTable),
    };
  }

  return layer as VizRenderLayer<TProperties>;
}

function tableFromTyped(table: VizTypedTable): VizTableResult {
  return {
    columns: table.columns,
    rows: Array.from({ length: table.sourceIndex.length }, (_, rowIndex) => ({
      cells: table.typedColumns.map((column) => ({
        columnId: column.id,
        value: column.validity[rowIndex] === 0 ? null : tableCellValueAt(column, rowIndex),
      })),
      rowId: table.rowIds[rowIndex] ?? String(table.sourceIndex[rowIndex] ?? rowIndex),
      sourceIndex: table.sourceIndex[rowIndex] ?? rowIndex,
    })),
    summary: table.summary,
  };
}

function tableCellValueAt(
  column: VizTypedTable["typedColumns"][number],
  rowIndex: number,
): VizTableCellValue | null {
  switch (column.type) {
    case "boolean":
      return column.values[rowIndex] === 1;
    case "date":
    case "number":
      return finiteOrNull(column.values[rowIndex]);
    case "json":
    case "string":
    case "unknown":
      return hydrateTableCellValue(column.values[rowIndex]);
  }
}

function hydrateTableCellValue(value: unknown): VizTableCellValue | null {
  if (value == null) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    Array.isArray(value)
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "object") {
    return value as Record<string, unknown>;
  }

  return String(value);
}

function densitySeriesFromTyped<TProperties>(series: VizCompactDensitySeries): {
  bins: Array<VizDensityBin<TProperties>>;
  samples: Array<VizDensitySample<TProperties>>;
  summary: {
    binCount: number;
    metrics: Record<string, number>;
    pointCount: number;
    sampleCount: number;
    valueMode: VizCompactDensitySeries["summary"]["valueMode"];
    xDomain: [number, number];
  };
} {
  const bins = Array.from({ length: series.y.length }, (_, index) => {
    const metrics = metricsAt(series.metrics, series.summary.metricKeys, index);
    const bin: VizDensityBin<TProperties> = {
      averageY: finiteOrNull(series.averageY[index]),
      firstPoint: null,
      firstPointIndex: nullableIndex(series.firstPointIndex[index]),
      index,
      lastPoint: null,
      lastPointIndex: nullableIndex(series.lastPointIndex[index]),
      maxY: finiteOrNull(series.maxY[index]),
      metrics,
      minY: finiteOrNull(series.minY[index]),
      pointCount: series.pointCount[index] ?? 0,
      sumY: series.sumY[index] ?? 0,
      x0: series.x0[index] ?? 0,
      x1: series.x1[index] ?? 0,
    };

    return bin;
  });
  const samples = bins.map(
    (bin): VizDensitySample<TProperties> => ({
      ...bin,
      x: (bin.x0 + bin.x1) / 2,
      y: finiteOrNull(series.y[bin.index]),
    }),
  );

  return {
    bins,
    samples,
    summary: {
      ...series.summary,
      metrics: sumTypedMetrics(series.metrics, series.summary.metricKeys),
    },
  };
}

function histogramFromTyped<TProperties>(histogram: VizCompactHistogram) {
  const buckets = Array.from({ length: histogram.value.length }, (_, index) => {
    const bucket: VizHistogramBucket<TProperties> = {
      averageValue: finiteOrNull(histogram.averageValue[index]),
      firstPoint: null,
      firstPointIndex: nullableIndex(histogram.firstPointIndex[index]),
      index,
      lastPoint: null,
      lastPointIndex: nullableIndex(histogram.lastPointIndex[index]),
      maxValue: finiteOrNull(histogram.maxValue[index]),
      metrics: metricsAt(histogram.metrics, histogram.summary.metricKeys, index),
      minValue: finiteOrNull(histogram.minValue[index]),
      pointCount: histogram.pointCount[index] ?? 0,
      sumValue: histogram.sumValue[index] ?? 0,
      value: histogram.value[index] ?? 0,
      value0: histogram.value0[index] ?? 0,
      value1: histogram.value1[index] ?? 0,
    };

    return bucket;
  });

  return {
    buckets,
    summary: {
      ...histogram.summary,
      metrics: sumTypedMetrics(histogram.metrics, histogram.summary.metricKeys),
    },
  };
}

function heatmapFromTyped<TProperties>(heatmap: VizCompactHeatmap) {
  const xWidth =
    (heatmap.summary.xDomain[1] - heatmap.summary.xDomain[0]) / heatmap.summary.xBinCount;
  const yWidth =
    (heatmap.summary.yDomain[1] - heatmap.summary.yDomain[0]) / heatmap.summary.yBinCount;
  const cells = Array.from({ length: heatmap.value.length }, (_, index) => {
    const xIndex = heatmap.xIndex[index] ?? 0;
    const yIndex = heatmap.yIndex[index] ?? 0;
    const x0 = heatmap.summary.xDomain[0] + xIndex * xWidth;
    const y0 = heatmap.summary.yDomain[0] + yIndex * yWidth;
    const cell: VizHeatmapCell<TProperties> = {
      averageValue: finiteOrNull(heatmap.averageValue[index]),
      firstPoint: null,
      firstPointIndex: nullableIndex(heatmap.firstPointIndex[index]),
      index,
      lastPoint: null,
      lastPointIndex: nullableIndex(heatmap.lastPointIndex[index]),
      metrics: metricsAt(heatmap.metrics, heatmap.summary.metricKeys, index),
      pointCount: heatmap.pointCount[index] ?? 0,
      sumValue: heatmap.sumValue[index] ?? 0,
      value: heatmap.value[index] ?? 0,
      x: x0 + xWidth / 2,
      x0,
      x1: x0 + xWidth,
      xIndex,
      y: y0 + yWidth / 2,
      y0,
      y1: y0 + yWidth,
      yIndex,
    };

    return cell;
  });

  return {
    cells,
    summary: {
      ...heatmap.summary,
      metrics: sumTypedMetrics(heatmap.metrics, heatmap.summary.metricKeys),
    },
  };
}

function rollingSeriesFromTyped<TProperties>(series: VizCompactRollingSeries) {
  const points = Array.from({ length: series.x.length }, (_, index) => ({
    ema: finiteOrNull(series.ema[index]),
    index,
    max: finiteOrNull(series.max[index]),
    mean: finiteOrNull(series.mean[index]),
    min: finiteOrNull(series.min[index]),
    pointCount: series.pointCount[index] ?? 0,
    sourcePoint: null,
    sourcePointIndex: nullableIndex(series.sourcePointIndex[index]),
    statistic: series.summary.statistic,
    stdDev: finiteOrNull(series.stdDev[index]),
    sum: finiteOrNull(series.sum[index]),
    windowSize: series.summary.windowSize,
    x: series.x[index] ?? 0,
    y: finiteOrNull(series.y[index]),
    zScore: finiteOrNull(series.zScore[index]),
  }));

  return {
    points,
    summary: series.summary,
  };
}

function ohlcvBarsFromTyped<TProperties>(
  bars: VizCompactOhlcvBars,
): Array<VizOhlcvBar<TProperties>> {
  return Array.from({ length: bars.timestamp.length }, (_, index) => ({
    adjustedClose: finiteOrUndefined(bars.adjustedClose[index]),
    close: bars.close[index] ?? 0,
    high: bars.high[index] ?? 0,
    low: bars.low[index] ?? 0,
    open: bars.open[index] ?? 0,
    timestamp: bars.timestamp[index] ?? 0,
    volume: finiteOrUndefined(bars.volume[index]),
  }));
}

function rowsFromTypedFinance<TProperties>(
  series: VizCompactFinanceReturns,
): Array<VizRenderDatum<TProperties>> {
  return Array.from({ length: series.x.length }, (_, index) => {
    const value = finiteOrNull(series.y[index]);
    const x = series.x[index] ?? 0;
    const pointCount = series.pointCount[index] ?? 0;

    return {
      average: value,
      count: pointCount,
      index,
      label: String(x),
      max: value,
      metrics: {},
      min: value,
      pointCount,
      sum: value == null ? 0 : value * pointCount,
      value,
      x,
      x0: x,
      x1: x,
    };
  });
}

function geoPointsFromTyped<TProperties>(
  points: VizTypedGeoPoints,
): Array<VizIndexedGeoPoint<TProperties>> {
  return Array.from({ length: points.longitude.length }, (_, index) =>
    geoPointAt<TProperties>(points, index),
  );
}

function geoHeatFromTyped<TProperties>(
  heat: VizTypedGeoHeat,
): Array<VizGeoHeatFeature<TProperties>> {
  const points = geoPointsFromTyped<TProperties>(heat);

  return points.map((point, index) => ({
    coordinates: [point.longitude, point.latitude],
    id: heat.id[index] ?? String(index),
    label: heat.label[index] ?? "",
    metrics: point.metrics,
    point,
    pointCount: heat.pointCount[index] ?? 0,
    rawWeight: heat.rawWeight[index] ?? 0,
    value: heat.value[index] ?? 0,
  }));
}

function geoAggregationFromTyped<TProperties>(clusters: VizTypedGeoClusters) {
  const features: Array<VizGeoAggregationFeature<TProperties>> = Array.from(
    { length: clusters.longitude.length },
    (_, index) => {
      const metrics = metricsAt(clusters.metrics, clusters.summary.metricKeys, index);
      const coordinates: [longitude: number, latitude: number] = [
        clusters.longitude[index] ?? 0,
        clusters.latitude[index] ?? 0,
      ];

      if (clusters.kindCode[index] === 1) {
        return {
          clusterId: clusters.clusterId[index] ?? -1,
          coordinates,
          expansionZoom: clusters.expansionZoom[index] ?? -1,
          kind: "cluster",
          metrics,
          pointCount: clusters.pointCount[index] ?? 0,
          pointCountAbbreviated: clusters.label[index] ?? String(clusters.pointCount[index] ?? 0),
        };
      }

      const point: VizIndexedGeoPoint<TProperties> = {
        id: clusters.id[index] ?? String(index),
        label: clusters.label[index] ?? "",
        latitude: coordinates[1],
        longitude: coordinates[0],
        metrics,
        properties: {} as TProperties,
        sourceIndex: clusters.sourceIndex[index] ?? index,
      };

      return {
        coordinates,
        kind: "point",
        metrics,
        point,
      };
    },
  );

  return {
    features,
    summary: {
      bounds: clusters.summary.bounds ?? [0, 0, 0, 0],
      metrics: sumTypedMetrics(clusters.metrics, clusters.summary.metricKeys),
      visibleClusterCount: features.filter((feature) => feature.kind === "cluster").length,
      visiblePointCount: features.reduce(
        (sum, feature) => sum + (feature.kind === "cluster" ? feature.pointCount : 1),
        0,
      ),
      visibleUnclusteredCount: features.filter((feature) => feature.kind === "point").length,
      zoom: 0,
    },
  };
}

function geoScalarFieldFromTyped(field: VizTypedGeoScalarField) {
  return {
    bounds: field.bounds,
    columns: field.columns,
    rows: field.rows,
    valueDomain: field.valueDomain,
    values: Array.from(field.values, (value) => finiteOrNull(value)),
  };
}

function geoFlowsFromTyped<TProperties>(flows: VizTypedGeoFlows) {
  const features: Array<VizGeoFlowFeature<TProperties>> = Array.from(
    { length: flows.fromLongitude.length },
    (_, index) => {
      const flow: VizIndexedGeoFlow<TProperties> = {
        from: [flows.fromLongitude[index] ?? 0, flows.fromLatitude[index] ?? 0],
        id: flows.id[index] ?? String(index),
        label: flows.label[index] ?? "",
        metrics: metricsAt(flows.metrics, flows.summary.metricKeys, index),
        properties: {} as TProperties,
        sourceIndex: flows.sourceIndex[index] ?? index,
        to: [flows.toLongitude[index] ?? 0, flows.toLatitude[index] ?? 0],
      };

      return {
        flow,
        rawWeight: flows.rawWeight[index] ?? 0,
        value: flows.value[index] ?? 0,
      };
    },
  );

  return {
    features,
    summary: {
      bounds: flows.summary.bounds,
      maxWeight: flows.summary.maxWeight,
      metrics: sumTypedMetrics(flows.metrics, flows.summary.metricKeys),
      viewportBounds: flows.summary.bounds ?? [0, 0, 0, 0],
      visibleFlowCount: flows.summary.flowCount,
      zoom: 0,
    },
  };
}

function geoPointAt<TProperties>(
  points: VizTypedGeoPoints,
  index: number,
): VizIndexedGeoPoint<TProperties> {
  return {
    id: points.id[index] ?? String(index),
    label: points.label[index] ?? "",
    latitude: points.latitude[index] ?? 0,
    longitude: points.longitude[index] ?? 0,
    metrics: metricsAt(points.metrics, points.summary.metricKeys, index),
    properties: {} as TProperties,
    sourceIndex: points.sourceIndex[index] ?? index,
  };
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

function sumTypedMetrics(
  metrics: Record<string, Float64Array> | undefined,
  metricKeys: readonly string[],
) {
  const output: Record<string, number> = {};
  for (const metricKey of metricKeys) {
    let sum = 0;
    for (const value of metrics?.[metricKey] ?? []) {
      sum += value;
    }
    output[metricKey] = sum;
  }
  return output;
}

function nullableIndex(value: number | undefined) {
  return value == null || value < 0 ? null : value;
}

function finiteOrNull(value: number | undefined) {
  return value == null || Number.isNaN(value) ? null : value;
}

function finiteOrUndefined(value: number | undefined) {
  return value == null || Number.isNaN(value) ? undefined : value;
}
