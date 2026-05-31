import type {
  VizBackendCapabilities,
  VizDensitySeries,
  VizMetricRecord,
  VizRenderBounds,
} from "./core";

export type VizFinancialInstrument = {
  assetClass?:
    | "bond"
    | "crypto"
    | "equity"
    | "etf"
    | "forex"
    | "fund"
    | "future"
    | "index"
    | "option"
    | "other";
  currency?: string;
  exchange?: string;
  id?: string;
  name?: string;
  symbol: string;
};

export type VizOhlcvBar<TProperties = Record<string, unknown>> = {
  adjustedClose?: number;
  close: number;
  high: number;
  low: number;
  metrics?: VizMetricRecord;
  open: number;
  properties?: TProperties;
  timestamp: number;
  volume?: number;
};

export type VizFinanceDataset<TProperties = Record<string, unknown>> = {
  bars: readonly VizOhlcvBar<TProperties>[];
  instrument: VizFinancialInstrument;
  kind: "finance-ohlcv";
};

export type VizFinanceBarsQuery = {
  xDomain: [number, number];
};

export type VizFinanceDownsampleQuery = VizFinanceBarsQuery & {
  targetBarCount: number;
};

export type VizFinanceReturnsQuery = {
  method?: "log" | "simple";
  priceMode?: "adjusted" | "raw";
  targetPointCount?: number;
  xDomain: [number, number];
};

export type VizFinanceRiskQuery = {
  confidence?: number;
  periodsPerYear?: number;
  priceMode?: "adjusted" | "raw";
  riskFreeReturnPerPeriod?: number;
};

export type VizFinanceRiskSummary = {
  annualizedReturn: number;
  annualizedVolatility: number;
  conditionalValueAtRisk: number;
  maxDrawdown: {
    depth: number;
    peakIndex: number;
    recoveryIndex: number | null;
    troughIndex: number;
  };
  meanReturn: number;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  stdDev: number;
  valueAtRisk: number;
};

export type VizFinanceIndex<TProperties = Record<string, unknown>> = {
  getBackendCapabilities(): VizBackendCapabilities;
  getBars(query: VizFinanceBarsQuery): Array<VizOhlcvBar<TProperties>>;
  getBounds(): VizRenderBounds | null;
  getDownsampledBars(query: VizFinanceDownsampleQuery): Array<VizOhlcvBar<TProperties>>;
  getReturns(query: VizFinanceReturnsQuery): VizDensitySeries<TProperties>;
  getRiskSummary(query: VizFinanceRiskQuery): VizFinanceRiskSummary;
};
