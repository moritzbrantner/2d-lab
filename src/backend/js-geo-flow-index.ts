import { getGeoWeight } from "./js-geo-index";

import type {
  VizGeoBounds,
  VizGeoFlow,
  VizGeoFlowAggregation,
  VizGeoFlowIndex,
  VizGeoFlowOptions,
  VizGeoViewportQuery,
  VizIndexedGeoFlow,
  VizMetricRecord,
} from "../types";

export class JsVizGeoFlowIndex<
  TProperties = Record<string, unknown>,
> implements VizGeoFlowIndex<TProperties> {
  private readonly flows: Array<VizIndexedGeoFlow<TProperties>>;

  constructor(flows: readonly VizGeoFlow<TProperties>[]) {
    this.flows = normalizeGeoFlows(flows);
  }

  getBackendCapabilities() {
    return {
      backend: "js" as const,
      implementation: "js" as const,
      usesWasm: false,
    };
  }

  getBounds(): VizGeoBounds | null {
    return getGeoFlowBounds(this.flows);
  }

  getViewportFlows(
    query: VizGeoViewportQuery,
    options: VizGeoFlowOptions = {},
  ): VizGeoFlowAggregation<TProperties> {
    const minWeight = Math.max(0, options.minWeight ?? 0);
    let weighted = this.flows
      .filter((flow) => flowIntersectsBounds(flow, query.bounds))
      .map((flow) => ({
        flow,
        rawWeight: getGeoWeight(flow.metrics, options.weightMetric),
      }))
      .filter((entry) => entry.rawWeight > 0 && entry.rawWeight >= minWeight);

    if (options.aggregate && options.aggregate !== "none") {
      weighted = aggregateFlows(weighted);
    }

    let maxWeight = 1;

    for (const entry of weighted) {
      maxWeight = Math.max(maxWeight, entry.rawWeight);
    }

    const features = weighted.map(({ flow, rawWeight }) => ({
      flow,
      rawWeight,
      value: rawWeight / maxWeight,
    }));

    return {
      features,
      summary: {
        bounds: getGeoFlowBounds(features.map((feature) => feature.flow)),
        maxWeight,
        metrics: sumMetrics(features.map((feature) => feature.flow.metrics)),
        viewportBounds: query.bounds,
        visibleFlowCount: features.length,
        zoom: query.zoom,
      },
    };
  }
}

export function normalizeGeoFlows<TProperties>(
  flows: readonly VizGeoFlow<TProperties>[],
): Array<VizIndexedGeoFlow<TProperties>> {
  return flows
    .map((flow, sourceIndex) => ({
      from: flow.from,
      id: String(flow.id ?? sourceIndex),
      label: flow.label ?? "",
      metrics: normalizeMetrics(flow.metrics),
      properties: flow.properties ?? ({} as TProperties),
      sourceIndex,
      to: flow.to,
    }))
    .filter(
      (flow) =>
        flow.from.every(Number.isFinite) &&
        flow.to.every(Number.isFinite) &&
        coordinateIsGeographic(flow.from) &&
        coordinateIsGeographic(flow.to),
    );
}

function aggregateFlows<TProperties>(
  weighted: Array<{ flow: VizIndexedGeoFlow<TProperties>; rawWeight: number }>,
) {
  const groups = new Map<string, { flow: VizIndexedGeoFlow<TProperties>; rawWeight: number }>();

  for (const entry of weighted) {
    const key = `${entry.flow.from.join(",")}->${entry.flow.to.join(",")}`;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        flow: { ...entry.flow, id: key, label: "" },
        rawWeight: entry.rawWeight,
      });
      continue;
    }

    existing.rawWeight += entry.rawWeight;
    existing.flow.metrics = sumMetrics([existing.flow.metrics, entry.flow.metrics]);
  }

  return [...groups.values()];
}

function flowIntersectsBounds<TProperties>(
  flow: VizIndexedGeoFlow<TProperties>,
  bounds: VizGeoBounds,
) {
  if (pointInBounds(flow.from, bounds) || pointInBounds(flow.to, bounds)) {
    return true;
  }

  const west = Math.min(flow.from[0], flow.to[0]);
  const east = Math.max(flow.from[0], flow.to[0]);
  const south = Math.min(flow.from[1], flow.to[1]);
  const north = Math.max(flow.from[1], flow.to[1]);
  const latitudeIntersects = south <= bounds[3] && north >= bounds[1];

  if (!latitudeIntersects) {
    return false;
  }

  return bounds[0] <= bounds[2]
    ? west <= bounds[2] && east >= bounds[0]
    : east >= bounds[0] || west <= bounds[2];
}

function pointInBounds(point: [number, number], bounds: VizGeoBounds) {
  const longitudeVisible =
    bounds[0] <= bounds[2]
      ? point[0] >= bounds[0] && point[0] <= bounds[2]
      : point[0] >= bounds[0] || point[0] <= bounds[2];

  return longitudeVisible && point[1] >= bounds[1] && point[1] <= bounds[3];
}

function coordinateIsGeographic(point: [number, number]) {
  return point[0] >= -180 && point[0] <= 180 && point[1] >= -90 && point[1] <= 90;
}

function getGeoFlowBounds<TProperties>(
  flows: readonly VizIndexedGeoFlow<TProperties>[],
): VizGeoBounds | null {
  const first = flows[0];

  if (!first) {
    return null;
  }

  let west = Math.min(first.from[0], first.to[0]);
  let south = Math.min(first.from[1], first.to[1]);
  let east = Math.max(first.from[0], first.to[0]);
  let north = Math.max(first.from[1], first.to[1]);

  for (const flow of flows) {
    west = Math.min(west, flow.from[0], flow.to[0]);
    south = Math.min(south, flow.from[1], flow.to[1]);
    east = Math.max(east, flow.from[0], flow.to[0]);
    north = Math.max(north, flow.from[1], flow.to[1]);
  }

  return [west, south, east, north];
}

function normalizeMetrics(metrics: VizMetricRecord | undefined): VizMetricRecord {
  const normalized: VizMetricRecord = {};

  for (const [key, value] of Object.entries(metrics ?? {})) {
    normalized[key] = Number.isFinite(value) ? value : 0;
  }

  return normalized;
}

function sumMetrics(records: readonly VizMetricRecord[]): VizMetricRecord {
  const result: VizMetricRecord = {};

  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      result[key] = (result[key] ?? 0) + value;
    }
  }

  return result;
}
