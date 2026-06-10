import type { VizGeoBounds, VizRenderBounds, VizViewport } from "../types";

export function pixelToDomainX(x: number, width: number, xDomain: [number, number]) {
  if (width <= 0) {
    return xDomain[0];
  }

  const ratio = Math.min(1, Math.max(0, x / width));

  return xDomain[0] + (xDomain[1] - xDomain[0]) * ratio;
}

export function pixelToDomainY(y: number, height: number, yDomain: [number, number]) {
  if (height <= 0) {
    return yDomain[0];
  }

  const ratio = Math.min(1, Math.max(0, y / height));

  return yDomain[1] + (yDomain[0] - yDomain[1]) * ratio;
}

export function domainXToPixel(x: number, width: number, xDomain: [number, number]) {
  const span = xDomain[1] - xDomain[0];
  return span === 0 ? 0 : ((x - xDomain[0]) / span) * width;
}

export function domainYToPixel(y: number, height: number, yDomain: [number, number]) {
  const span = yDomain[1] - yDomain[0];
  return span === 0 ? 0 : (1 - (y - yDomain[0]) / span) * height;
}

export function yDomainFromBounds(bounds: VizRenderBounds): [number, number] {
  return [bounds[1], bounds[3]];
}

export function pixelToGeoCoordinate(
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

export function geoCoordinateToPixel(
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

export function normalizeLongitude(longitude: number) {
  if (longitude > 180) {
    return longitude - 360;
  }

  if (longitude < -180) {
    return longitude + 360;
  }

  return longitude;
}

export function distanceToInterval(value: number, min: number, max: number) {
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

export function distanceToSegment(
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

export function geometryBounds(geometry: unknown): VizGeoBounds | null {
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

export function finiteOrNull(value: number | undefined) {
  return value == null || Number.isNaN(value) ? null : value;
}
