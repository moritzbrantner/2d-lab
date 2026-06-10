import {
  downsampleOhlcvBarsCompactInRange,
  lowerBoundTimestamp,
  normalizeFinanceInstrument,
  normalizeOhlcvBars,
  upperBoundTimestamp,
} from "./finance-utils";

import type {
  VizCompactFinanceReturns,
  VizFinanceBarsQuery,
  VizFinanceDataset,
  VizFinanceDownsampleQuery,
  VizFinanceIndex,
  VizFinanceReturnsQuery,
  VizFinanceRiskQuery,
  VizFinanceRiskSummary,
  VizFinancialInstrument,
  VizOhlcvBar,
  VizRenderBounds,
} from "../types";
import type { VizWasmModule } from "../wasm/types";

type FinanceDataSeriesIndex = {
  free?: () => void;
  getBars(query: unknown): unknown;
  getBounds(): unknown;
  getCompactReturns(query: unknown): unknown;
  getDownsampledBars(query: unknown): unknown;
  getRiskSummary(query: unknown): unknown;
};
type FinanceDataSeriesIndexConstructor = new (input: unknown) => FinanceDataSeriesIndex;

type RustFinanceBounds = {
  endMs: number;
  maxPrice: number;
  minPrice: number;
  startMs: number;
};

type RustOhlcvBar = {
  adjustedClose?: number;
  close: number;
  high: number;
  low: number;
  open: number;
  timestampMs: number;
  volume?: number;
};

type RustCompactReturns = {
  pointCount: number[];
  summary: {
    pointCount: number;
    sampleCount: number;
    xDomain: [number, number];
  };
  x: number[];
  y: number[];
};

type RustRiskSummary = Omit<VizFinanceRiskSummary, "maxDrawdown"> & {
  maxDrawdown: Omit<VizFinanceRiskSummary["maxDrawdown"], "recoveryIndex"> & {
    recoveryIndex?: number | null;
  };
};

export class WasmVizFinanceIndex<
  TProperties = Record<string, unknown>,
> implements VizFinanceIndex<TProperties> {
  private readonly bars: Array<VizOhlcvBar<TProperties>>;
  private readonly instrument: VizFinancialInstrument;
  private readonly rustIndex: FinanceDataSeriesIndex;
  private readonly timestampIndexLookup = new Map<number, number>();
  private readonly timestampLookup = new Map<number, VizOhlcvBar<TProperties>>();
  private disposed = false;

  constructor(
    dataset: VizFinanceDataset<TProperties>,
    wasmModule: Pick<VizWasmModule, "FinanceDataSeriesIndex" | "initVizEngineWasm">,
  ) {
    wasmModule.initVizEngineWasm();
    const FinanceIndex = wasmModule.FinanceDataSeriesIndex as FinanceDataSeriesIndexConstructor;

    this.instrument = normalizeFinanceInstrument(dataset.instrument);
    this.bars = normalizeOhlcvBars(dataset.bars);
    for (const [index, bar] of this.bars.entries()) {
      this.timestampLookup.set(bar.timestamp, bar);
      this.timestampIndexLookup.set(bar.timestamp, index);
    }
    this.rustIndex = new FinanceIndex({
      bars: this.bars.map(toRustBar),
      instrument: {
        assetClass: this.instrument.assetClass ?? "other",
        currency: this.instrument.currency,
        exchange: this.instrument.exchange,
        id: this.instrument.id ?? this.instrument.symbol,
        name: this.instrument.name,
        symbol: this.instrument.symbol,
      },
    });
  }

  getBackendCapabilities(): ReturnType<VizFinanceIndex<TProperties>["getBackendCapabilities"]> {
    return {
      backend: "wasm" as const,
      implementation: "rust-finance-data-wasm" as const,
      usesWasm: true,
    };
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.rustIndex.free?.();
    this.disposed = true;
  }

  getBars(query: VizFinanceBarsQuery): Array<VizOhlcvBar<TProperties>> {
    return (this.rustIndex.getBars(toRustRangeQuery(query)) as RustOhlcvBar[]).map((bar) =>
      this.fromRustBar(bar),
    );
  }

  getBounds(): VizRenderBounds | null {
    const bounds = this.rustIndex.getBounds() as RustFinanceBounds | null;

    return bounds ? [bounds.startMs, bounds.minPrice, bounds.endMs, bounds.maxPrice] : null;
  }

  getCompactBars(query: VizFinanceBarsQuery) {
    return downsampleOhlcvBarsCompactInRange(
      this.bars,
      {
        targetBarCount: Number.MAX_SAFE_INTEGER,
        xDomain: query.xDomain,
      },
      {
        end: upperBoundTimestamp(this.bars, query.xDomain[1]),
        start: lowerBoundTimestamp(this.bars, query.xDomain[0]),
      },
    );
  }

  getCompactDownsampledBars(query: VizFinanceDownsampleQuery) {
    return downsampleOhlcvBarsCompactInRange(this.bars, query, {
      end: upperBoundTimestamp(this.bars, query.xDomain[1]),
      start: lowerBoundTimestamp(this.bars, query.xDomain[0]),
    });
  }

  getCompactReturns(query: VizFinanceReturnsQuery): VizCompactFinanceReturns {
    const returns = this.rustIndex.getCompactReturns({
      adjusted: query.priceMode === "adjusted",
      endMs: query.xDomain[1],
      method: query.method ?? "simple",
      startMs: query.xDomain[0],
      targetCount: query.targetPointCount,
    }) as RustCompactReturns;

    return {
      pointCount: Uint32Array.from(returns.pointCount),
      x: Float64Array.from(returns.x),
      y: Float64Array.from(returns.y),
      summary: returns.summary,
    };
  }

  getDownsampledBars(query: VizFinanceDownsampleQuery): Array<VizOhlcvBar<TProperties>> {
    return (
      this.rustIndex.getDownsampledBars({
        endMs: query.xDomain[1],
        startMs: query.xDomain[0],
        targetCount: query.targetBarCount,
      }) as RustOhlcvBar[]
    ).map((bar) => this.fromRustBar(bar));
  }

  getInstrument(): VizFinancialInstrument {
    return this.instrument;
  }

  getReturns(query: VizFinanceReturnsQuery) {
    const compact = this.getCompactReturns(query);
    const bins = Array.from({ length: compact.x.length }, (_, index) => {
      const y = finiteOrNull(compact.y[index]);
      const pointCount = compact.pointCount[index] ?? 0;
      const x = compact.x[index] ?? 0;
      const sourceIndex = this.timestampIndexLookup.get(x) ?? index + 1;
      const point =
        y == null || pointCount === 0
          ? null
          : {
              id: `return-${sourceIndex}`,
              label: String(x),
              properties: this.timestampLookup.get(x)?.properties,
              sourceIndex,
              x,
              y,
            };

      return {
        averageY: y,
        firstPoint: point,
        firstPointIndex: point?.sourceIndex ?? null,
        index,
        lastPoint: point,
        lastPointIndex: point?.sourceIndex ?? null,
        maxY: y,
        metrics: {},
        minY: y,
        pointCount,
        sumY: y == null ? 0 : y * pointCount,
        x0: x,
        x1: x,
      };
    });
    const samples = bins.map((bin) => ({
      ...bin,
      x: bin.x1,
      y: bin.averageY,
    }));

    return {
      bins,
      samples,
      summary: {
        binCount: bins.length,
        metrics: {},
        pointCount: compact.summary.pointCount,
        sampleCount: samples.length,
        valueMode: "average" as const,
        xDomain: query.xDomain,
      },
    };
  }

  getRiskSummary(query: VizFinanceRiskQuery): VizFinanceRiskSummary {
    const summary = this.rustIndex.getRiskSummary({
      adjusted: query.priceMode === "adjusted",
      confidence: query.confidence,
      periodsPerYear: query.periodsPerYear,
      riskFreeReturnPerPeriod: query.riskFreeReturnPerPeriod,
    }) as RustRiskSummary;

    return {
      ...summary,
      maxDrawdown: {
        ...summary.maxDrawdown,
        recoveryIndex: summary.maxDrawdown.recoveryIndex ?? null,
      },
    };
  }

  private fromRustBar(bar: RustOhlcvBar): VizOhlcvBar<TProperties> {
    const original = this.timestampLookup.get(bar.timestampMs);

    return {
      adjustedClose: bar.adjustedClose,
      close: bar.close,
      high: bar.high,
      low: bar.low,
      metrics: original?.metrics,
      open: bar.open,
      properties: original?.properties,
      timestamp: bar.timestampMs,
      volume: bar.volume,
    };
  }
}

function toRustBar<TProperties>(bar: VizOhlcvBar<TProperties>): RustOhlcvBar {
  return {
    adjustedClose: bar.adjustedClose,
    close: bar.close,
    high: bar.high,
    low: bar.low,
    open: bar.open,
    timestampMs: bar.timestamp,
    volume: bar.volume,
  };
}

function toRustRangeQuery(query: VizFinanceBarsQuery) {
  return {
    endMs: query.xDomain[1],
    startMs: query.xDomain[0],
  };
}

function finiteOrNull(value: number | undefined) {
  return value == null || !Number.isFinite(value) ? null : value;
}
