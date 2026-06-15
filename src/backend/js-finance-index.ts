import {
  barsInRange,
  createTypedOhlcvColumns,
  createTypedFinanceReturnSeriesFromColumns,
  createFinanceReturnSeries,
  downsampleOhlcvBarsTypedInRange,
  downsampleOhlcvBarsInRange,
  getFinanceBounds,
  getFinanceRiskSummary,
  lowerBoundTimestamp,
  normalizeFinanceInstrument,
  normalizeOhlcvBars,
  sliceTypedOhlcvColumns,
  upperBoundTimestamp,
  type TypedOhlcvColumns,
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
  private readonly typedColumns: TypedOhlcvColumns;
  protected readonly instrument: VizFinancialInstrument;

  constructor(dataset: VizFinanceDataset<TProperties>) {
    this.instrument = normalizeFinanceInstrument(dataset.instrument);
    this.bars = normalizeOhlcvBars(dataset.bars);
    this.typedColumns = createTypedOhlcvColumns(this.bars);
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

  getTypedBars(query: VizFinanceBarsQuery) {
    return sliceTypedOhlcvColumns(
      this.typedColumns,
      query.xDomain,
      lowerBoundTimestamp(this.bars, query.xDomain[0]),
      upperBoundTimestamp(this.bars, query.xDomain[1]),
    );
  }

  getTypedDownsampledBars(query: VizFinanceDownsampleQuery) {
    const range = {
      end: upperBoundTimestamp(this.bars, query.xDomain[1]),
      start: lowerBoundTimestamp(this.bars, query.xDomain[0]),
    };
    const length = Math.max(0, range.end - range.start);
    const target = Math.floor(query.targetBarCount);
    if (Number.isFinite(query.targetBarCount) && query.targetBarCount > 0 && length <= target) {
      return sliceTypedOhlcvColumns(this.typedColumns, query.xDomain, range.start, range.end);
    }

    return downsampleOhlcvBarsTypedInRange(this.bars, query, range);
  }

  getTypedReturns(query: VizFinanceReturnsQuery) {
    return createTypedFinanceReturnSeriesFromColumns(this.typedColumns, query, {
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
