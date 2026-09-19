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

interface DecisionCandidate {
  readonly id: "canvas" | "vello" | "custom";
  readonly name: string;
}

interface ResolvedDecisionRenderer {
  readonly renderer: Renderer;
  readonly label: string;
}

const decisionCandidates: readonly DecisionCandidate[] = [
  { id: "canvas", name: "Canvas 2D" },
  { id: "vello", name: "Vello" },
  { id: "custom", name: "2d-lab custom" },
];

function resolveDecisionRenderer(
  candidate: DecisionCandidate,
  displayList: ReturnType<BenchmarkWorkload["create"]>,
): ResolvedDecisionRenderer | string {
  const options = { debugBounds: false };

  if (candidate.id === "canvas") {
    return {
      renderer: canvas2dRenderer,
      label: "Canvas 2D · TypeScript prepared geometry",
    };
  }

  if (candidate.id === "vello") {
    const supportError = velloGpuRenderer.support(displayList, options);
    return supportError
      ? supportError
      : {
          renderer: velloGpuRenderer,
          label: "Vello GPU · pinned upstream",
        };
  }

  const retainedError = retainedWgpuRenderer.support(displayList, options);
  if (!retainedError) {
    return {
      renderer: retainedWgpuRenderer,
      label: "2d-lab custom · retained WebGPU",
    };
  }

  const immediateError = wgpuPolygonRenderer.support(displayList, options);
  if (!immediateError) {
    return {
      renderer: wgpuPolygonRenderer,
      label: "2d-lab custom · immediate WebGPU",
    };
  }

  return [
    "No current custom backend preserves this workload's semantics.",
    `retained: ${retainedError}`,
    `immediate: ${immediateError}`,
  ].join(" ");
}

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
const compareDecisionMatrixButton =
  requiredElement<HTMLButtonElement>("#compare-decision-matrix");
const frameStats = requiredElement<HTMLPreElement>("#frame-stats");
const benchmarkStats = requiredElement<HTMLPreElement>("#benchmark-stats");
const comparisonStats =
  requiredElement<HTMLPreElement>("#comparison-stats");
const decisionMatrixStats =
  requiredElement<HTMLPreElement>("#decision-matrix-stats");
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
  label: string,
  result: BenchmarkResult,
): string {
  return [
    label,
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
  compareDecisionMatrixButton.disabled = true;
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
    compareDecisionMatrixButton.disabled = false;
  }
});

compareButton.addEventListener("click", async () => {
  benchmarkButton.disabled = true;
  compareButton.disabled = true;
  compareDecisionMatrixButton.disabled = true;
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
    compareDecisionMatrixButton.disabled = false;
  }
});

compareDecisionMatrixButton.addEventListener("click", async () => {
  benchmarkButton.disabled = true;
  compareButton.disabled = true;
  compareDecisionMatrixButton.disabled = true;
  decisionMatrixStats.textContent =
    "Running Canvas 2D ↔ Vello ↔ custom benchmark matrix…";
  await pauseLiveRendering();

  const sections: string[] = [
    "Canvas 2D ↔ Vello ↔ 2d-lab custom decision matrix",
    "90 deterministic frames per engine; live rendering paused",
    "fresh-surface timing includes per-canvas setup; shared module caches may already be warm",
    "engine order rotates by scene to reduce systematic order bias",
    "custom selects the most specialized semantics-preserving 2d-lab backend and reports which one ran",
    "",
  ];
  const coverage = new Map<DecisionCandidate["id"], number>(
    decisionCandidates.map((candidate) => [candidate.id, 0]),
  );

  try {
    for (const [workloadIndex, workload] of workloads.entries()) {
      const firstDisplayList = workload.create(0);
      const results = new Map<
        DecisionCandidate["id"],
        { readonly label: string; readonly result: BenchmarkResult }
      >();
      const errors = new Map<DecisionCandidate["id"], string>();
      const offset = workloadIndex % decisionCandidates.length;
      const runOrder = [
        ...decisionCandidates.slice(offset),
        ...decisionCandidates.slice(0, offset),
      ];

      for (const candidate of runOrder) {
        const resolved = resolveDecisionRenderer(candidate, firstDisplayList);
        if (typeof resolved === "string") {
          errors.set(candidate.id, resolved);
          continue;
        }

        const benchmarkCanvas = document.createElement("canvas");
        benchmarkCanvas.width = firstDisplayList.width;
        benchmarkCanvas.height = firstDisplayList.height;

        try {
          const result = await runRendererBenchmark(
            resolved.renderer,
            benchmarkCanvas,
            workload,
            false,
            90,
          );
          results.set(candidate.id, { label: resolved.label, result });
          coverage.set(candidate.id, (coverage.get(candidate.id) ?? 0) + 1);
        } catch (error) {
          errors.set(
            candidate.id,
            error instanceof Error ? error.message : String(error),
          );
        } finally {
          await resolved.renderer.dispose?.(benchmarkCanvas);
        }
      }

      sections.push(workload.name);
      for (const candidate of decisionCandidates) {
        const measured = results.get(candidate.id);
        if (measured) {
          sections.push(
            formatDecisionResult(measured.label, measured.result),
          );
        } else {
          sections.push(
            `${candidate.name}\n  unsupported/unavailable: ${errors.get(candidate.id) ?? "unknown error"}`,
          );
        }
      }

      const canvasResult = results.get("canvas")?.result;
      const velloResult = results.get("vello")?.result;
      const customResult = results.get("custom")?.result;
      if (canvasResult && velloResult) {
        sections.push(
          `  Vello / Canvas p50   ${formatRatio(velloResult.p50Ms, canvasResult.p50Ms)}`,
          `  Vello / Canvas p95   ${formatRatio(velloResult.p95Ms, canvasResult.p95Ms)}`,
        );
      }
      if (canvasResult && customResult) {
        sections.push(
          `  Custom / Canvas p50  ${formatRatio(customResult.p50Ms, canvasResult.p50Ms)}`,
          `  Custom / Canvas p95  ${formatRatio(customResult.p95Ms, canvasResult.p95Ms)}`,
        );
      }
      sections.push("");
      decisionMatrixStats.textContent = sections.join("\n");
    }

    sections.push(
      "Semantic coverage",
      ...decisionCandidates.map(
        (candidate) =>
          `  ${candidate.name.padEnd(14)} ${coverage.get(candidate.id) ?? 0}/${workloads.length} workloads`,
      ),
      "",
      "An unsupported custom row is evidence of a capability gap, not a failed benchmark.",
    );
  } finally {
    decisionMatrixStats.textContent = sections.join("\n");
    resumeLiveRendering();
    benchmarkButton.disabled = false;
    compareButton.disabled = false;
    compareDecisionMatrixButton.disabled = false;
  }
});
