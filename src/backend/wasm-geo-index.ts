import {
  GeoPointIndex,
  initVizEngineWasm,
  ScalarFieldIndex,
} from "../wasm/viz-engine-wasm-bindings";

import type {
  VizGeoAggregation,
  VizGeoAggregationFeature,
  VizGeoAggregationOptions,
  VizGeoBounds,
  VizGeoHeatAggregation,
  VizGeoHeatOptions,
  VizGeoPoint,
  VizGeoPointIndex,
  VizGeoScalarFieldGrid,
  VizGeoScalarFieldOptions,
  VizGeoViewportQuery,
  VizIndexedGeoPoint,
  VizMetricRecord,
} from "../types";

type GeoVizPoint<TProperties = Record<string, unknown>> = VizGeoPoint<TProperties>;
type GeoVizAggregationOptions = Omit<
  VizGeoAggregationOptions,
  "fast" | "includeClusterMetrics" | "includeExpansionZoom"
>;
type GeoVizHeatAggregation<TProperties = Record<string, unknown>> =
  VizGeoHeatAggregation<TProperties>;
type GeoVizScalarFieldOptions = VizGeoScalarFieldOptions & {
  domainBounds?: VizGeoBounds;
};
type GeoVizAggregationFeature<TProperties = Record<string, unknown>> =
  | Extract<VizGeoAggregationFeature<TProperties>, { kind: "point" }>
  | {
      clusterId: string;
      coordinates: [longitude: number, latitude: number];
      expansionZoom: number;
      kind: "cluster";
      metrics: VizMetricRecord;
      pointCount: number;
      pointCountAbbreviated: string;
    };
type GeoVizAggregation<TProperties = Record<string, unknown>> = {
  features: Array<GeoVizAggregationFeature<TProperties>>;
  summary: VizGeoAggregation<TProperties>["summary"];
};

type ClusterIndexEntry = {
  inner: GeoPointIndex;
  key: string;
  numericToString: Map<number, string>;
  stringToNumeric: Map<string, number>;
};

export class WasmVizGeoPointIndex<
  TProperties = Record<string, unknown>,
> implements VizGeoPointIndex<TProperties> {
  private readonly indexes = new Map<string, ClusterIndexEntry>();
  private latestIndexKey: string | null = null;

  constructor(private readonly points: readonly VizGeoPoint<TProperties>[]) {
    initVizEngineWasm();
  }

  getBackendCapabilities() {
    return {
      backend: "wasm" as const,
      implementation: "rust-geo-viz-wasm" as const,
      usesWasm: true,
    };
  }

  getBounds(): VizGeoBounds | null {
    return this.defaultIndex().inner.getBounds() as VizGeoBounds | null;
  }

  getClusterExpansionZoom(clusterId: number): number {
    const entry = this.latestIndex();
    const rustClusterId = entry?.numericToString.get(clusterId);
    return entry && rustClusterId ? entry.inner.getClusterExpansionZoom(rustClusterId) : 0;
  }

  getClusterLeaves(
    clusterId: number,
    limit = 10,
    offset = 0,
  ): Array<VizIndexedGeoPoint<TProperties>> {
    const entry = this.latestIndex();
    const rustClusterId = entry?.numericToString.get(clusterId);
    return entry && rustClusterId
      ? (entry.inner.getClusterLeaves(rustClusterId, limit, offset) as Array<
          VizIndexedGeoPoint<TProperties>
        >)
      : [];
  }

  getPointById(pointId: string): VizIndexedGeoPoint<TProperties> | null {
    return this.defaultIndex().inner.getPointById(
      pointId,
    ) as VizIndexedGeoPoint<TProperties> | null;
  }

  getHeatFeatures(
    query: VizGeoViewportQuery,
    options: VizGeoHeatOptions = {},
  ): VizGeoHeatAggregation<TProperties> {
    return this.defaultIndex().inner.getHeatFeatures(
      query,
      options,
    ) as VizGeoHeatAggregation<TProperties>;
  }

  getScalarFieldGrid(
    query: VizGeoViewportQuery,
    options: VizGeoScalarFieldOptions = {},
  ): VizGeoScalarFieldGrid {
    const index = new ScalarFieldIndex(this.points as Array<GeoVizPoint<TProperties>>, {
      ...options,
      domainBounds: query.bounds,
    } satisfies GeoVizScalarFieldOptions);

    try {
      return index.createGrid() as VizGeoScalarFieldGrid;
    } finally {
      index.free();
    }
  }

  getViewportAggregation(
    query: VizGeoViewportQuery,
    options: VizGeoAggregationOptions = {},
  ): VizGeoAggregation<TProperties> {
    const entry = this.indexForOptions(options);
    this.latestIndexKey = entry.key;
    const aggregation = entry.inner.getViewportAggregation(query) as GeoVizAggregation<TProperties>;

    return {
      features: aggregation.features.map((feature) => this.mapAggregationFeature(entry, feature)),
      summary: aggregation.summary,
    };
  }

  nearestPoint(query: {
    latitude: number;
    longitude: number;
    maxDistance?: number;
  }): VizIndexedGeoPoint<TProperties> | null {
    return this.defaultIndex().inner.nearestPoint(query) as VizIndexedGeoPoint<TProperties> | null;
  }

  private defaultIndex() {
    return this.indexForOptions({});
  }

  private latestIndex() {
    return this.latestIndexKey ? (this.indexes.get(this.latestIndexKey) ?? null) : null;
  }

  private indexForOptions(options: VizGeoAggregationOptions): ClusterIndexEntry {
    const normalized = normalizeAggregationOptions(options);
    const key = aggregationOptionsKey(normalized);
    const existing = this.indexes.get(key);
    if (existing) {
      return existing;
    }

    const entry: ClusterIndexEntry = {
      inner: new GeoPointIndex(
        this.points as Array<GeoVizPoint<TProperties>>,
        normalized satisfies GeoVizAggregationOptions,
      ),
      key,
      numericToString: new Map(),
      stringToNumeric: new Map(),
    };
    this.indexes.set(key, entry);

    return entry;
  }

  private mapAggregationFeature(
    entry: ClusterIndexEntry,
    feature: GeoVizAggregationFeature<TProperties>,
  ): VizGeoAggregationFeature<TProperties> {
    if (feature.kind === "point") {
      return feature as VizGeoAggregationFeature<TProperties>;
    }

    return {
      ...feature,
      clusterId: this.numericClusterId(entry, feature.clusterId),
    };
  }

  private numericClusterId(entry: ClusterIndexEntry, clusterId: string) {
    const existing = entry.stringToNumeric.get(clusterId);
    if (existing != null) {
      return existing;
    }

    const next = entry.stringToNumeric.size + 1;
    entry.stringToNumeric.set(clusterId, next);
    entry.numericToString.set(next, clusterId);
    return next;
  }
}

function normalizeAggregationOptions(
  options: VizGeoAggregationOptions,
): Required<GeoVizAggregationOptions> {
  return {
    extent: Math.max(1, options.extent ?? 512),
    maxZoom: Math.max(0, Math.floor(options.maxZoom ?? 16)),
    minZoom: Math.max(0, Math.floor(options.minZoom ?? 0)),
    radius: Math.max(1, options.radius ?? 72),
  };
}

function aggregationOptionsKey(options: Required<GeoVizAggregationOptions>) {
  return `${options.radius}|${options.minZoom}|${options.maxZoom}|${options.extent}`;
}
