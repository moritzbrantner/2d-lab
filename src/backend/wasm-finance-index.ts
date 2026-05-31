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
      backend: "js" as const,
      implementation: "js" as const,
      usesWasm: false,
    };
  }
}
