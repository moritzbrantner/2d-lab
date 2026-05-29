import { GeoPointIndex } from "@mb-rust/geo-viz-core-wasm";

import { normalizeGeoPoints } from "./js-geo-index";

import type {
  VizGeoAggregation,
  VizGeoAggregationOptions,
  VizGeoBounds,
  VizGeoPoint,
  VizGeoPointIndex,
  VizGeoViewportQuery,
  VizIndexedGeoPoint,
} from "../types";

type WasmGeoPointIndex = InstanceType<typeof GeoPointIndex>;

export class WasmVizGeoPointIndex<
  TProperties = Record<string, unknown>,
> implements VizGeoPointIndex<TProperties> {
  private readonly byId: Map<string, VizIndexedGeoPoint<TProperties>>;
  private readonly indexCache = new Map<string, WasmGeoPointIndex>();
  private readonly points: Array<VizIndexedGeoPoint<TProperties>>;

  constructor(points: readonly VizGeoPoint<TProperties>[]) {
    this.points = normalizeGeoPoints(points);
    this.byId = new Map(this.points.map((point) => [point.id, point]));
  }

  getBackendCapabilities() {
    return {
      backend: "wasm" as const,
      implementation: "legacy-wasm" as const,
      usesWasm: true,
    };
  }

  getBounds(): VizGeoBounds | null {
    return this.getIndex().getBounds() as VizGeoBounds | null;
  }

  getClusterExpansionZoom(clusterId: number): number {
    return this.getIndex().getClusterExpansionZoom(clusterId);
  }

  getClusterLeaves(
    clusterId: number,
    limit?: number,
    offset?: number,
  ): Array<VizIndexedGeoPoint<TProperties>> {
    return this.getIndex().getClusterLeaves(clusterId, limit, offset) as Array<
      VizIndexedGeoPoint<TProperties>
    >;
  }

  getPointById(pointId: string): VizIndexedGeoPoint<TProperties> | null {
    return this.byId.get(pointId) ?? null;
  }

  getViewportAggregation(
    query: VizGeoViewportQuery,
    options: VizGeoAggregationOptions = {},
  ): VizGeoAggregation<TProperties> {
    return this.getIndex(options).getViewportAggregation(query) as VizGeoAggregation<TProperties>;
  }

  private getIndex(options: VizGeoAggregationOptions = {}) {
    const key = JSON.stringify({
      extent: options.extent ?? null,
      maxZoom: options.maxZoom ?? null,
      minZoom: options.minZoom ?? null,
      radius: options.radius ?? null,
    });
    const cached = this.indexCache.get(key);

    if (cached) {
      return cached;
    }

    const index = new GeoPointIndex(
      this.points.map((point) => ({
        id: point.id,
        label: point.label,
        latitude: point.latitude,
        longitude: point.longitude,
        metrics: point.metrics,
        properties: point.properties,
      })),
      options,
    ) as WasmGeoPointIndex;

    this.indexCache.set(key, index);

    return index;
  }
}
