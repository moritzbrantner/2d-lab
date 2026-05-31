import { createBenchmarkCases } from "../cases";
import { createBenchmarkConfig } from "../config";
import { runBenchmarkCases } from "../runner";

import type { BenchmarkMode, BenchmarkRunResult } from "../types";

declare global {
  interface Window {
    __VIZ_ENGINE_BENCH_RESULTS__?: BenchmarkRunResult;
    runVizEngineBench: (mode?: BenchmarkMode) => Promise<BenchmarkRunResult>;
  }
}

window.runVizEngineBench = async (mode: BenchmarkMode = "full") => {
  const config = createBenchmarkConfig({ mode, runtime: "browser" });
  const cases = createBenchmarkCases(config);
  const status = document.getElementById("status");

  const result = await runBenchmarkCases({
    cases,
    config,
    environment: {
      browserName: "chromium",
      deviceMemory:
        "deviceMemory" in navigator
          ? ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null)
          : null,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      runtime: "browser",
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      wasmSupported: typeof WebAssembly !== "undefined",
    },
    getMemoryMb: () => {
      const performanceWithMemory = performance as Performance & {
        memory?: { usedJSHeapSize?: number };
      };
      return performanceWithMemory.memory?.usedJSHeapSize == null
        ? null
        : performanceWithMemory.memory.usedJSHeapSize / 1024 / 1024;
    },
    onCaseStart(benchmarkCase, index, total) {
      if (status) {
        status.textContent = `[${index}/${total}] ${benchmarkCase.id}`;
      }
    },
  });

  window.__VIZ_ENGINE_BENCH_RESULTS__ = result;
  if (status) {
    status.textContent = `Complete: ${result.results.length} cases`;
  }
  return result;
};
