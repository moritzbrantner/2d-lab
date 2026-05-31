import {
  barsInRange,
  createCompactFinanceReturnSeries,
  createFinanceReturnSeries,
  downsampleOhlcvBarsCompact,
  downsampleOhlcvBars,
  getFinanceBounds,
  getFinanceRiskSummary,
  lowerBoundTimestamp,
  normalizeFinanceInstrument,
  normalizeOhlcvBars,
  upperBoundTimestamp,
} from "./finance-utils";

import type {
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

export class JsVizFinanceIndex<
  TProperties = Record<string, unknown>,
> implements VizFinanceIndex<TProperties> {
  protected readonly bars: Array<VizOhlcvBar<TProperties>>;
  protected readonly instrument: VizFinancialInstrument;

  constructor(dataset: VizFinanceDataset<TProperties>) {
    this.instrument = normalizeFinanceInstrument(dataset.instrument);
    this.bars = normalizeOhlcvBars(dataset.bars);
  }

  getBackendCapabilities(): ReturnType<VizFinanceIndex<TProperties>["getBackendCapabilities"]> {
    return {
      backend: "js" as const,
      implementation: "js" as const,
      usesWasm: false,
    };
  }

  getBars(query: VizFinanceBarsQuery): Array<VizOhlcvBar<TProperties>> {
    return barsInRange(this.bars, query.xDomain);
  }

  getBounds(): VizRenderBounds | null {
    return getFinanceBounds(this.bars);
  }

  getCompactBars(query: VizFinanceBarsQuery) {
    return downsampleOhlcvBarsCompact(this.bars, {
      targetBarCount: Number.MAX_SAFE_INTEGER,
      xDomain: query.xDomain,
    });
  }

  getCompactDownsampledBars(query: VizFinanceDownsampleQuery) {
    return downsampleOhlcvBarsCompact(this.bars, query);
  }

  getCompactReturns(query: VizFinanceReturnsQuery) {
    return createCompactFinanceReturnSeries(this.bars, query, {
      end: upperBoundTimestamp(this.bars, query.xDomain[1]),
      start: lowerBoundTimestamp(this.bars, query.xDomain[0]),
    });
  }

  getDownsampledBars(query: VizFinanceDownsampleQuery): Array<VizOhlcvBar<TProperties>> {
    return downsampleOhlcvBars(this.getBars(query), query.targetBarCount);
  }

  getInstrument(): VizFinancialInstrument {
    return this.instrument;
  }

  getReturns(query: VizFinanceReturnsQuery) {
    return createFinanceReturnSeries(this.bars, query, {
      end: upperBoundTimestamp(this.bars, query.xDomain[1]),
      start: lowerBoundTimestamp(this.bars, query.xDomain[0]),
    });
  }

  getRiskSummary(query: VizFinanceRiskQuery): VizFinanceRiskSummary {
    return getFinanceRiskSummary(this.bars, query);
  }
}
