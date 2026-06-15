import { describe, expect, test } from "vitest";

import * as core from "./core";
import * as root from "./index";
import * as react from "./react";

const coreExports = ["createVizEngine", "getVizFrameTransferables", "VizEngineError"] as const;
const reactExports = [
  "VizEngineProvider",
  "useVizEngine",
  "useVizFrame",
  "useVizTypedFrame",
] as const;

describe("public export surfaces", () => {
  test("root export is core-only", () => {
    for (const exportName of coreExports) {
      expect(root).toHaveProperty(exportName);
    }

    for (const exportName of reactExports) {
      expect(root).not.toHaveProperty(exportName);
    }
  });

  test("core export excludes React bindings", () => {
    for (const exportName of coreExports) {
      expect(core).toHaveProperty(exportName);
    }

    for (const exportName of reactExports) {
      expect(core).not.toHaveProperty(exportName);
    }
  });

  test("React export exposes lifecycle bindings", () => {
    for (const exportName of reactExports) {
      expect(react).toHaveProperty(exportName);
    }
  });
});
