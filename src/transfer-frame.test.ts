import { describe, expect, test } from "vitest";

import { createVizEngine } from "./create-viz-engine";
import { getVizFrameTransferables } from "./transfer-frame";

describe("getVizFrameTransferables", () => {
  test("returns no buffers for object frames", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({
      kind: "xy",
      points: [
        { x: 0, y: 1 },
        { x: 1, y: 2 },
      ],
    });
    engine.addLayer({ datasetId, kind: "binned-series", targetBinCount: 2, xDomain: [0, 1] });

    const frame = engine.computeFrame({
      frameFormat: "objects",
      viewport: { height: 100, width: 100, xDomain: [0, 1] },
    });

    expect(getVizFrameTransferables(frame)).toEqual([]);
  });

  test("returns unique typed-array buffers from mixed typed frames", () => {
    const engine = createVizEngine({ backend: "js" });
    const xyDatasetId = engine.addDataset({
      kind: "xy",
      points: [
        { x: 0, y: 1 },
        { x: 1, y: 2 },
      ],
    });
    const geoDatasetId = engine.addDataset({
      kind: "geo-points",
      points: [{ latitude: 52, longitude: 13, metrics: { demand: 2 } }],
    });
    engine.addLayer({
      datasetId: xyDatasetId,
      kind: "binned-series",
      targetBinCount: 2,
      xDomain: [0, 1],
    });
    engine.addLayer({ datasetId: geoDatasetId, kind: "geo-points" });

    const frame = engine.computeFrame({
      frameFormat: "typed",
      viewport: {
        bounds: [12, 51, 14, 53],
        center: [13, 52],
        display: "flat",
        height: 100,
        kind: "geo",
        width: 100,
        zoom: 1,
      },
    });
    const buffers = getVizFrameTransferables(frame);

    expect(buffers.length).toBeGreaterThan(0);
    expect(new Set(buffers).size).toBe(buffers.length);
  });

  test("returns typed table buffers without requiring string arrays to be transferable", () => {
    const engine = createVizEngine({ backend: "js" });
    const datasetId = engine.addDataset({
      columns: [
        { id: "name", values: ["Ada", "Ben"] },
        { id: "score", type: "number", values: [10, 5] },
        { id: "createdAt", type: "date", values: [1_704_067_200_000, null] },
        { id: "active", type: "boolean", values: [true, false] },
      ],
      kind: "table",
    });
    engine.addLayer({ datasetId, kind: "table" });

    const frame = engine.computeFrame({
      frameFormat: "typed",
      viewport: { kind: "table" },
    });
    const buffers = getVizFrameTransferables(frame);

    expect(buffers.length).toBeGreaterThanOrEqual(7);
    expect(new Set(buffers).size).toBe(buffers.length);
    expect(buffers.every((buffer) => buffer instanceof ArrayBuffer)).toBe(true);
  });
});
