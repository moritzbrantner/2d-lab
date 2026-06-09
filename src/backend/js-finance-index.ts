import {
  barsInRange,
  createCompactOhlcvColumns,
  createCompactFinanceReturnSeriesFromColumns,
  createFinanceReturnSeries,
  downsampleOhlcvBarsCompactInRange,
  downsampleOhlcvBarsInRange,
  getFinanceBounds,
  getFinanceRiskSummary,
  lowerBoundTimestamp,
  normalizeFinanceInstrument,
  normalizeOhlcvBars,
  sliceCompactOhlcvColumns,
  upperBoundTimestamp,
  type CompactOhlcvColumns,
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
  private readonly compactColumns: CompactOhlcvColumns;
  protected readonly instrument: VizFinancialInstrument;

  constructor(dataset: VizFinanceDataset<TProperties>) {
    this.instrument = normalizeFinanceInstrument(dataset.instrument);
    this.bars = normalizeOhlcvBars(dataset.bars);
    this.compactColumns = createCompactOhlcvColumns(this.bars);
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
    return sliceCompactOhlcvColumns(
      this.compactColumns,
      query.xDomain,
      lowerBoundTimestamp(this.bars, query.xDomain[0]),
      upperBoundTimestamp(this.bars, query.xDomain[1]),
    );
  }

  getCompactDownsampledBars(query: VizFinanceDownsampleQuery) {
    const range = {
      end: upperBoundTimestamp(this.bars, query.xDomain[1]),
      start: lowerBoundTimestamp(this.bars, query.xDomain[0]),
    };
    const length = Math.max(0, range.end - range.start);
    const target = Math.floor(query.targetBarCount);
    if (Number.isFinite(query.targetBarCount) && query.targetBarCount > 0 && length <= target) {
      return sliceCompactOhlcvColumns(this.compactColumns, query.xDomain, range.start, range.end);
    }

    return downsampleOhlcvBarsCompactInRange(this.bars, query, range);
  }

  getCompactReturns(query: VizFinanceReturnsQuery) {
    return createCompactFinanceReturnSeriesFromColumns(this.compactColumns, query, {
      end: upperBoundTimestamp(this.bars, query.xDomain[1]),
      start: lowerBoundTimestamp(this.bars, query.xDomain[0]),
    });
  }

  getDownsampledBars(query: VizFinanceDownsampleQuery): Array<VizOhlcvBar<TProperties>> {
    return downsampleOhlcvBarsInRange(this.bars, query, {
      end: upperBoundTimestamp(this.bars, query.xDomain[1]),
      start: lowerBoundTimestamp(this.bars, query.xDomain[0]),
    });
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
