import { describe, expect, test } from "vitest";

import {
  deserializeVizError,
  isVizEngineError,
  serializeVizError,
  VizAbortError,
  VizEngineError,
  VizInvalidInputError,
} from "./errors";

describe("VizEngineError", () => {
  test("preserves code, details, cause, name, and message", () => {
    const cause = new Error("root cause");
    const error = new VizInvalidInputError("viz-invalid-layer", "Invalid layer.", {
      cause,
      details: { layerId: "layer-1" },
    });

    expect(error).toBeInstanceOf(VizEngineError);
    expect(error.code).toBe("viz-invalid-layer");
    expect(error.details).toEqual({ layerId: "layer-1" });
    expect(error.cause).toBe(cause);
    expect(error.name).toBe("VizInvalidInputError");
    expect(error.message).toBe("Invalid layer.");
    expect(isVizEngineError(error)).toBe(true);
  });

  test("serializes and deserializes subclasses", () => {
    const serialized = serializeVizError(
      new VizAbortError("Cancelled.", { details: { requestId: 1 } }),
    );
    const error = deserializeVizError(serialized);

    expect(serialized).toMatchObject({
      code: "viz-aborted",
      details: { requestId: 1 },
      message: "Cancelled.",
      name: "VizAbortError",
    });
    expect(error).toBeInstanceOf(VizAbortError);
    expect(error.code).toBe("viz-aborted");
    expect(error.details).toEqual({ requestId: 1 });
  });
});
