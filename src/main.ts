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
import type { SceneFixture } from "./scenes/types";
import { vectorAnimationScene } from "./scenes/vector-animation";

const fixtures: readonly SceneFixture[] = [
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
const frameStats = requiredElement<HTMLPreElement>("#frame-stats");
const benchmarkStats = requiredElement<HTMLPreElement>("#benchmark-stats");
const comparisonStats =
  requiredElement<HTMLPreElement>("#comparison-stats");
const sceneDescription =
  requiredElement<HTMLParagraphElement>("#scene-description");

for (const fixture of fixtures) {
  sceneSelect.add(new Option(fixture.name, fixture.id));
}
for (const renderer of renderers) {
  rendererSelect.add(new Option(renderer.name, renderer.id));
}

function selectedFixture(): SceneFixture {
  return (
    fixtures.find((fixture) => fixture.id === sceneSelect.value) ?? fixtures[0]!
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
  fixture: SceneFixture,
  result: BenchmarkResult,
): string {
  return [
    `renderer          ${renderer.name}`,
    `scene             ${fixture.name}`,
    `frames            ${result.frames}`,
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

let startTime = performance.now();
let frameInFlight = false;

async function drawFrame(timestamp: number): Promise<void> {
  if (frameInFlight) {
    return;
  }
  frameInFlight = true;

  try {
    const fixture = selectedFixture();
    const renderer = selectedRenderer();
    const options = { debugBounds: debugBoundsInput.checked };
    const timeSeconds = animateInput.checked
      ? (timestamp - startTime) / 1000
      : 0;
    const displayList = fixture.create(timeSeconds);
    validateDisplayList(displayList);
    sceneDescription.textContent = fixture.description;

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
  benchmarkStats.textContent = "Running deterministic 90-frame benchmark…";

  const renderer = selectedRenderer();
  const fixture = selectedFixture();
  const benchmarkCanvas = document.createElement("canvas");

  try {
    const firstDisplayList = fixture.create(0);
    benchmarkCanvas.width = firstDisplayList.width;
    benchmarkCanvas.height = firstDisplayList.height;

    const result = await runRendererBenchmark(
      renderer,
      benchmarkCanvas,
      fixture,
      debugBoundsInput.checked,
    );

    benchmarkStats.textContent = formatBenchmark(renderer, fixture, result);
  } catch (error) {
    benchmarkStats.textContent =
      error instanceof Error ? error.message : String(error);
  } finally {
    await renderer.dispose?.(benchmarkCanvas);
    benchmarkButton.disabled = false;
    compareButton.disabled = false;
  }
});

compareButton.addEventListener("click", async () => {
  benchmarkButton.disabled = true;
  compareButton.disabled = true;
  comparisonStats.textContent = "Running compatible renderer comparison…";

  const fixture = selectedFixture();
  const options = { debugBounds: debugBoundsInput.checked };
  const firstDisplayList = fixture.create(0);
  const sections: string[] = [
    `scene: ${fixture.name}`,
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
          fixture,
          options.debugBounds,
          45,
        );
        sections.push(
          [
            renderer.name,
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
    benchmarkButton.disabled = false;
    compareButton.disabled = false;
  }
});
