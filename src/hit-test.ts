import type {
  VizAnyRenderFrame,
  VizCompactDensitySeries,
  VizCompactRollingSeries,
  VizHitTestOptions,
  VizHitTestResult,
} from "./types";

export function hitTestVizFrame<TProperties = Record<string, unknown>>(
  frame: VizAnyRenderFrame<TProperties> | null,
  options: VizHitTestOptions,
): VizHitTestResult<TProperties> | null {
  if (!frame || !options.viewport) {
    return null;
  }

  if (options.viewport.kind === "geo") {
    return hitTestGeoFrame(frame, options);
  }

  const xValue = pixelToDomainX(options.x, options.viewport.width, options.viewport.xDomain);
  let nearest: VizHitTestResult | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const layer of frame.layers) {
    const samples =
      layer.kind === "binned-series"
        ? "compactSeries" in layer
          ? compactBinnedSamples(layer.compactSeries)
          : layer.series.samples.map((sample) => ({
              pointCount: sample.pointCount,
              sampleIndex: sample.index,
              sourcePointId: sample.firstPoint?.id ?? sample.lastPoint?.id ?? null,
              x: sample.x,
              y: sample.y,
            }))
        : layer.kind === "rolling-series"
          ? "compactRollingSeries" in layer
            ? compactRollingSamples(layer.compactRollingSeries)
            : layer.series.points.map((point) => ({
                pointCount: point.pointCount,
                sampleIndex: point.index,
                sourcePointId: point.sourcePoint?.id ?? null,
                x: point.x,
                y: point.y,
              }))
          : [];

    for (const sample of samples) {
      if (sample.pointCount <= 0 || sample.y == null) {
        continue;
      }

      const distance = Math.abs(sample.x - xValue);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = {
          datasetId: layer.datasetId,
          kind: "cartesian",
          layerId: layer.layerId,
          pointCount: sample.pointCount,
          sampleIndex: sample.sampleIndex,
          sourcePointId: sample.sourcePointId,
          x: sample.x,
          y: sample.y,
        };
      }
    }
  }

  return nearest;
}

function compactBinnedSamples(series: VizCompactDensitySeries) {
  return Array.from({ length: series.y.length }, (_, index) => ({
    pointCount: series.pointCount[index] ?? 0,
    sampleIndex: index,
    sourcePointId: null,
    x: (series.x0[index]! + series.x1[index]!) / 2,
    y: Number.isFinite(series.y[index]) ? series.y[index]! : null,
  }));
}

function compactRollingSamples(series: VizCompactRollingSeries) {
  return Array.from({ length: series.y.length }, (_, index) => ({
    pointCount: series.pointCount[index] ?? 0,
    sampleIndex: index,
    sourcePointId: null,
    x: series.x[index]!,
    y: Number.isFinite(series.y[index]) ? series.y[index]! : null,
  }));
}

function hitTestGeoFrame<TProperties>(
  frame: VizAnyRenderFrame<TProperties>,
  options: VizHitTestOptions,
): VizHitTestResult<TProperties> | null {
  if (!options.viewport || options.viewport.kind !== "geo") {
    return null;
  }

  const coordinate = pixelToGeoCoordinate(
    options.x,
    options.y,
    options.viewport.width,
    options.viewport.height,
    options.viewport.bounds,
  );
  let nearest: VizHitTestResult<TProperties> | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const layer of frame.layers) {
    const points =
      layer.kind === "geo-points"
        ? layer.features
        : layer.kind === "geo-heat"
          ? layer.features.map((feature) => feature.point)
          : [];

    for (const point of points) {
      const distance = Math.hypot(point.longitude - coordinate[0], point.latitude - coordinate[1]);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = {
          datasetId: layer.datasetId,
          distance,
          kind: "geo-point",
          layerId: layer.layerId,
          point,
        };
      }
    }
  }

  return nearest;
}

function pixelToDomainX(x: number, width: number, xDomain: [number, number]) {
  if (width <= 0) {
    return xDomain[0];
  }

  const ratio = Math.min(1, Math.max(0, x / width));

  return xDomain[0] + (xDomain[1] - xDomain[0]) * ratio;
}

function pixelToGeoCoordinate(
  x: number,
  y: number,
  width: number,
  height: number,
  bounds: [number, number, number, number],
): [longitude: number, latitude: number] {
  const xRatio = width <= 0 ? 0 : Math.min(1, Math.max(0, x / width));
  const yRatio = height <= 0 ? 0 : Math.min(1, Math.max(0, y / height));
  const longitudeSpan =
    bounds[0] <= bounds[2] ? bounds[2] - bounds[0] : 360 - bounds[0] + bounds[2];
  const longitude = normalizeLongitude(bounds[0] + longitudeSpan * xRatio);
  const latitude = bounds[3] + (bounds[1] - bounds[3]) * yRatio;

  return [longitude, latitude];
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
