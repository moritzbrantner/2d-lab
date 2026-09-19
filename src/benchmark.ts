import type { Renderer } from "./renderers/types";
import type { SceneFixture } from "./scenes/types";

export interface BenchmarkResult {
  readonly frames: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly averageMs: number;
  readonly averagePrepareMs: number;
  readonly averageDrawMs: number;
  readonly commandCount: number;
  readonly pointCount: number;
  readonly wasmCallsPerFrame: number;
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
  context: CanvasRenderingContext2D,
  fixture: SceneFixture,
  debugBounds: boolean,
  frames = 90,
): Promise<BenchmarkResult> {
  const displayLists = Array.from({ length: frames }, (_, index) =>
    fixture.create(index / 30),
  );

  for (let index = 0; index < Math.min(8, frames); index += 1) {
    await renderer.render(context, displayLists[index]!, { debugBounds });
  }

  const frameTimes: number[] = [];
  let prepareTotal = 0;
  let drawTotal = 0;
  let finalStats = await renderer.render(context, displayLists[0]!, {
    debugBounds,
  });

  for (const displayList of displayLists) {
    const start = performance.now();
    finalStats = await renderer.render(context, displayList, { debugBounds });
    frameTimes.push(performance.now() - start);
    prepareTotal += finalStats.prepareMs;
    drawTotal += finalStats.drawMs;
  }

  const sorted = [...frameTimes].sort((left, right) => left - right);
  const total = frameTimes.reduce((sum, value) => sum + value, 0);

  return {
    frames,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    averageMs: total / frames,
    averagePrepareMs: prepareTotal / frames,
    averageDrawMs: drawTotal / frames,
    commandCount: finalStats.commandCount,
    pointCount: finalStats.pointCount,
    wasmCallsPerFrame: finalStats.wasmCalls,
  };
}
