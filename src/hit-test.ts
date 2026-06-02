import type {
  VizAnyRenderFrame,
  VizAnyRenderLayer,
  VizCartesianHitTestResult,
  VizCompactDensitySeries,
  VizCompactFinanceReturns,
  VizCompactHeatmap,
  VizCompactHistogram,
  VizCompactOhlcvBars,
  VizCompactRollingSeries,
  VizGeoBounds,
  VizGeoFlowHitTestResult,
  VizGeoJsonFeatureCollection,
  VizGeoJsonHitTestResult,
  VizGeoPointHitTestResult,
  VizHitTestOptions,
  VizHitTestResult,
  VizIndexedGeoFlow,
  VizIndexedGeoPoint,
  VizLayer,
  VizRenderBounds,
  VizRenderDatum,
  VizTypedGeoClusters,
  VizTypedGeoFlows,
  VizTypedGeoHeat,
  VizTypedGeoPoints,
  VizViewport,
} from "./types";

type HitLayerBase = {
  bounds: VizGeoBounds | VizRenderBounds | null;
  datasetId: string;
  kind: VizLayer["kind"];
  layerId: string;
};

export function hitTestVizFrame<TProperties = Record<string, unknown>>(
  frame: VizAnyRenderFrame<TProperties> | null,
  options: VizHitTestOptions<TProperties>,
): VizHitTestResult<TProperties> | null {
  if (!frame || !options.viewport) {
    return null;
  }

  const layerIds = options.layerIds ? new Set(options.layerIds) : null;
  const layers = layerIds
    ? frame.layers.filter((layer) => layerIds.has(layer.layerId))
    : frame.layers;
  const result =
    options.viewport.kind === "geo"
      ? hitTestGeoLayers(layers, options.viewport, options)
      : hitTestCartesianLayers(layers, options.viewport, options);

  if (result && options.maxDistancePx != null && "distancePx" in result) {
    return (result.distancePx ?? 0) <= options.maxDistancePx ? result : null;
  }

  return result;
}

function hitTestCartesianLayers<TProperties>(
  layers: readonly VizAnyRenderLayer<TProperties>[],
  viewport: Extract<VizViewport, { kind?: "cartesian" }>,
  options: VizHitTestOptions<TProperties>,
): VizHitTestResult<TProperties> | null {
  let nearest: VizHitTestResult<TProperties> | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const layer of layers) {
    const result = hitTestCartesianLayer(layer, viewport, options);
    if (!result) {
      continue;
    }

    const distance = "distancePx" in result ? (result.distancePx ?? 0) : 0;
    if (distance < nearestDistance) {
      nearest = result;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function hitTestCartesianLayer<TProperties>(
  layer: VizAnyRenderLayer<TProperties>,
  viewport: Extract<VizViewport, { kind?: "cartesian" }>,
  options: VizHitTestOptions<TProperties>,
): VizHitTestResult<TProperties> | null {
  switch (layer.kind) {
    case "binned-series":
      return "typedSeries" in layer || "compactSeries" in layer
        ? nearestTypedBinnedSample(
            (
              layer as {
                compactSeries: VizCompactDensitySeries;
                typedSeries?: VizCompactDensitySeries;
              }
            ).typedSeries ?? (layer as { compactSeries: VizCompactDensitySeries }).compactSeries,
            layer,
            viewport,
            options,
          )
        : nearestBinnedSamples(layer.series.samples, layer, viewport, options);
    case "rolling-series":
      return "typedRollingSeries" in layer || "compactRollingSeries" in layer
        ? nearestTypedRollingSample(
            (
              layer as {
                compactRollingSeries: VizCompactRollingSeries;
                typedRollingSeries?: VizCompactRollingSeries;
              }
            ).typedRollingSeries ??
              (layer as { compactRollingSeries: VizCompactRollingSeries }).compactRollingSeries,
            layer,
            viewport,
            options,
          )
        : nearestRollingPoints(layer.series.points, layer, viewport, options);
    case "histogram":
      return "typedHistogram" in layer || "compactHistogram" in layer
        ? hitTestTypedHistogram(
            (
              layer as {
                compactHistogram: VizCompactHistogram;
                typedHistogram?: VizCompactHistogram;
              }
            ).typedHistogram ??
              (layer as { compactHistogram: VizCompactHistogram }).compactHistogram,
            layer,
            options,
          )
        : hitTestObjectHistogram(layer.buckets, layer, options);
    case "heatmap":
      return "typedHeatmap" in layer || "compactHeatmap" in layer
        ? hitTestTypedHeatmap(
            (layer as { compactHeatmap: VizCompactHeatmap; typedHeatmap?: VizCompactHeatmap })
              .typedHeatmap ?? (layer as { compactHeatmap: VizCompactHeatmap }).compactHeatmap,
            layer,
            options,
          )
        : hitTestObjectHeatmap(layer.cells, layer, options);
    case "finance-line":
      return "typedFinanceLine" in layer
        ? nearestTypedFinancePoint(layer.typedFinanceLine, layer, viewport, options)
        : nearestRowsSample(layer.rows, layer, viewport, options);
    case "finance-returns":
      return "typedReturns" in layer
        ? nearestTypedFinancePoint(layer.typedReturns, layer, viewport, options)
        : nearestRowsSample(layer.rows, layer, viewport, options);
    case "finance-candles":
      return "typedCandles" in layer
        ? hitTestTypedCandles(layer.typedCandles, layer, options)
        : hitTestObjectCandles(layer.bars, layer, options);
    default:
      return null;
  }
}

function nearestRowsSample<TProperties>(
  rows: readonly VizRenderDatum<TProperties>[],
  layer: HitLayerBase,
  viewport: Extract<VizViewport, { kind?: "cartesian" }>,
  options: VizHitTestOptions<TProperties>,
): VizCartesianHitTestResult | null {
  const xValue = pixelToDomainX(options.x, viewport.width, viewport.xDomain);
  let nearest: VizCartesianHitTestResult | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  rows.forEach((row, index) => {
    if (row.pointCount <= 0 || row.value == null) {
      return;
    }

    const xDistance = Math.abs(domainXToPixel(row.x, viewport.width, viewport.xDomain) - options.x);
    const yDistance = layer.bounds
      ? Math.abs(
          domainYToPixel(row.value, viewport.height, yDomainFromBounds(layer.bounds)) - options.y,
        )
      : 0;
    const distancePx =
      options.mode === "nearest-point" ? Math.hypot(xDistance, yDistance) : xDistance;
    const domainDistance = Math.abs(row.x - xValue);
    const distance = Number.isFinite(distancePx) ? distancePx : domainDistance;

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = {
        datasetId: layer.datasetId,
        distancePx: distance,
        kind: "cartesian",
        layerId: layer.layerId,
        layerKind: layer.kind,
        pointCount: row.pointCount,
        sampleIndex: row.index ?? index,
        sourcePointId: row.sample?.firstPoint?.id ?? row.sample?.lastPoint?.id ?? null,
        x: row.x,
        y: row.value,
      };
    }
  });

  return nearest;
}

function nearestBinnedSamples<TProperties>(
  samples: ReadonlyArray<{
    firstPoint?: { id?: string } | null;
    index: number;
    lastPoint?: { id?: string } | null;
    pointCount: number;
    x: number;
    x0: number;
    x1: number;
    y: number | null;
  }>,
  layer: HitLayerBase & { kind: "binned-series" },
  viewport: Extract<VizViewport, { kind?: "cartesian" }>,
  options: VizHitTestOptions<TProperties>,
): VizCartesianHitTestResult | null {
  const rows = samples.map(
    (sample): VizRenderDatum<TProperties> => ({
      average: sample.y,
      count: sample.pointCount,
      index: sample.index,
      label: String(sample.x),
      max: sample.y,
      min: sample.y,
      pointCount: sample.pointCount,
      sample: sample as never,
      sum: sample.y,
      value: sample.y,
      x: sample.x,
      x0: sample.x0,
      x1: sample.x1,
    }),
  );
  const result = nearestRowsSample(rows, layer, viewport, options);

  if (result) {
    const sample = samples[result.sampleIndex];
    result.sourcePointId = sample?.firstPoint?.id ?? sample?.lastPoint?.id ?? null;
  }

  return result;
}

function nearestRollingPoints<TProperties>(
  points: ReadonlyArray<{
    index: number;
    pointCount: number;
    sourcePoint?: { id?: string } | null;
    x: number;
    y: number | null;
  }>,
  layer: HitLayerBase & { kind: "rolling-series" },
  viewport: Extract<VizViewport, { kind?: "cartesian" }>,
  options: VizHitTestOptions<TProperties>,
): VizCartesianHitTestResult | null {
  const rows = points.map(
    (point): VizRenderDatum<TProperties> => ({
      average: point.y,
      count: point.pointCount,
      index: point.index,
      label: String(point.x),
      max: point.y,
      min: point.y,
      pointCount: point.pointCount,
      sum: point.y,
      value: point.y,
      x: point.x,
      x0: point.x,
      x1: point.x,
    }),
  );
  const result = nearestRowsSample(rows, layer, viewport, options);

  if (result) {
    result.sourcePointId = points[result.sampleIndex]?.sourcePoint?.id ?? null;
  }

  return result;
}

function nearestTypedBinnedSample<TProperties>(
  series: VizCompactDensitySeries,
  layer: HitLayerBase & { kind: "binned-series" },
  viewport: Extract<VizViewport, { kind?: "cartesian" }>,
  options: VizHitTestOptions<TProperties>,
): VizCartesianHitTestResult | null {
  const rows = Array.from({ length: series.y.length }, (_, index): VizRenderDatum<TProperties> => {
    const x = ((series.x0[index] ?? 0) + (series.x1[index] ?? 0)) / 2;
    const y = finiteOrNull(series.y[index]);

    return {
      average: finiteOrNull(series.averageY[index]),
      count: series.pointCount[index] ?? 0,
      index,
      label: String(x),
      max: finiteOrNull(series.maxY[index]),
      min: finiteOrNull(series.minY[index]),
      pointCount: series.pointCount[index] ?? 0,
      sum: finiteOrNull(series.sumY[index]),
      value: y,
      x,
      x0: series.x0[index] ?? x,
      x1: series.x1[index] ?? x,
    };
  });

  return nearestRowsSample(rows, layer, viewport, options);
}

function nearestTypedRollingSample<TProperties>(
  series: VizCompactRollingSeries,
  layer: HitLayerBase & { kind: "rolling-series" },
  viewport: Extract<VizViewport, { kind?: "cartesian" }>,
  options: VizHitTestOptions<TProperties>,
): VizCartesianHitTestResult | null {
  const rows = Array.from({ length: series.y.length }, (_, index): VizRenderDatum<TProperties> => {
    const x = series.x[index] ?? 0;
    const y = finiteOrNull(series.y[index]);

    return {
      average: finiteOrNull(series.mean[index]),
      count: series.pointCount[index] ?? 0,
      index,
      label: String(x),
      max: finiteOrNull(series.max[index]),
      min: finiteOrNull(series.min[index]),
      pointCount: series.pointCount[index] ?? 0,
      sum: finiteOrNull(series.sum[index]),
      value: y,
      x,
      x0: x,
      x1: x,
    };
  });

  return nearestRowsSample(rows, layer, viewport, options);
}

function nearestTypedFinancePoint<TProperties>(
  series: VizCompactFinanceReturns,
  layer: HitLayerBase & { kind: "finance-line" | "finance-returns" },
  viewport: Extract<VizViewport, { kind?: "cartesian" }>,
  options: VizHitTestOptions<TProperties>,
) {
  const rows = Array.from({ length: series.x.length }, (_, index): VizRenderDatum<TProperties> => {
    const x = series.x[index] ?? 0;
    const y = finiteOrNull(series.y[index]);

    return {
      average: y,
      count: series.pointCount[index] ?? 0,
      index,
      label: String(x),
      max: y,
      min: y,
      pointCount: series.pointCount[index] ?? 0,
      sum: y,
      value: y,
      x,
      x0: x,
      x1: x,
    };
  });

  return nearestRowsSample(rows, layer, viewport, options);
}

function hitTestObjectHistogram<TProperties>(
  buckets: ReadonlyArray<{
    index: number;
    pointCount: number;
    value: number;
    value0: number;
    value1: number;
  }>,
  layer: HitLayerBase & { kind: "histogram" },
  options: VizHitTestOptions<TProperties>,
): VizCartesianHitTestResult | null {
  return nearestRect(
    buckets.map((bucket) => ({
      pointCount: bucket.pointCount,
      sampleIndex: bucket.index,
      value: bucket.pointCount,
      x: bucket.value,
      x0: bucket.value0,
      x1: bucket.value1,
      y0: 0,
      y1: bucket.pointCount,
    })),
    layer,
    options,
  );
}

function hitTestTypedHistogram<TProperties>(
  histogram: VizCompactHistogram,
  layer: HitLayerBase & { kind: "histogram" },
  options: VizHitTestOptions<TProperties>,
) {
  return nearestRect(
    Array.from({ length: histogram.value.length }, (_, index) => ({
      pointCount: histogram.pointCount[index] ?? 0,
      sampleIndex: index,
      value: histogram.pointCount[index] ?? 0,
      x: histogram.value[index] ?? 0,
      x0: histogram.value0[index] ?? 0,
      x1: histogram.value1[index] ?? 0,
      y0: 0,
      y1: histogram.pointCount[index] ?? 0,
    })),
    layer,
    options,
  );
}

function hitTestObjectHeatmap<TProperties>(
  cells: ReadonlyArray<{
    index: number;
    pointCount: number;
    value: number;
    x: number;
    x0: number;
    x1: number;
    y0: number;
    y1: number;
  }>,
  layer: HitLayerBase & { kind: "heatmap" },
  options: VizHitTestOptions<TProperties>,
) {
  return nearestRect(
    cells.map((cell) => ({
      pointCount: cell.pointCount,
      sampleIndex: cell.index,
      value: cell.value,
      x: cell.x,
      x0: cell.x0,
      x1: cell.x1,
      y0: cell.y0,
      y1: cell.y1,
    })),
    layer,
    options,
  );
}

function hitTestTypedHeatmap<TProperties>(
  heatmap: VizCompactHeatmap,
  layer: HitLayerBase & { kind: "heatmap" },
  options: VizHitTestOptions<TProperties>,
) {
  const xWidth =
    (heatmap.summary.xDomain[1] - heatmap.summary.xDomain[0]) / heatmap.summary.xBinCount;
  const yWidth =
    (heatmap.summary.yDomain[1] - heatmap.summary.yDomain[0]) / heatmap.summary.yBinCount;

  return nearestRect(
    Array.from({ length: heatmap.value.length }, (_, index) => {
      const xIndex = heatmap.xIndex[index] ?? 0;
      const yIndex = heatmap.yIndex[index] ?? 0;
      const x0 = heatmap.summary.xDomain[0] + xIndex * xWidth;
      const y0 = heatmap.summary.yDomain[0] + yIndex * yWidth;

      return {
        pointCount: heatmap.pointCount[index] ?? 0,
        sampleIndex: index,
        value: heatmap.value[index] ?? 0,
        x: x0 + xWidth / 2,
        x0,
        x1: x0 + xWidth,
        y0,
        y1: y0 + yWidth,
      };
    }),
    layer,
    options,
  );
}

function nearestRect<TProperties>(
  rects: ReadonlyArray<{
    pointCount: number;
    sampleIndex: number;
    value: number | null;
    x: number;
    x0: number;
    x1: number;
    y0: number;
    y1: number;
  }>,
  layer: HitLayerBase,
  options: VizHitTestOptions<TProperties>,
): VizCartesianHitTestResult | null {
  if (!layer.bounds) {
    return null;
  }

  const [minX, minY, maxX, maxY] = layer.bounds as VizRenderBounds;
  if (!options.viewport || options.viewport.kind === "geo") {
    return null;
  }

  const xValue = pixelToDomainX(options.x, options.viewport.width, [minX, maxX]);
  const yValue = pixelToDomainY(options.y, options.viewport.height, [minY, maxY]);
  let nearest: VizCartesianHitTestResult | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const rect of rects) {
    if (rect.pointCount <= 0) {
      continue;
    }

    const contains =
      xValue >= Math.min(rect.x0, rect.x1) &&
      xValue <= Math.max(rect.x0, rect.x1) &&
      yValue >= Math.min(rect.y0, rect.y1) &&
      yValue <= Math.max(rect.y0, rect.y1);
    const rectX0 = domainXToPixel(rect.x0, options.viewport.width, [minX, maxX]);
    const rectX1 = domainXToPixel(rect.x1, options.viewport.width, [minX, maxX]);
    const rectY0 = domainYToPixel(rect.y0, options.viewport.height, [minY, maxY]);
    const rectY1 = domainYToPixel(rect.y1, options.viewport.height, [minY, maxY]);
    const distance = contains
      ? 0
      : Math.hypot(
          distanceToInterval(options.x, rectX0, rectX1),
          distanceToInterval(options.y, rectY0, rectY1),
        );

    if (options.mode === "contains" && !contains) {
      continue;
    }

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = {
        datasetId: layer.datasetId,
        distancePx: distance,
        kind: "cartesian",
        layerId: layer.layerId,
        layerKind: layer.kind,
        pointCount: rect.pointCount,
        sampleIndex: rect.sampleIndex,
        sourcePointId: null,
        x: rect.x,
        y: rect.value,
      };
    }
  }

  return nearest;
}

function hitTestObjectCandles<TProperties>(
  bars: ReadonlyArray<{
    close: number;
    high: number;
    low: number;
    timestamp: number;
  }>,
  layer: HitLayerBase & { kind: "finance-candles" },
  options: VizHitTestOptions<TProperties>,
) {
  return nearestRect(
    bars.map((bar, index) => ({
      pointCount: 1,
      sampleIndex: index,
      value: bar.close,
      x: bar.timestamp,
      x0: bar.timestamp,
      x1: bar.timestamp,
      y0: bar.low,
      y1: bar.high,
    })),
    layer,
    options,
  );
}

function hitTestTypedCandles<TProperties>(
  bars: VizCompactOhlcvBars,
  layer: HitLayerBase & { kind: "finance-candles" },
  options: VizHitTestOptions<TProperties>,
) {
  return nearestRect(
    Array.from({ length: bars.timestamp.length }, (_, index) => ({
      pointCount: 1,
      sampleIndex: index,
      value: bars.close[index] ?? null,
      x: bars.timestamp[index] ?? 0,
      x0: bars.timestamp[index] ?? 0,
      x1: bars.timestamp[index] ?? 0,
      y0: bars.low[index] ?? 0,
      y1: bars.high[index] ?? 0,
    })),
    layer,
    options,
  );
}

function hitTestGeoLayers<TProperties>(
  layers: readonly VizAnyRenderLayer<TProperties>[],
  viewport: Extract<VizViewport, { kind: "geo" }>,
  options: VizHitTestOptions<TProperties>,
): VizHitTestResult<TProperties> | null {
  const coordinate = pixelToGeoCoordinate(
    options.x,
    options.y,
    viewport.width,
    viewport.height,
    viewport.bounds,
  );
  let nearest: VizHitTestResult<TProperties> | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const layer of layers) {
    const result = hitTestGeoLayer(layer, viewport, coordinate, options);
    if (!result) {
      continue;
    }

    const distance = "distancePx" in result ? (result.distancePx ?? 0) : 0;
    if (distance < nearestDistance) {
      nearest = result;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function hitTestGeoLayer<TProperties>(
  layer: VizAnyRenderLayer<TProperties>,
  viewport: Extract<VizViewport, { kind: "geo" }>,
  coordinate: [longitude: number, latitude: number],
  options: VizHitTestOptions<TProperties>,
): VizHitTestResult<TProperties> | null {
  switch (layer.kind) {
    case "geo-points":
      return nearestGeoPoint(
        "typedGeoPoints" in layer
          ? geoPointsFromTyped<TProperties>(layer.typedGeoPoints)
          : layer.features,
        layer,
        viewport,
        coordinate,
        options,
      );
    case "geo-heat":
      return nearestGeoPoint(
        "typedGeoHeat" in layer
          ? geoPointsFromTyped<TProperties>(layer.typedGeoHeat)
          : layer.features.map((feature) => feature.point),
        layer,
        viewport,
        coordinate,
        options,
      );
    case "geo-clusters":
      return nearestGeoPoint(
        "typedGeoClusters" in layer
          ? geoClusterPointsFromTyped<TProperties>(layer.typedGeoClusters)
          : layer.features.map((feature, index) =>
              feature.kind === "point"
                ? feature.point
                : {
                    id: String(feature.clusterId),
                    label: feature.pointCountAbbreviated,
                    latitude: feature.coordinates[1],
                    longitude: feature.coordinates[0],
                    metrics: feature.metrics,
                    properties: {} as TProperties,
                    sourceIndex: index,
                  },
            ),
        layer,
        viewport,
        coordinate,
        options,
      );
    case "geo-flows":
      return nearestGeoFlow(
        "typedGeoFlows" in layer
          ? geoFlowsFromTyped<TProperties>(layer.typedGeoFlows)
          : layer.features.map((feature) => feature.flow),
        layer,
        viewport,
        coordinate,
        options,
      );
    case "geojson":
      return hitTestGeoJson(layer.featureCollection, layer, coordinate, options);
    default:
      return null;
  }
}

function nearestGeoPoint<TProperties>(
  points: readonly VizIndexedGeoPoint<TProperties>[],
  layer: HitLayerBase,
  viewport: Extract<VizViewport, { kind: "geo" }>,
  coordinate: [longitude: number, latitude: number],
  options: VizHitTestOptions<TProperties>,
): VizGeoPointHitTestResult<TProperties> | null {
  let nearest: VizGeoPointHitTestResult<TProperties> | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const point of points) {
    const pointPixel = geoCoordinateToPixel([point.longitude, point.latitude], viewport);
    const distancePx = Math.hypot(pointPixel[0] - options.x, pointPixel[1] - options.y);

    if (options.mode === "contains" && distancePx > 8) {
      continue;
    }

    if (distancePx < nearestDistance) {
      nearestDistance = distancePx;
      nearest = {
        datasetId: layer.datasetId,
        distance: Math.hypot(point.longitude - coordinate[0], point.latitude - coordinate[1]),
        distancePx,
        kind: "geo-point",
        layerId: layer.layerId,
        layerKind: layer.kind,
        point,
      };
    }
  }

  return nearest;
}

function nearestGeoFlow<TProperties>(
  flows: readonly VizIndexedGeoFlow<TProperties>[],
  layer: HitLayerBase & { kind: "geo-flows" },
  viewport: Extract<VizViewport, { kind: "geo" }>,
  _coordinate: [longitude: number, latitude: number],
  options: VizHitTestOptions<TProperties>,
): VizGeoFlowHitTestResult<TProperties> | null {
  let nearest: VizGeoFlowHitTestResult<TProperties> | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const flow of flows) {
    const from = geoCoordinateToPixel(flow.from, viewport);
    const to = geoCoordinateToPixel(flow.to, viewport);
    const distancePx = distanceToSegment([options.x, options.y], from, to);

    if (options.mode === "contains" && distancePx > 8) {
      continue;
    }

    if (distancePx < nearestDistance) {
      nearestDistance = distancePx;
      nearest = {
        datasetId: layer.datasetId,
        distancePx,
        flow,
        kind: "geo-flow",
        layerId: layer.layerId,
        layerKind: layer.kind,
      };
    }
  }

  return nearest;
}

function hitTestGeoJson<TProperties>(
  featureCollection: VizGeoJsonFeatureCollection<TProperties>,
  layer: HitLayerBase & { kind: "geojson" },
  coordinate: [longitude: number, latitude: number],
  options: VizHitTestOptions<TProperties>,
): VizGeoJsonHitTestResult | null {
  for (let index = 0; index < featureCollection.features.length; index += 1) {
    const bounds = geometryBounds(featureCollection.features[index]?.geometry);
    if (!bounds) {
      continue;
    }

    const contains =
      coordinate[0] >= bounds[0] &&
      coordinate[0] <= bounds[2] &&
      coordinate[1] >= bounds[1] &&
      coordinate[1] <= bounds[3];

    if (contains || options.mode !== "contains") {
      return {
        datasetId: layer.datasetId,
        featureIndex: index,
        kind: "geojson",
        layerId: layer.layerId,
        layerKind: layer.kind,
      };
    }
  }

  return null;
}

function geoPointsFromTyped<TProperties>(
  points: VizTypedGeoPoints | VizTypedGeoHeat,
): Array<VizIndexedGeoPoint<TProperties>> {
  return Array.from({ length: points.longitude.length }, (_, index) => ({
    id: points.id[index] ?? String(index),
    label: points.label[index] ?? "",
    latitude: points.latitude[index] ?? 0,
    longitude: points.longitude[index] ?? 0,
    metrics: metricsAt(points.metrics, points.summary.metricKeys, index),
    properties: {} as TProperties,
    sourceIndex: points.sourceIndex[index] ?? index,
  }));
}

function geoClusterPointsFromTyped<TProperties>(
  clusters: VizTypedGeoClusters,
): Array<VizIndexedGeoPoint<TProperties>> {
  return Array.from({ length: clusters.longitude.length }, (_, index) => ({
    id: clusters.id[index] ?? String(index),
    label: clusters.label[index] ?? "",
    latitude: clusters.latitude[index] ?? 0,
    longitude: clusters.longitude[index] ?? 0,
    metrics: metricsAt(clusters.metrics, clusters.summary.metricKeys, index),
    properties: {} as TProperties,
    sourceIndex: clusters.sourceIndex[index] ?? index,
  }));
}

function geoFlowsFromTyped<TProperties>(
  flows: VizTypedGeoFlows,
): Array<VizIndexedGeoFlow<TProperties>> {
  return Array.from({ length: flows.fromLongitude.length }, (_, index) => ({
    from: [flows.fromLongitude[index] ?? 0, flows.fromLatitude[index] ?? 0],
    id: flows.id[index] ?? String(index),
    label: flows.label[index] ?? "",
    metrics: metricsAt(flows.metrics, flows.summary.metricKeys, index),
    properties: {} as TProperties,
    sourceIndex: flows.sourceIndex[index] ?? index,
    to: [flows.toLongitude[index] ?? 0, flows.toLatitude[index] ?? 0],
  }));
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

function pixelToDomainX(x: number, width: number, xDomain: [number, number]) {
  if (width <= 0) {
    return xDomain[0];
  }

  const ratio = Math.min(1, Math.max(0, x / width));

  return xDomain[0] + (xDomain[1] - xDomain[0]) * ratio;
}

function pixelToDomainY(y: number, height: number, yDomain: [number, number]) {
  if (height <= 0) {
    return yDomain[0];
  }

  const ratio = Math.min(1, Math.max(0, y / height));

  return yDomain[1] + (yDomain[0] - yDomain[1]) * ratio;
}

function domainXToPixel(x: number, width: number, xDomain: [number, number]) {
  const span = xDomain[1] - xDomain[0];
  return span === 0 ? 0 : ((x - xDomain[0]) / span) * width;
}

function domainYToPixel(y: number, height: number, yDomain: [number, number]) {
  const span = yDomain[1] - yDomain[0];
  return span === 0 ? 0 : (1 - (y - yDomain[0]) / span) * height;
}

function yDomainFromBounds(bounds: VizRenderBounds): [number, number] {
  return [bounds[1], bounds[3]];
}

function pixelToGeoCoordinate(
  x: number,
  y: number,
  width: number,
  height: number,
  bounds: VizGeoBounds,
): [longitude: number, latitude: number] {
  const xRatio = width <= 0 ? 0 : Math.min(1, Math.max(0, x / width));
  const yRatio = height <= 0 ? 0 : Math.min(1, Math.max(0, y / height));
  const longitudeSpan =
    bounds[0] <= bounds[2] ? bounds[2] - bounds[0] : 360 - bounds[0] + bounds[2];
  const longitude = normalizeLongitude(bounds[0] + longitudeSpan * xRatio);
  const latitude = bounds[3] + (bounds[1] - bounds[3]) * yRatio;

  return [longitude, latitude];
}

function geoCoordinateToPixel(
  coordinate: [longitude: number, latitude: number],
  viewport: Extract<VizViewport, { kind: "geo" }>,
): [number, number] {
  const [west, south, east, north] = viewport.bounds;
  const longitudeSpan = west <= east ? east - west : 360 - west + east;
  const longitudeOffset = normalizeLongitude(coordinate[0] - west);
  const x = (longitudeOffset / longitudeSpan) * viewport.width;
  const y = (1 - (coordinate[1] - south) / (north - south)) * viewport.height;

  return [x, y];
}

function normalizeLongitude(longitude: number) {
  if (longitude > 180) {
    return longitude - 360;
  }

  if (longitude < -180) {
    return longitude + 360;
  }

  return longitude;
}

function distanceToInterval(value: number, min: number, max: number) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);

  if (value < low) {
    return low - value;
  }

  if (value > high) {
    return value - high;
  }

  return 0;
}

function distanceToSegment(
  point: [number, number],
  start: [number, number],
  end: [number, number],
) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(point[0] - start[0], point[1] - start[1]);
  }

  const ratio = Math.max(
    0,
    Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared),
  );
  const x = start[0] + ratio * dx;
  const y = start[1] + ratio * dy;

  return Math.hypot(point[0] - x, point[1] - y);
}

function geometryBounds(geometry: unknown): VizGeoBounds | null {
  if (!geometry || typeof geometry !== "object") {
    return null;
  }

  const coordinates = (geometry as { coordinates?: unknown }).coordinates;
  const positions = flattenPositions(coordinates);
  if (!positions.length) {
    return null;
  }

  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const [longitude, latitude] of positions) {
    west = Math.min(west, longitude);
    south = Math.min(south, latitude);
    east = Math.max(east, longitude);
    north = Math.max(north, latitude);
  }

  return [west, south, east, north];
}

function flattenPositions(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) {
    return [];
  }

  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  ) {
    return [[value[0], value[1]]];
  }

  return value.flatMap((child) => flattenPositions(child));
}

function finiteOrNull(value: number | undefined) {
  return value == null || Number.isNaN(value) ? null : value;
}
