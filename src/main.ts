import "./styles.css";

import {
  runRendererBenchmark,
  type BenchmarkResult,
} from "./benchmark";
import { validateDisplayList } from "./core/display-list";
import { canvas2dRenderer } from "./renderers/canvas2d";
import { retainedWgpuRenderer } from "./renderers/retained-wgpu";
import type { FrameStats, Renderer } from "./renderers/types";
import { velloGpuRenderer } from "./renderers/vello";
import { wasmCanvas2dRenderer } from "./renderers/wasm-canvas2d";
import { wgpuPolygonRenderer } from "./renderers/wgpu";
import { filledPolygonScene } from "./scenes/filled-polygons";
import { mapLikeScene } from "./scenes/map-like";
import { retainedMapScene } from "./scenes/retained-map";
import type { BenchmarkWorkload } from "./scenes/types";
import { vectorAnimationScene } from "./scenes/vector-animation";

const workloads: readonly BenchmarkWorkload[] = [
  retainedMapScene,
  vectorAnimationScene,
  filledPolygonScene,
  mapLikeScene,
];

const renderers: readonly Renderer[] = [
  canvas2dRenderer,
  wasmCanvas2dRenderer,
  wgpuPolygonRenderer,
  retainedWgpuRenderer,
  velloGpuRenderer,
];

const velloCanvasRenderers: readonly Renderer[] = [
  canvas2dRenderer,
  velloGpuRenderer,
];

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`missing required element: ${selector}`);
  }
  return element;
}

let canvas = requiredElement<HTMLCanvasElement>("#surface");
const sceneSelect = requiredElement<HTMLSelectElement>("#scene");
const rendererSelect = requiredElement<HTMLSelectElement>("#renderer");
const animateInput = requiredElement<HTMLInputElement>("#animate");
const debugBoundsInput = requiredElement<HTMLInputElement>("#debug-bounds");
const benchmarkButton = requiredElement<HTMLButtonElement>("#benchmark");
const compareButton = requiredElement<HTMLButtonElement>("#compare");
const compareVelloCanvasButton =
  requiredElement<HTMLButtonElement>("#compare-vello-canvas");
const frameStats = requiredElement<HTMLPreElement>("#frame-stats");
const benchmarkStats = requiredElement<HTMLPreElement>("#benchmark-stats");
const comparisonStats =
  requiredElement<HTMLPreElement>("#comparison-stats");
const velloCanvasStats =
  requiredElement<HTMLPreElement>("#vello-canvas-stats");
const sceneDescription =
  requiredElement<HTMLParagraphElement>("#scene-description");

for (const workload of workloads) {
  sceneSelect.add(new Option(workload.name, workload.id));
}
for (const renderer of renderers) {
  rendererSelect.add(new Option(renderer.name, renderer.id));
}

function selectedWorkload(): BenchmarkWorkload {
  return (
    workloads.find((workload) => workload.id === sceneSelect.value) ?? workloads[0]!
  );
}

function selectedRenderer(): Renderer {
  return (
    renderers.find((renderer) => renderer.id === rendererSelect.value) ??
    renderers[0]!
  );
}

function replaceSurfaceCanvas(): void {
  const previous = canvas;
  const next = document.createElement("canvas");
  next.id = "surface";
  next.setAttribute("aria-label", "Rendering experiment canvas");
  previous.replaceWith(next);
  canvas = next;

  for (const renderer of renderers) {
    void renderer.dispose?.(previous);
  }
}

function formatBytes(value: number | null): string {
  if (value === null) {
    return "n/a";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  return `${(value / 1024).toFixed(1)} KiB`;
}

function formatCount(value: number | null): string {
  return value === null ? "n/a" : String(value);
}

function formatFrameStats(
  renderer: Renderer,
  stats: FrameStats,
): string {
  return [
    `renderer       ${renderer.name}`,
    `commands       ${stats.commandCount}`,
    `source points  ${stats.pointCount}`,
    `prepare        ${stats.prepareMs.toFixed(3)} ms`,
    `upload         ${stats.uploadMs.toFixed(3)} ms`,
    `render/submit  ${stats.renderMs.toFixed(3)} ms`,
    `draw calls     ${formatCount(stats.drawCalls)}`,
    `GPU vertices   ${formatCount(stats.vertexCount)}`,
    `upload bytes   ${formatBytes(stats.uploadBytes)}`,
    `WASM calls     ${stats.wasmCalls}`,
  ].join("\n");
}

function formatBenchmark(
  renderer: Renderer,
  workload: BenchmarkWorkload,
  result: BenchmarkResult,
): string {
  return [
    `renderer          ${renderer.name}`,
    `scene             ${workload.name}`,
    `frames            ${result.frames}`,
    `fresh surface     ${result.freshSurfaceMs.toFixed(3)} ms`,
    `average           ${result.averageMs.toFixed(3)} ms`,
    `p50               ${result.p50Ms.toFixed(3)} ms`,
    `p95               ${result.p95Ms.toFixed(3)} ms`,
    `prepare average   ${result.averagePrepareMs.toFixed(3)} ms`,
    `upload average    ${result.averageUploadMs.toFixed(3)} ms`,
    `render average    ${result.averageRenderMs.toFixed(3)} ms`,
    `commands/frame    ${result.commandCount}`,
    `points/frame      ${result.pointCount}`,
    `draw calls/frame  ${formatCount(result.drawCallsPerFrame)}`,
    `GPU vertices      ${formatCount(result.vertexCount)}`,
    `upload/frame      ${formatBytes(result.uploadBytesPerFrame)}`,
    `WASM calls/frame  ${result.wasmCallsPerFrame}`,
  ].join("\n");
}

function formatDecisionResult(
  renderer: Renderer,
  result: BenchmarkResult,
): string {
  return [
    renderer.name,
    `  fresh surface  ${result.freshSurfaceMs.toFixed(3)} ms`,
    `  p50            ${result.p50Ms.toFixed(3)} ms`,
    `  p95            ${result.p95Ms.toFixed(3)} ms`,
    `  prepare avg    ${result.averagePrepareMs.toFixed(3)} ms`,
    `  render avg     ${result.averageRenderMs.toFixed(3)} ms`,
  ].join("\n");
}

function formatRatio(numerator: number, denominator: number): string {
  return denominator > 0 ? `${(numerator / denominator).toFixed(2)}×` : "n/a";
}

let startTime = performance.now();
let frameInFlight = false;
let benchmarkInProgress = false;

async function pauseLiveRendering(): Promise<void> {
  benchmarkInProgress = true;
  while (frameInFlight) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function resumeLiveRendering(): void {
  benchmarkInProgress = false;
  startTime = performance.now();
}

async function drawFrame(timestamp: number): Promise<void> {
  if (frameInFlight || benchmarkInProgress) {
    return;
  }
  frameInFlight = true;

  try {
    const workload = selectedWorkload();
    const renderer = selectedRenderer();
    const options = { debugBounds: debugBoundsInput.checked };
    const timeSeconds = animateInput.checked
      ? (timestamp - startTime) / 1000
      : 0;
    const displayList = workload.create(timeSeconds);
    validateDisplayList(displayList);
    sceneDescription.textContent = workload.description;

    const supportError = renderer.support(displayList, options);
    if (supportError) {
      throw new Error(supportError);
    }

    const stats = await renderer.render(canvas, displayList, options);
    frameStats.textContent = formatFrameStats(renderer, stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    frameStats.textContent =
      `Renderer unavailable or unsupported:\n${message}\n\n` +
      "Rust renderers require `bun run build:wasm`; WebGPU requires browser WebGPU support in a secure context.";
  } finally {
    frameInFlight = false;
  }
}

function loop(timestamp: number): void {
  void drawFrame(timestamp);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

sceneSelect.addEventListener("change", () => {
  replaceSurfaceCanvas();
  startTime = performance.now();
  benchmarkStats.textContent = "Not run yet.";
  comparisonStats.textContent = "Not run yet.";
});

rendererSelect.addEventListener("change", () => {
  replaceSurfaceCanvas();
  startTime = performance.now();
  benchmarkStats.textContent = "Not run yet.";
});

animateInput.addEventListener("change", () => {
  startTime = performance.now();
});

benchmarkButton.addEventListener("click", async () => {
  benchmarkButton.disabled = true;
  compareButton.disabled = true;
  compareVelloCanvasButton.disabled = true;
  benchmarkStats.textContent = "Running deterministic 90-frame benchmark…";
  await pauseLiveRendering();

  const renderer = selectedRenderer();
  const workload = selectedWorkload();
  const benchmarkCanvas = document.createElement("canvas");

  try {
    const firstDisplayList = workload.create(0);
    benchmarkCanvas.width = firstDisplayList.width;
    benchmarkCanvas.height = firstDisplayList.height;

    const result = await runRendererBenchmark(
      renderer,
      benchmarkCanvas,
      workload,
      debugBoundsInput.checked,
    );

    benchmarkStats.textContent = formatBenchmark(renderer, workload, result);
  } catch (error) {
    benchmarkStats.textContent =
      error instanceof Error ? error.message : String(error);
  } finally {
    await renderer.dispose?.(benchmarkCanvas);
    resumeLiveRendering();
    benchmarkButton.disabled = false;
    compareButton.disabled = false;
    compareVelloCanvasButton.disabled = false;
  }
});

compareButton.addEventListener("click", async () => {
  benchmarkButton.disabled = true;
  compareButton.disabled = true;
  compareVelloCanvasButton.disabled = true;
  comparisonStats.textContent = "Running compatible renderer comparison…";
  await pauseLiveRendering();

  const workload = selectedWorkload();
  const options = { debugBounds: debugBoundsInput.checked };
  const firstDisplayList = workload.create(0);
  const sections: string[] = [
    `scene: ${workload.name}`,
    "45 deterministic frames per compatible renderer",
    "",
  ];

  try {
    for (const renderer of renderers) {
      const supportError = renderer.support(firstDisplayList, options);
      if (supportError) {
        sections.push(
          `${renderer.name}\n  skipped: ${supportError}\n`,
        );
        continue;
      }

      const benchmarkCanvas = document.createElement("canvas");
      benchmarkCanvas.width = firstDisplayList.width;
      benchmarkCanvas.height = firstDisplayList.height;

      try {
        const result = await runRendererBenchmark(
          renderer,
          benchmarkCanvas,
          workload,
          options.debugBounds,
          45,
        );
        sections.push(
          [
            renderer.name,
            `  fresh    ${result.freshSurfaceMs.toFixed(3)} ms`,
            `  average  ${result.averageMs.toFixed(3)} ms`,
            `  p95      ${result.p95Ms.toFixed(3)} ms`,
            `  prepare  ${result.averagePrepareMs.toFixed(3)} ms`,
            `  upload   ${result.averageUploadMs.toFixed(3)} ms`,
            `  render   ${result.averageRenderMs.toFixed(3)} ms`,
            `  draws    ${formatCount(result.drawCallsPerFrame)}`,
            `  upload   ${formatBytes(result.uploadBytesPerFrame)}/frame`,
            "",
          ].join("\n"),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        sections.push(
          `${renderer.name}\n  unavailable: ${message}\n`,
        );
      } finally {
        await renderer.dispose?.(benchmarkCanvas);
      }

      comparisonStats.textContent = sections.join("\n");
    }
  } finally {
    comparisonStats.textContent = sections.join("\n");
    resumeLiveRendering();
    benchmarkButton.disabled = false;
    compareButton.disabled = false;
    compareVelloCanvasButton.disabled = false;
  }
});

compareVelloCanvasButton.addEventListener("click", async () => {
  benchmarkButton.disabled = true;
  compareButton.disabled = true;
  compareVelloCanvasButton.disabled = true;
  velloCanvasStats.textContent = "Running Canvas 2D ↔ Vello benchmark matrix…";
  await pauseLiveRendering();

  const options = { debugBounds: false };
  const sections: string[] = [
    "Canvas 2D ↔ Vello decision matrix",
    "90 deterministic frames per renderer; live rendering paused",
    "fresh-surface timing includes per-canvas setup; shared module caches may already be warm",
    "renderer order alternates by scene to reduce systematic order bias",
    "",
  ];

  try {
    for (const [workloadIndex, workload] of workloads.entries()) {
      const firstDisplayList = workload.create(0);
      const results = new Map<string, BenchmarkResult>();
      const errors = new Map<string, string>();
      const runOrder =
        workloadIndex % 2 === 0
          ? velloCanvasRenderers
          : ([velloGpuRenderer, canvas2dRenderer] as const);

      for (const renderer of runOrder) {
        const supportError = renderer.support(firstDisplayList, options);
        if (supportError) {
          errors.set(renderer.id, supportError);
          continue;
        }

        const benchmarkCanvas = document.createElement("canvas");
        benchmarkCanvas.width = firstDisplayList.width;
        benchmarkCanvas.height = firstDisplayList.height;

        try {
          results.set(
            renderer.id,
            await runRendererBenchmark(
              renderer,
              benchmarkCanvas,
              workload,
              false,
              90,
            ),
          );
        } catch (error) {
          errors.set(
            renderer.id,
            error instanceof Error ? error.message : String(error),
          );
        } finally {
          await renderer.dispose?.(benchmarkCanvas);
        }
      }

      sections.push(workload.name);
      for (const renderer of velloCanvasRenderers) {
        const result = results.get(renderer.id);
        if (result) {
          sections.push(formatDecisionResult(renderer, result));
        } else {
          sections.push(
            `${renderer.name}\n  unavailable: ${errors.get(renderer.id) ?? "unknown error"}`,
          );
        }
      }

      const canvasResult = results.get(canvas2dRenderer.id);
      const velloResult = results.get(velloGpuRenderer.id);
      if (canvasResult && velloResult) {
        sections.push(
          `  Vello / Canvas p50  ${formatRatio(velloResult.p50Ms, canvasResult.p50Ms)}`,
          `  Vello / Canvas p95  ${formatRatio(velloResult.p95Ms, canvasResult.p95Ms)}`,
        );
      }
      sections.push("");
      velloCanvasStats.textContent = sections.join("\n");
    }
  } finally {
    velloCanvasStats.textContent = sections.join("\n");
    resumeLiveRendering();
    benchmarkButton.disabled = false;
    compareButton.disabled = false;
    compareVelloCanvasButton.disabled = false;
  }
});
