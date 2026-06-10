import * as embeddedWasm from "./embedded-bindings";

import type { VizWasmModule } from "./types";

export const embeddedVizWasmModule = embeddedWasm as unknown as VizWasmModule;
