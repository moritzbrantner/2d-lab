import { createFinanceCases } from "./finance";
import { createFrameCases } from "./frame";
import { createGeoCases } from "./geo";
import { createTableCases } from "./table";
import { limitCasesForBrowser } from "./utils";
import { createWasmStartupCases } from "./wasm-startup";
import { createXyCases } from "./xy";

import type { BenchmarkCase, BenchmarkConfig } from "../types";

export function createBenchmarkCases(config: BenchmarkConfig): BenchmarkCase[] {
  const cases: BenchmarkCase[] = [
    ...createXyCases(config),
    ...createGeoCases(config),
    ...createFinanceCases(config),
    ...createTableCases(config),
    ...createFrameCases(config),
    ...(config.runtime === "browser" ? [] : createWasmStartupCases(config)),
  ];

  return limitCasesForBrowser(cases, config);
}
