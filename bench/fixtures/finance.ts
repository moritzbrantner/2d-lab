import { createSeededRandom } from "./random";

import type { VizFinanceDataset, VizOhlcvBar } from "../../src/types";

export type FinanceFixture = {
  bars: VizOhlcvBar<{ regime: string }>[];
  dataset: VizFinanceDataset<{ regime: string }>;
  domains: {
    full: [number, number];
    last: [number, number];
    middle: [number, number];
  };
};

const financeCache = new Map<string, FinanceFixture>();

export function createFinanceFixture(size: number, seed: number): FinanceFixture {
  const cacheKey = `${size}:${seed}`;
  const cached = financeCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const random = createSeededRandom(seed ^ (size * 31));
  const bars: VizOhlcvBar<{ regime: string }>[] = [];
  const dayMs = 86_400_000;
  const start = Date.UTC(2010, 0, 1);
  let close = 100;

  for (let index = 0; index < size; index++) {
    const regime = index % 250 < 180 ? "normal" : "volatile";
    const volatility = regime === "normal" ? 0.012 : 0.032;
    const open = close;
    const drift = 0.0002;
    close = Math.max(1, open * Math.exp(drift + random.normal(0, volatility)));
    const high = Math.max(open, close) * (1 + random.between(0, volatility * 1.8));
    const low = Math.min(open, close) * (1 - random.between(0, volatility * 1.8));

    bars.push({
      adjustedClose: close * (1 - Math.min(0.2, (index / Math.max(1, size)) * 0.02)),
      close,
      high,
      low: Math.max(0.01, low),
      metrics: { trades: random.int(100, 25_000) },
      open,
      properties: { regime },
      timestamp: start + index * dayMs,
      volume: random.int(100_000, 5_000_000),
    });
  }

  const first = bars[0]?.timestamp ?? start;
  const last = bars[bars.length - 1]?.timestamp ?? start;
  const span = last - first;
  const fixture = {
    bars,
    dataset: {
      bars,
      instrument: { assetClass: "equity", currency: "USD", symbol: "BENCH" },
      kind: "finance-ohlcv" as const,
    },
    domains: {
      full: [first, last] as [number, number],
      last: [last - span * 0.05, last] as [number, number],
      middle: [first + span * 0.4, first + span * 0.6] as [number, number],
    },
  };

  financeCache.set(cacheKey, fixture);
  return fixture;
}
