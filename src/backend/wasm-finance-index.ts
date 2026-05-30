import { JsVizFinanceIndex } from "./js-finance-index";

import type { VizFinanceDataset, VizFinanceIndex } from "../types";

export class WasmVizFinanceIndex<
  TProperties = Record<string, unknown>,
> extends JsVizFinanceIndex<TProperties> {
  constructor(dataset: VizFinanceDataset<TProperties>) {
    super(dataset);
  }

  getBackendCapabilities(): ReturnType<VizFinanceIndex<TProperties>["getBackendCapabilities"]> {
    return {
      backend: "wasm" as const,
      implementation: "rust-finance-data-wasm" as const,
      usesWasm: true,
    };
  }
}
