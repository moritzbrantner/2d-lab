import type { FrameStats, Renderer } from "./renderers/types";
import type { BenchmarkWorkload } from "./scenes/types";

export interface BenchmarkResult {
  readonly frames: number;
  readonly freshSurfaceMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly averageMs: number;
  readonly averagePrepareMs: number;
  readonly averageUploadMs: number;
  readonly averageRenderMs: number;
  readonly commandCount: number;
  readonly pointCount: number;
  readonly wasmCallsPerFrame: number;
  readonly drawCallsPerFrame: number | null;
  readonly vertexCount: number | null;
  readonly uploadBytesPerFrame: number | null;
}

function percentile(
  sortedValues: readonly number[],
  percentileValue: number,
): number {
  if (sortedValues.length === 0) {
    return 0;
  }
  const index = Math.min(
    sortedValues.length - 1,
    Math.floor((sortedValues.length - 1) * percentileValue),
  );
  return sortedValues[index] ?? 0;
}

export async function runRendererBenchmark(
  renderer: Renderer,
  canvas: HTMLCanvasElement,
  workload: BenchmarkWorkload,
  debugBounds: boolean,
  frames = 90,
): Promise<BenchmarkResult> {
  if (frames <= 0) {
    throw new Error("benchmark frame count must be positive");
  }

  const options = { debugBounds };
  const displayLists = Array.from({ length: frames }, (_, index) =>
    workload.create(index / 30),
  );
  const supportError = renderer.support(displayLists[0]!, options);
  if (supportError) {
    throw new Error(supportError);
  }

  const freshSurfaceStart = performance.now();
  await renderer.render(canvas, displayLists[0]!, options);
  const freshSurfaceMs = performance.now() - freshSurfaceStart;

  for (let index = 1; index < Math.min(8, frames); index += 1) {
    await renderer.render(canvas, displayLists[index]!, options);
  }

  const frameTimes: number[] = [];
  let prepareTotal = 0;
  let uploadTotal = 0;
  let renderTotal = 0;
  let finalStats: FrameStats | undefined;

  for (const displayList of displayLists) {
    const start = performance.now();
    finalStats = await renderer.render(canvas, displayList, options);
    frameTimes.push(performance.now() - start);
    prepareTotal += finalStats.prepareMs;
    uploadTotal += finalStats.uploadMs;
    renderTotal += finalStats.renderMs;
  }

  if (!finalStats) {
    throw new Error("benchmark produced no frame statistics");
  }

  const sorted = [...frameTimes].sort((left, right) => left - right);
  const total = frameTimes.reduce((sum, value) => sum + value, 0);

  return {
    frames,
    freshSurfaceMs,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    averageMs: total / frames,
    averagePrepareMs: prepareTotal / frames,
    averageUploadMs: uploadTotal / frames,
    averageRenderMs: renderTotal / frames,
    commandCount: finalStats.commandCount,
    pointCount: finalStats.pointCount,
    wasmCallsPerFrame: finalStats.wasmCalls,
    drawCallsPerFrame: finalStats.drawCalls,
    vertexCount: finalStats.vertexCount,
    uploadBytesPerFrame: finalStats.uploadBytes,
  };
}
