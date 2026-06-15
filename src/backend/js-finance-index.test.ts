import { describe, expect, test } from "vitest";

import { JsVizFinanceIndex } from "./js-finance-index";

import type { VizFinanceDataset } from "../types";

const dataset: VizFinanceDataset = {
  bars: [
    { adjustedClose: 99, close: 100, high: 101, low: 98, open: 99, timestamp: 1, volume: 10 },
    { adjustedClose: 108, close: 110, high: 112, low: 99, open: 100, timestamp: 2, volume: 20 },
    { adjustedClose: 103, close: 105, high: 111, low: 104, open: 110, timestamp: 3, volume: 30 },
    { adjustedClose: 118, close: 120, high: 122, low: 103, open: 105, timestamp: 4, volume: 40 },
  ],
  instrument: { assetClass: "equity", currency: "USD", symbol: "AAPL" },
  kind: "finance-ohlcv",
};

describe("JsVizFinanceIndex", () => {
  test("filters and downsamples OHLCV bars with financial semantics", () => {
    const index = new JsVizFinanceIndex(dataset);

    expect(index.getBounds()).toEqual([1, 98, 4, 122]);
    expect(index.getBars({ xDomain: [2, 3] })).toHaveLength(2);
    expect(index.getDownsampledBars({ targetBarCount: 2, xDomain: [1, 4] })).toEqual([
      {
        adjustedClose: 108,
        close: 110,
        high: 112,
        low: 98,
        metrics: undefined,
        open: 99,
        properties: undefined,
        timestamp: 1,
        volume: 30,
      },
      {
        adjustedClose: 118,
        close: 120,
        high: 122,
        low: 103,
        metrics: undefined,
        open: 110,
        properties: undefined,
        timestamp: 3,
        volume: 70,
      },
    ]);
  });

  test("computes return series and risk summary", () => {
    const index = new JsVizFinanceIndex(dataset);
    const returns = index.getReturns({ method: "simple", xDomain: [1, 4] });

    expect(returns.samples[0]?.y).toBeCloseTo(0.1);
    expect(returns.samples[1]?.y).toBeCloseTo(-0.045454545454545414);
    expect(returns.samples[2]?.y).toBeCloseTo(0.1428571428571428);
    expect(index.getRiskSummary({ priceMode: "adjusted" }).annualizedVolatility).toBeGreaterThan(0);
  });

  test("computes typed returns and typed downsampled bars", () => {
    const index = new JsVizFinanceIndex(dataset);
    const typedBars = index.getTypedDownsampledBars({ targetBarCount: 2, xDomain: [1, 4] });
    const objectBars = index.getDownsampledBars({ targetBarCount: 2, xDomain: [1, 4] });
    const typedReturns = index.getTypedReturns({
      method: "simple",
      targetPointCount: 2,
      xDomain: [1, 4],
    });
    const objectReturns = index.getReturns({
      method: "simple",
      targetPointCount: 2,
      xDomain: [1, 4],
    });

    expect([...typedBars.open]).toEqual(objectBars.map((bar) => bar.open));
    expect([...typedBars.high]).toEqual(objectBars.map((bar) => bar.high));
    expect([...typedBars.low]).toEqual(objectBars.map((bar) => bar.low));
    expect([...typedBars.close]).toEqual(objectBars.map((bar) => bar.close));
    expect(typedBars.summary.barCount).toBe(objectBars.length);
    expect([...typedReturns.pointCount]).toEqual(
      objectReturns.samples.map((sample) => sample.pointCount),
    );
    expect([...typedReturns.x]).toEqual(objectReturns.samples.map((sample) => sample.x));
    expect([...typedReturns.y]).toEqual(objectReturns.samples.map((sample) => sample.y));
  });

  test("matches typed bars to object bars for full, viewport, and no-downsample ranges", () => {
    const index = new JsVizFinanceIndex(dataset);

    expectTypedBarsMatchObjects(
      index.getTypedBars({ xDomain: [1, 4] }),
      index.getBars({
        xDomain: [1, 4],
      }),
    );
    expectTypedBarsMatchObjects(
      index.getTypedBars({ xDomain: [2, 3] }),
      index.getBars({
        xDomain: [2, 3],
      }),
    );
    expectTypedBarsMatchObjects(
      index.getTypedDownsampledBars({ targetBarCount: 10, xDomain: [3, 4] }),
      index.getDownsampledBars({ targetBarCount: 10, xDomain: [3, 4] }),
    );
  });

  test("matches typed returns to object returns for full, viewport, and last-window ranges", () => {
    const index = new JsVizFinanceIndex(dataset);

    const domains: Array<[number, number]> = [
      [1, 4],
      [2, 4],
      [3, 4],
    ];

    for (const xDomain of domains) {
      const typed = index.getTypedReturns({ method: "simple", xDomain });
      const object = index.getReturns({ method: "simple", xDomain });

      expect([...typed.pointCount]).toEqual(object.samples.map((sample) => sample.pointCount));
      expect([...typed.x]).toEqual(object.samples.map((sample) => sample.x));
      expect([...typed.y]).toEqual(object.samples.map((sample) => sample.y));
      expect(typed.summary).toMatchObject({
        pointCount: object.summary.pointCount,
        sampleCount: object.summary.sampleCount,
        xDomain,
      });
    }
  });

  test("computes adjusted log returns over partial domains with downsampling", () => {
    const index = new JsVizFinanceIndex(dataset);
    const returns = index.getReturns({
      method: "log",
      priceMode: "adjusted",
      targetPointCount: 1,
      xDomain: [2, 4],
    });

    const expected = [Math.log(103 / 108), Math.log(118 / 103)];

    expect(returns.summary).toMatchObject({
      binCount: 1,
      pointCount: 2,
      sampleCount: 1,
      valueMode: "average",
      xDomain: [2, 4],
    });
    expect(returns.bins[0]).toMatchObject({
      firstPointIndex: 1,
      lastPointIndex: 2,
      pointCount: 2,
      x0: 3,
      x1: 4,
    });
    expect(returns.samples[0]?.y).toBeCloseTo((expected[0]! + expected[1]!) / 2);
    expect(returns.bins[0]?.minY).toBeCloseTo(Math.min(...expected));
    expect(returns.bins[0]?.maxY).toBeCloseTo(Math.max(...expected));
  });

  test("rejects invalid OHLCV input", () => {
    expect(
      () =>
        new JsVizFinanceIndex({
          ...dataset,
          bars: [{ close: 1, high: 0.5, low: 1, open: 1, timestamp: 1 }],
        }),
    ).toThrow(/high/);
  });
});

function expectTypedBarsMatchObjects(
  typed: ReturnType<JsVizFinanceIndex["getTypedBars"]>,
  objectBars: ReturnType<JsVizFinanceIndex["getBars"]>,
) {
  expect([...typed.adjustedClose]).toEqual(
    objectBars.map((bar) => bar.adjustedClose ?? Number.NaN),
  );
  expect([...typed.close]).toEqual(objectBars.map((bar) => bar.close));
  expect([...typed.high]).toEqual(objectBars.map((bar) => bar.high));
  expect([...typed.low]).toEqual(objectBars.map((bar) => bar.low));
  expect([...typed.open]).toEqual(objectBars.map((bar) => bar.open));
  expect([...typed.timestamp]).toEqual(objectBars.map((bar) => bar.timestamp));
  expect([...typed.volume]).toEqual(objectBars.map((bar) => bar.volume ?? Number.NaN));
  expect(typed.summary.barCount).toBe(objectBars.length);
}
