import "./styles.css";

import { runRendererBenchmark } from "./benchmark";
import { validateDisplayList } from "./core/display-list";
import { canvas2dRenderer } from "./renderers/canvas2d";
import type { Renderer } from "./renderers/types";
import { wasmCanvas2dRenderer } from "./renderers/wasm-canvas2d";
import { mapLikeScene } from "./scenes/map-like";
import type { SceneFixture } from "./scenes/types";
import { vectorAnimationScene } from "./scenes/vector-animation";

const fixtures: readonly SceneFixture[] = [mapLikeScene, vectorAnimationScene];
const renderers: readonly Renderer[] = [canvas2dRenderer, wasmCanvas2dRenderer];

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`missing required element: ${selector}`);
  }
  return element;
}

function requiredCanvas2DContext(
  canvas: HTMLCanvasElement,
): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D is unavailable");
  }
  return context;
}

const canvas = requiredElement<HTMLCanvasElement>("#surface");
const context = requiredCanvas2DContext(canvas);

const sceneSelect = requiredElement<HTMLSelectElement>("#scene");
const rendererSelect = requiredElement<HTMLSelectElement>("#renderer");
const animateInput = requiredElement<HTMLInputElement>("#animate");
const debugBoundsInput = requiredElement<HTMLInputElement>("#debug-bounds");
const benchmarkButton = requiredElement<HTMLButtonElement>("#benchmark");
const frameStats = requiredElement<HTMLPreElement>("#frame-stats");
const benchmarkStats = requiredElement<HTMLPreElement>("#benchmark-stats");
const sceneDescription =
  requiredElement<HTMLParagraphElement>("#scene-description");

for (const fixture of fixtures) {
  sceneSelect.add(new Option(fixture.name, fixture.id));
}
for (const renderer of renderers) {
  rendererSelect.add(new Option(renderer.name, renderer.id));
}

function selectedFixture(): SceneFixture {
  return fixtures.find((fixture) => fixture.id === sceneSelect.value) ?? fixtures[0]!;
}

function selectedRenderer(): Renderer {
  return renderers.find((renderer) => renderer.id === rendererSelect.value) ?? renderers[0]!;
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
    const timeSeconds = animateInput.checked
      ? (timestamp - startTime) / 1000
      : 0;
    const displayList = fixture.create(timeSeconds);
    validateDisplayList(displayList);

    if (canvas.width !== displayList.width || canvas.height !== displayList.height) {
      canvas.width = displayList.width;
      canvas.height = displayList.height;
    }

    sceneDescription.textContent = fixture.description;

    const stats = await renderer.render(context, displayList, {
      debugBounds: debugBoundsInput.checked,
    });

    frameStats.textContent = [
      `renderer     ${renderer.name}`,
      `commands     ${stats.commandCount}`,
      `points       ${stats.pointCount}`,
      `prepare      ${stats.prepareMs.toFixed(3)} ms`,
      `draw         ${stats.drawMs.toFixed(3)} ms`,
      `WASM calls   ${stats.wasmCalls}`,
    ].join("\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    frameStats.textContent =
      `Renderer unavailable or failed:\n${message}\n\n` +
      "Build the WASM package with `bun run build:wasm` before selecting the Rust/WASM path locally.";
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
  startTime = performance.now();
  benchmarkStats.textContent = "Not run yet.";
});

rendererSelect.addEventListener("change", () => {
  benchmarkStats.textContent = "Not run yet.";
});

animateInput.addEventListener("change", () => {
  startTime = performance.now();
});

benchmarkButton.addEventListener("click", async () => {
  benchmarkButton.disabled = true;
  benchmarkStats.textContent = "Running deterministic 90-frame benchmark…";

  try {
    const renderer = selectedRenderer();
    const fixture = selectedFixture();
    const firstDisplayList = fixture.create(0);
    const benchmarkCanvas = document.createElement("canvas");
    benchmarkCanvas.width = firstDisplayList.width;
    benchmarkCanvas.height = firstDisplayList.height;
    const benchmarkContext = benchmarkCanvas.getContext("2d");
    if (!benchmarkContext) {
      throw new Error("Canvas 2D is unavailable for the benchmark");
    }

    const result = await runRendererBenchmark(
      renderer,
      benchmarkContext,
      fixture,
      debugBoundsInput.checked,
    );

    benchmarkStats.textContent = [
      `renderer          ${renderer.name}`,
      `scene             ${fixture.name}`,
      `frames            ${result.frames}`,
      `average           ${result.averageMs.toFixed(3)} ms`,
      `p50               ${result.p50Ms.toFixed(3)} ms`,
      `p95               ${result.p95Ms.toFixed(3)} ms`,
      `prepare average   ${result.averagePrepareMs.toFixed(3)} ms`,
      `draw average      ${result.averageDrawMs.toFixed(3)} ms`,
      `commands/frame    ${result.commandCount}`,
      `points/frame      ${result.pointCount}`,
      `WASM calls/frame  ${result.wasmCallsPerFrame}`,
    ].join("\n");
  } catch (error) {
    benchmarkStats.textContent =
      error instanceof Error ? error.message : String(error);
  } finally {
    benchmarkButton.disabled = false;
  }
});
