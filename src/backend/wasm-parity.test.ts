import { describe, expect, test } from "vitest";

import { JsVizFinanceIndex } from "./js-finance-index";
import { JsVizGeoFlowIndex } from "./js-geo-flow-index";
import { JsVizGeoPointIndex } from "./js-geo-index";
import { JsVizGeoJsonIndex } from "./js-geojson-index";
import { WasmVizFinanceIndex } from "./wasm-finance-index";
import { WasmVizGeoFlowIndex } from "./wasm-geo-flow-index";
import { WasmVizGeoPointIndex } from "./wasm-geo-index";
import { WasmVizGeoJsonIndex } from "./wasm-geojson-index";

import type {
  VizFinanceDataset,
  VizGeoFlow,
  VizGeoJsonFeatureCollection,
  VizGeoPoint,
} from "../types";

const geoPoints: VizGeoPoint[] = [
  { id: "a", latitude: 52, longitude: 13, metrics: { demand: 2 } },
  { id: "b", latitude: 52.2, longitude: 13.2, metrics: { demand: 3 } },
  { id: "outside", latitude: 40, longitude: 40, metrics: { demand: 5 } },
];

const geoJson: VizGeoJsonFeatureCollection = {
  features: [
    {
      geometry: { coordinates: [13, 52], type: "Point" },
      id: "visible",
      properties: { label: "Visible" },
      type: "Feature",
    },
    {
      geometry: { coordinates: [40, 40], type: "Point" },
      id: "outside",
      properties: { label: "Outside" },
      type: "Feature",
    },
  ],
  type: "FeatureCollection",
};

const flows: VizGeoFlow[] = [
  { from: [13, 52], id: "a", metrics: { demand: 2 }, to: [13.5, 52.5] },
  { from: [40, 40], id: "outside", metrics: { demand: 3 }, to: [41, 41] },
];

const financeDataset: VizFinanceDataset = {
  bars: [
    { close: 100, high: 101, low: 98, open: 99, timestamp: 1, volume: 10 },
    { close: 110, high: 112, low: 99, open: 100, timestamp: 2, volume: 20 },
    { close: 105, high: 111, low: 104, open: 110, timestamp: 3, volume: 30 },
  ],
  instrument: { symbol: "AAPL" },
  kind: "finance-ohlcv",
};

describe("JS/WASM backend parity", () => {
  test("matches geo point viewport summaries and point identities", () => {
    const query = {
      bounds: [12.9, 51.9, 13.3, 52.3] as [number, number, number, number],
      zoom: 12,
    };
    const js = new JsVizGeoPointIndex(geoPoints);
    const wasm = new WasmVizGeoPointIndex(geoPoints);

    expect(wasm.getBounds()).toEqual(js.getBounds());
    expect(pointAggregationSnapshot(wasm.getViewportAggregation(query, { radius: 1 }))).toEqual(
      pointAggregationSnapshot(js.getViewportAggregation(query, { radius: 1 })),
    );
  });

  test("matches geojson viewport filtering", () => {
    const query = {
      bounds: [12.9, 51.9, 13.2, 52.2] as [number, number, number, number],
      zoom: 12,
    };
    const js = new JsVizGeoJsonIndex(geoJson);
    const wasm = new WasmVizGeoJsonIndex(geoJson);

    expect(wasm.getBounds()).toEqual(js.getBounds());
    expect(wasm.getViewportFeatures(query)).toMatchObject({
      featureCount: js.getViewportFeatures(query).featureCount,
      viewportBounds: query.bounds,
      zoom: query.zoom,
    });
  });

  test("matches geo flow viewport summaries and weights", () => {
    const query = {
      bounds: [12.9, 51.9, 13.6, 52.6] as [number, number, number, number],
      zoom: 12,
    };
    const options = { weightMetric: "demand" };
    const js = new JsVizGeoFlowIndex(flows);
    const wasm = new WasmVizGeoFlowIndex(flows);

    expect(wasm.getBounds()).toEqual(js.getBounds());
    expect(flowAggregationSnapshot(wasm.getViewportFlows(query, options))).toEqual(
      flowAggregationSnapshot(js.getViewportFlows(query, options)),
    );
  });

  test("matches finance output while reporting JS-backed capabilities", () => {
    const js = new JsVizFinanceIndex(financeDataset);
    const wasm = new WasmVizFinanceIndex(financeDataset);

    expect(wasm.getBackendCapabilities()).toEqual({
      backend: "js",
      implementation: "js",
      usesWasm: false,
    });
    expect(wasm.getDownsampledBars({ targetBarCount: 2, xDomain: [1, 3] })).toEqual(
      js.getDownsampledBars({ targetBarCount: 2, xDomain: [1, 3] }),
    );
    expect(wasm.getReturns({ xDomain: [1, 3] }).samples).toEqual(
      js.getReturns({ xDomain: [1, 3] }).samples,
    );
  });
});

function pointAggregationSnapshot(
  aggregation: ReturnType<JsVizGeoPointIndex["getViewportAggregation"]>,
) {
  return {
    features: aggregation.features.map((feature) =>
      feature.kind === "point"
        ? { id: feature.point.id, kind: feature.kind, metrics: feature.metrics }
        : { kind: feature.kind, metrics: feature.metrics, pointCount: feature.pointCount },
    ),
    summary: aggregation.summary,
  };
}

function flowAggregationSnapshot(aggregation: ReturnType<JsVizGeoFlowIndex["getViewportFlows"]>) {
  return {
    features: aggregation.features.map((feature) => ({
      id: feature.flow.id,
      rawWeight: feature.rawWeight,
      value: feature.value,
    })),
    summary: aggregation.summary,
  };
}
