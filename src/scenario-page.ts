import "./styles.css";

import {
  runRendererBenchmark,
  type BenchmarkResult,
} from "./benchmark";
import { validateDisplayList } from "./core/display-list";
import { canvas2dRenderer } from "./renderers/canvas2d";
import {
  customWgpuRenderer,
  resolveCustomWgpuBackend,
} from "./renderers/custom-wgpu";
import type { FrameStats, Renderer } from "./renderers/types";
import { velloGpuRenderer } from "./renderers/vello";
import { loadScenarioWorkload } from "./scenario-loader";
import {
  findLabScenario,
  labScenarios,
  type LabScenario,
} from "./scenarios";
import { workloadProvenance } from "./scenes/provenance";
import type { BenchmarkWorkload } from "./scenes/types";

interface DecisionCandidate {
  readonly id: "canvas" | "vello" | "custom";
  readonly name: string;
}

interface ResolvedDecisionRenderer {
  readonly renderer: Renderer;
  readonly label: string;
}

interface ScenarioMeasurement {
  readonly label: string;
  readonly result: BenchmarkResult;
}

const decisionCandidates: readonly DecisionCandidate[] = [
  { id: "canvas", name: "Canvas 2D" },
  { id: "vello", name: "Vello" },
  { id: "custom", name: "2d-lab custom" },
];

const renderers: readonly Renderer[] = [
  canvas2dRenderer,
  velloGpuRenderer,
  customWgpuRenderer,
];

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`missing required element: ${selector}`);
  }
  return element;
}

function scenarioIndex(scenario: LabScenario): number {
  return Math.max(
    0,
    labScenarios.findIndex((candidate) => candidate.id === scenario.id),
  );
}

function scenarioHref(scenario: LabScenario): string {
  return `${import.meta.env.BASE_URL}${scenario.path}`;
}

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

  const customBackend = resolveCustomWgpuBackend(displayList, options);
  if (typeof customBackend === "string") {
    return customBackend;
  }

  return {
    renderer: customBackend.renderer,
    label: `2d-lab custom · Rust/WASM + wgpu · ${customBackend.label}`,
  };
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

function formatMilliseconds(value: number): string {
  return `${value.toFixed(3)} ms`;
}

function formatFrameStats(renderer: Renderer, stats: FrameStats): string {
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
    `scenario          ${workload.name}`,
    `frames            ${result.frames}`,
    `fresh surface     ${result.freshSurfaceMs.toFixed(3)} ms`,
    `average           ${result.averageMs.toFixed(3)} ms`,
    `p50               ${result.p50Ms.toFixed(3)} ms`,
    `p95               ${result.p95Ms.toFixed(3)} ms`,
    `prepare average   ${result.averagePrepareMs.toFixed(3)} ms`,
    `upload average    ${result.averageUploadMs.toFixed(3)} ms`,
    `render average    ${result.averageRenderMs.toFixed(3)} ms`,
    `draw calls/frame  ${formatCount(result.drawCallsPerFrame)}`,
    `GPU vertices      ${formatCount(result.vertexCount)}`,
    `upload/frame      ${formatBytes(result.uploadBytesPerFrame)}`,
    `WASM calls/frame  ${result.wasmCallsPerFrame}`,
  ].join("\n");
}

function renderScenarioMeasurements(
  results: ReadonlyMap<DecisionCandidate["id"], ScenarioMeasurement>,
  errors: ReadonlyMap<DecisionCandidate["id"], string>,
): void {
  scenarioResultsBody.replaceChildren();

  for (const candidate of decisionCandidates) {
    const row = scenarioResultsBody.insertRow();
    row.insertCell().textContent = candidate.name;
    const measured = results.get(candidate.id);

    if (!measured) {
      const support = row.insertCell();
      support.className = "unsupported";
      support.textContent =
        errors.get(candidate.id) ?? "Unsupported or unavailable.";
      for (let column = 0; column < 5; column += 1) {
        row.insertCell().textContent = "—";
      }
      continue;
    }

    row.insertCell().textContent = measured.label;
    row.insertCell().textContent = formatMilliseconds(
      measured.result.freshSurfaceMs,
    );
    row.insertCell().textContent = formatMilliseconds(measured.result.p50Ms);
    row.insertCell().textContent = formatMilliseconds(measured.result.p95Ms);
    row.insertCell().textContent = formatMilliseconds(
      measured.result.averagePrepareMs,
    );
    row.insertCell().textContent = formatMilliseconds(
      measured.result.averageRenderMs,
    );
  }
}

const scenarioId = document.body.dataset.scenarioId;
const scenario = findLabScenario(scenarioId ?? null);
if (!scenario) {
  throw new Error(`scenario page has unknown id: ${scenarioId ?? "missing"}`);
}

const workload = await loadScenarioWorkload(scenario.id);
if (workload.id !== scenario.id) {
  throw new Error(
    `scenario/workload mismatch: ${scenario.id} loaded ${workload.id}`,
  );
}

let canvas = requiredElement<HTMLCanvasElement>("#surface");
const rendererSelect = requiredElement<HTMLSelectElement>("#renderer");
const animateInput = requiredElement<HTMLInputElement>("#animate");
const debugBoundsInput = requiredElement<HTMLInputElement>("#debug-bounds");
const benchmarkButton = requiredElement<HTMLButtonElement>("#benchmark");
const compareButton = requiredElement<HTMLButtonElement>("#compare");
const frameStats = requiredElement<HTMLPreElement>("#frame-stats");
const benchmarkStats = requiredElement<HTMLPreElement>("#benchmark-stats");
const scenarioRunStatus =
  requiredElement<HTMLSpanElement>("#scenario-run-status");
const scenarioResultsBody =
  requiredElement<HTMLTableSectionElement>("#scenario-results-body");
const scenarioTitle = requiredElement<HTMLHeadingElement>("#scenario-title");
const scenarioProgress =
  requiredElement<HTMLParagraphElement>("#scenario-progress");
const scenarioUseCase =
  requiredElement<HTMLParagraphElement>("#scenario-use-case");
const scenarioQuestion =
  requiredElement<HTMLParagraphElement>("#scenario-question");
const sceneDescription =
  requiredElement<HTMLParagraphElement>("#scene-description");
const sceneProvenance =
  requiredElement<HTMLParagraphElement>("#scene-provenance");
const catalogLink = requiredElement<HTMLAnchorElement>("#catalog-link");
const previousScenarioLink =
  requiredElement<HTMLAnchorElement>("#previous-scenario");
const nextScenarioLink =
  requiredElement<HTMLAnchorElement>("#next-scenario");

document.title = `${scenario.title} · 2d-lab`;
scenarioTitle.textContent = scenario.title;
scenarioUseCase.textContent = scenario.useCase;
scenarioQuestion.textContent = scenario.question;
const index = scenarioIndex(scenario);
scenarioProgress.textContent = `Scenario ${index + 1} of ${labScenarios.length}`;
catalogLink.href = import.meta.env.BASE_URL;

const previousScenario = labScenarios[index - 1];
if (previousScenario) {
  previousScenarioLink.href = scenarioHref(previousScenario);
  previousScenarioLink.textContent = `← ${previousScenario.title}`;
} else {
  previousScenarioLink.hidden = true;
}

const nextScenario = labScenarios[index + 1];
if (nextScenario) {
  nextScenarioLink.href = scenarioHref(nextScenario);
  nextScenarioLink.textContent = `${nextScenario.title} →`;
} else {
  nextScenarioLink.hidden = true;
}

for (const renderer of renderers) {
  rendererSelect.add(new Option(renderer.name, renderer.id));
}

const provenance = workloadProvenance[workload.id];
sceneDescription.textContent = workload.description;
sceneProvenance.textContent = provenance
  ? [
      provenance.kind === "consumer-shaped"
        ? "Consumer-shaped workload"
        : "Lab-owned synthetic workload",
      provenance.sourceRepository
        ? `${provenance.sourceRepository}@${provenance.sourceRevision ?? "unpinned"}`
        : null,
      provenance.sourceIdentity ?? null,
      provenance.note,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" · ")
  : "No workload provenance declared.";

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
  next.setAttribute("aria-label", `${scenario.title} rendering surface`);
  previous.replaceWith(next);
  canvas = next;

  for (const renderer of renderers) {
    void renderer.dispose?.(previous);
  }
}

function setMeasurementInProgress(inProgress: boolean): void {
  rendererSelect.disabled = inProgress;
  animateInput.disabled = inProgress;
  debugBoundsInput.disabled = inProgress;
  benchmarkButton.disabled = inProgress;
  compareButton.disabled = inProgress;
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
    const renderer = selectedRenderer();
    const options = { debugBounds: debugBoundsInput.checked };
    const timeSeconds = animateInput.checked
      ? (timestamp - startTime) / 1000
      : 0;
    const displayList = workload.create(timeSeconds);
    validateDisplayList(displayList);

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
      "Rust renderers require the WASM build; WebGPU requires browser WebGPU support in a secure context.";
  } finally {
    frameInFlight = false;
  }
}

function loop(timestamp: number): void {
  void drawFrame(timestamp);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

rendererSelect.addEventListener("change", () => {
  replaceSurfaceCanvas();
  startTime = performance.now();
  benchmarkStats.textContent = "Not run yet.";
});

animateInput.addEventListener("change", () => {
  startTime = performance.now();
});

benchmarkButton.addEventListener("click", async () => {
  setMeasurementInProgress(true);
  benchmarkStats.textContent =
    `Running deterministic ${scenario.frames}-frame benchmark…`;
  await pauseLiveRendering();

  const renderer = selectedRenderer();
  const benchmarkCanvas = document.createElement("canvas");
  const firstDisplayList = workload.create(0);
  benchmarkCanvas.width = firstDisplayList.width;
  benchmarkCanvas.height = firstDisplayList.height;

  try {
    const result = await runRendererBenchmark(
      renderer,
      benchmarkCanvas,
      workload,
      debugBoundsInput.checked,
      scenario.frames,
    );
    benchmarkStats.textContent = formatBenchmark(renderer, workload, result);
  } catch (error) {
    benchmarkStats.textContent =
      error instanceof Error ? error.message : String(error);
  } finally {
    await renderer.dispose?.(benchmarkCanvas);
    resumeLiveRendering();
    setMeasurementInProgress(false);
  }
});

compareButton.addEventListener("click", async () => {
  setMeasurementInProgress(true);
  await pauseLiveRendering();

  const firstDisplayList = workload.create(0);
  const results = new Map<DecisionCandidate["id"], ScenarioMeasurement>();
  const errors = new Map<DecisionCandidate["id"], string>();
  const offset = index % decisionCandidates.length;
  const runOrder = [
    ...decisionCandidates.slice(offset),
    ...decisionCandidates.slice(0, offset),
  ];

  scenarioRunStatus.textContent =
    `Running ${scenario.frames} deterministic frames per engine…`;
  scenarioResultsBody.replaceChildren();
  const pendingRow = scenarioResultsBody.insertRow();
  const pendingCell = pendingRow.insertCell();
  pendingCell.colSpan = 7;
  pendingCell.textContent = "Collecting measurements…";

  try {
    for (const [runIndex, candidate] of runOrder.entries()) {
      scenarioRunStatus.textContent =
        `Measuring ${candidate.name} (${runIndex + 1}/${runOrder.length})…`;

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
          scenario.frames,
        );
        results.set(candidate.id, { label: resolved.label, result });
      } catch (error) {
        errors.set(
          candidate.id,
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        await resolved.renderer.dispose?.(benchmarkCanvas);
      }
    }

    renderScenarioMeasurements(results, errors);
    scenarioRunStatus.textContent =
      `Complete: ${results.size}/${decisionCandidates.length} engines measured on this isolated page.`;
  } finally {
    resumeLiveRendering();
    setMeasurementInProgress(false);
  }
});
