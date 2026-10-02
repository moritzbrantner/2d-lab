import { describe, expect, it } from "vitest";

import { runRendererBenchmark } from "./benchmark";
import type { FrameStats, Renderer } from "./renderers/types";
import type { BenchmarkWorkload } from "./scenes/types";

function stats(drawCalls: number | null): FrameStats {
  return {
    prepareMs: 0,
    uploadMs: 0,
    renderMs: 0,
    commandCount: 1,
    pointCount: 1,
    wasmCalls: 0,
    drawCalls,
    vertexCount: null,
    uploadBytes: null,
  };
}

function rendererWithDrawCalls(
  drawCallsFor: (frame: number) => number | null,
): Renderer {
  return {
    id: "fake",
    name: "fake",
    support: () => null,
    render: async (_canvas, displayList) =>
      stats(drawCallsFor((displayList as unknown as { frame: number }).frame)),
  };
}

const workload = {
  create: (seconds: number) => ({ frame: Math.round(seconds * 30) }),
} as unknown as BenchmarkWorkload;
const canvas = {} as HTMLCanvasElement;

describe("runRendererBenchmark", () => {
  it("averages draw calls across measured frames instead of reporting the final frame", async () => {
    const result = await runRendererBenchmark(
      rendererWithDrawCalls((frame) => (frame === 3 ? 24 : 20)),
      canvas,
      workload,
      false,
      4,
    );

    expect(result.drawCallsPerFrame).toBe(21);
  });

  it("reports draw calls as unavailable when any frame lacks the metric", async () => {
    const result = await runRendererBenchmark(
      rendererWithDrawCalls((frame) => (frame === 1 ? null : 5)),
      canvas,
      workload,
      false,
      4,
    );

    expect(result.drawCallsPerFrame).toBeNull();
  });
});

