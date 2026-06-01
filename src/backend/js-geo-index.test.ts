import { describe, expect, test } from "vitest";

import { JsVizGeoPointIndex, getBoundsFromGeoPoints, normalizeGeoPoints } from "./js-geo-index";

import type { VizGeoPoint, VizGeoViewportQuery } from "../types";

const points: VizGeoPoint<{ group: string }>[] = [
  {
    id: "a",
    label: "A",
    latitude: 52,
    longitude: 13,
    metrics: { demand: 2 },
    properties: { group: "x" },
  },
  {
    id: "b",
    latitude: 52.001,
    longitude: 13.001,
    metrics: { demand: 3 },
    properties: { group: "x" },
  },
  {
    id: "c",
    latitude: 10,
    longitude: 179.5,
    metrics: { demand: 5 },
    properties: { group: "east" },
  },
  {
    id: "d",
    latitude: 10,
    longitude: -179.5,
    metrics: { demand: 7 },
    properties: { group: "west" },
  },
  { id: "bad", latitude: 100, longitude: 13 },
];

describe("geo index utils", () => {
  test("normalizes geo points and filters invalid coordinates", () => {
    expect(normalizeGeoPoints([{ latitude: 1, longitude: 2, metrics: { a: Number.NaN } }])).toEqual(
      [
        {
          id: "0",
          label: "",
          latitude: 1,
          longitude: 2,
          metrics: {},
          properties: {},
          sourceIndex: 0,
        },
      ],
    );
    expect(normalizeGeoPoints(points).map((point) => point.id)).toEqual(["a", "b", "c", "d"]);
  });

  test("computes bounds from geo points", () => {
    expect(getBoundsFromGeoPoints([])).toBeNull();
    expect(getBoundsFromGeoPoints(normalizeGeoPoints(points.slice(0, 2)))).toEqual([
      13, 52, 13.001, 52.001,
    ]);
  });
});

describe("JsVizGeoPointIndex", () => {
  test("reports capabilities, bounds, and point lookup", () => {
    const index = new JsVizGeoPointIndex(points);

    expect(index.getBackendCapabilities()).toEqual({
      backend: "js",
      implementation: "js",
      usesWasm: false,
    });
    expect(index.getBounds()).toEqual([-179.5, 10, 179.5, 52.001]);
    expect(index.getPointById("a")).toMatchObject({ id: "a", label: "A", metrics: { demand: 2 } });
    expect(index.getPointById("missing")).toBeNull();
  });

  test("filters viewport aggregation by normal and antimeridian bounds", () => {
    const index = new JsVizGeoPointIndex(points);

    expect(
      index.getViewportAggregation({ bounds: [12.9, 51.9, 13.1, 52.1], zoom: 12 }).summary,
    ).toMatchObject({ metrics: { demand: 5 }, visiblePointCount: 2 });
    expect(
      index
        .getViewportAggregation({ bounds: [170, 0, -170, 20], zoom: 12 })
        .features.map((feature) =>
          feature.kind === "point" ? feature.point.id : feature.clusterId,
        ),
    ).toEqual(["c", "d"]);
  });

  test("clusters nearby points and exposes leaves", () => {
    const index = new JsVizGeoPointIndex(points);
    const aggregation = index.getViewportAggregation(
      { bounds: [12.9, 51.9, 13.1, 52.1], zoom: 1 },
      { radius: 80 },
    );
    const cluster = aggregation.features[0];

    expect(cluster).toMatchObject({
      kind: "cluster",
      metrics: { demand: 5 },
      pointCount: 2,
      pointCountAbbreviated: "2",
    });
    expect(cluster?.kind === "cluster" ? cluster.expansionZoom : 0).toBeGreaterThan(1);
    expect(cluster?.coordinates[0]).toBeCloseTo(13.0005);
    expect(cluster?.coordinates[1]).toBeCloseTo(52.0005);
    expect(aggregation.summary).toMatchObject({
      metrics: { demand: 5 },
      visibleClusterCount: 1,
      visiblePointCount: 2,
      visibleUnclusteredCount: 0,
    });

    if (cluster?.kind !== "cluster") {
      throw new Error("Expected a cluster");
    }

    expect(index.getClusterExpansionZoom(cluster.clusterId)).toBeGreaterThan(1);
    expect(index.getClusterLeaves(cluster.clusterId, 1, 1).map((point) => point.id)).toEqual(["b"]);
    expect(index.getClusterExpansionZoom(999)).toBe(0);
    expect(index.getClusterLeaves(999)).toEqual([]);
  });

  test("fast cluster mode preserves counts and skips expansion zoom work", () => {
    const index = new JsVizGeoPointIndex(points);
    const query: VizGeoViewportQuery = { bounds: [12.9, 51.9, 13.1, 52.1], zoom: 1 };
    const full = index.getViewportAggregation(query, { radius: 80 });
    const fast = index.getViewportAggregation(query, { fast: true, radius: 80 });

    expect(fast.summary).toEqual(full.summary);
    expect(
      fast.features.map((feature) =>
        feature.kind === "cluster"
          ? {
              expansionZoom: feature.expansionZoom,
              kind: feature.kind,
              pointCount: feature.pointCount,
            }
          : { kind: feature.kind },
      ),
    ).toEqual([{ expansionZoom: 0, kind: "cluster", pointCount: 2 }]);
    expect(
      full.features[0]?.kind === "cluster" ? full.features[0].expansionZoom : 0,
    ).toBeGreaterThan(1);
  });

  test("creates scalar field grids with fixed domains and missing metrics", () => {
    const index = new JsVizGeoPointIndex([
      { id: "cold", latitude: 0, longitude: 0, metrics: { temperature: 10 } },
      { id: "warm", latitude: 0, longitude: 2, metrics: { temperature: 20 } },
      { id: "missing", latitude: 1, longitude: 1, metrics: { demand: 99 } },
    ]);

    const grid = index.getScalarFieldGrid(
      { bounds: [0, -1, 2, 1], zoom: 3 },
      {
        fieldColumns: 2,
        fieldRows: 1,
        interpolationK: 2,
        valueDomain: [0, 30],
        valueMetric: "temperature",
      },
    );

    expect(grid).toMatchObject({
      bounds: [0, -1, 2, 1],
      columns: 2,
      rows: 1,
      valueDomain: [0, 30],
    });
    expect(grid.values).toHaveLength(2);
    expect(grid.values.every((value) => typeof value === "number")).toBe(true);

    expect(
      index.getScalarFieldGrid(
        { bounds: [170, -1, -170, 1], zoom: 3 },
        { fieldColumns: 1, fieldRows: 1, valueMetric: "unknown" },
      ),
    ).toMatchObject({
      bounds: [-170, -1, 170, 1],
      valueDomain: null,
      values: [null],
    });
  });

  test("returns represented counts for broad, city, dense, and antimeridian viewports", () => {
    const densePoints = Array.from({ length: 100 }, (_, index) => ({
      id: `dense-${index}`,
      latitude: 52 + index * 0.00001,
      longitude: 13 + index * 0.00001,
      metrics: { demand: 1 },
      properties: { group: "dense" },
    }));
    const index = new JsVizGeoPointIndex([...points, ...densePoints]);

    const viewports: Array<[number, number, number, number]> = [
      [-180, -90, 180, 90],
      [12.9, 51.9, 13.1, 52.1],
      [12.99, 51.99, 13.01, 52.01],
      [170, 0, -170, 20],
    ];

    for (const bounds of viewports) {
      const aggregation = index.getViewportAggregation({ bounds, zoom: 2 }, { radius: 80 });

      expect(aggregation.summary.visiblePointCount).toBeGreaterThan(0);
      expect(
        aggregation.features.reduce(
          (sum, feature) => sum + (feature.kind === "cluster" ? feature.pointCount : 1),
          0,
        ),
      ).toBe(aggregation.summary.visiblePointCount);
    }
  });
});
