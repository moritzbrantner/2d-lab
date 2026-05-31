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
    if (layer.kind === "binned-series") {
      if ("typedSeries" in layer || "compactSeries" in layer) {
        const typedLayer = layer as {
          compactSeries: VizCompactDensitySeries;
          typedSeries?: VizCompactDensitySeries;
        };
        const result = nearestTypedBinnedSample(
          typedLayer.typedSeries ?? typedLayer.compactSeries,
          xValue,
        );
        if (result && result.distance < nearestDistance) {
          nearestDistance = result.distance;
          nearest = {
            datasetId: layer.datasetId,
            kind: "cartesian",
            layerId: layer.layerId,
            pointCount: result.pointCount,
            sampleIndex: result.sampleIndex,
            sourcePointId: null,
            x: result.x,
            y: result.y,
          };
        }
        continue;
      }

      for (const sample of layer.series.samples) {
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
            sampleIndex: sample.index,
            sourcePointId: sample.firstPoint?.id ?? sample.lastPoint?.id ?? null,
            x: sample.x,
            y: sample.y,
          };
        }
      }
    } else if (layer.kind === "rolling-series") {
      if ("typedRollingSeries" in layer || "compactRollingSeries" in layer) {
        const typedLayer = layer as {
          compactRollingSeries: VizCompactRollingSeries;
          typedRollingSeries?: VizCompactRollingSeries;
        };
        const result = nearestTypedRollingSample(
          typedLayer.typedRollingSeries ?? typedLayer.compactRollingSeries,
          xValue,
        );
        if (result && result.distance < nearestDistance) {
          nearestDistance = result.distance;
          nearest = {
            datasetId: layer.datasetId,
            kind: "cartesian",
            layerId: layer.layerId,
            pointCount: result.pointCount,
            sampleIndex: result.sampleIndex,
            sourcePointId: null,
            x: result.x,
            y: result.y,
          };
        }
        continue;
      }

      for (const point of layer.series.points) {
        if (point.pointCount <= 0 || point.y == null) {
          continue;
        }
        const distance = Math.abs(point.x - xValue);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = {
            datasetId: layer.datasetId,
            kind: "cartesian",
            layerId: layer.layerId,
            pointCount: point.pointCount,
            sampleIndex: point.index,
            sourcePointId: point.sourcePoint?.id ?? null,
            x: point.x,
            y: point.y,
          };
        }
      }
    }
  }

  return nearest;
}

function nearestTypedBinnedSample(series: VizCompactDensitySeries, xValue: number) {
  let nearest: {
    distance: number;
    pointCount: number;
    sampleIndex: number;
    x: number;
    y: number;
  } | null = null;

  for (let index = 0; index < series.y.length; index += 1) {
    const pointCount = series.pointCount[index] ?? 0;
    const y = series.y[index]!;
    if (pointCount <= 0 || !Number.isFinite(y)) {
      continue;
    }

    const x = (series.x0[index]! + series.x1[index]!) / 2;
    const distance = Math.abs(x - xValue);
    if (!nearest || distance < nearest.distance) {
      nearest = { distance, pointCount, sampleIndex: index, x, y };
    }
  }

  return nearest;
}

function nearestTypedRollingSample(series: VizCompactRollingSeries, xValue: number) {
  let nearest: {
    distance: number;
    pointCount: number;
    sampleIndex: number;
    x: number;
    y: number;
  } | null = null;

  for (let index = 0; index < series.y.length; index += 1) {
    const pointCount = series.pointCount[index] ?? 0;
    const y = series.y[index]!;
    if (pointCount <= 0 || !Number.isFinite(y)) {
      continue;
    }

    const x = series.x[index]!;
    const distance = Math.abs(x - xValue);
    if (!nearest || distance < nearest.distance) {
      nearest = { distance, pointCount, sampleIndex: index, x, y };
    }
  }

  return nearest;
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
