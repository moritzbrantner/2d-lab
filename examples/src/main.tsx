import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import type { VizSeriesPoint, VizValueMode } from "../../src";

import { VizEngineDemo } from "./VizEngineDemo";
import "./styles.css";

type ExamplePointProperties = {
  cohort: "weekday" | "weekend";
};

const valueModes: VizValueMode[] = ["average", "count", "max", "sum"];

function ExampleApp() {
  const [seed, setSeed] = useState(7);
  const [pointCount, setPointCount] = useState(24_000);
  const [targetBinCount, setTargetBinCount] = useState(180);
  const [valueMode, setValueMode] = useState<VizValueMode>("average");
  const [showHeatmap, setShowHeatmap] = useState(true);

  const points = useMemo(() => createExamplePoints(pointCount, seed), [pointCount, seed]);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">@moritzbrantner/viz-engine</p>
          <h1>Shared density-index renderer demo</h1>
        </div>
        <button className="button" onClick={() => setSeed((currentSeed) => currentSeed + 1)}>
          Regenerate data
        </button>
      </header>

      <section className="toolbar" aria-label="Example controls">
        <label className="control">
          <span>Points</span>
          <input
            max="80000"
            min="2000"
            onChange={(event) => setPointCount(Number(event.currentTarget.value))}
            step="2000"
            type="range"
            value={pointCount}
          />
          <strong>{pointCount.toLocaleString()}</strong>
        </label>

        <label className="control">
          <span>Series bins</span>
          <input
            max="320"
            min="32"
            onChange={(event) => setTargetBinCount(Number(event.currentTarget.value))}
            step="8"
            type="range"
            value={targetBinCount}
          />
          <strong>{targetBinCount}</strong>
        </label>

        <fieldset className="segmented-control">
          <legend>Value</legend>
          {valueModes.map((mode) => (
            <label key={mode}>
              <input
                checked={valueMode === mode}
                name="valueMode"
                onChange={() => setValueMode(mode)}
                type="radio"
              />
              <span>{mode}</span>
            </label>
          ))}
        </fieldset>

        <label className="switch">
          <input
            checked={showHeatmap}
            onChange={(event) => setShowHeatmap(event.currentTarget.checked)}
            type="checkbox"
          />
          <span>Heatmap layer</span>
        </label>
      </section>

      <VizEngineDemo
        bucketCount={48}
        points={points}
        showHeatmap={showHeatmap}
        targetBinCount={targetBinCount}
        valueMode={valueMode}
      />
    </main>
  );
}

function createExamplePoints(
  pointCount: number,
  seed: number,
): Array<VizSeriesPoint<ExamplePointProperties>> {
  const random = createSeededRandom(seed);

  return Array.from({ length: pointCount }, (_, index) => {
    const dayProgress = (index / Math.max(1, pointCount - 1)) * 1_440;
    const jitteredX = clamp(dayProgress + (random() - 0.5) * 18, 0, 1_440);
    const commuteWave = Math.sin((jitteredX / 1_440) * Math.PI * 4 - 0.6) * 22;
    const lunchPulse = Math.exp(-((jitteredX - 760) ** 2) / 18_000) * 34;
    const eveningPulse = Math.exp(-((jitteredX - 1_080) ** 2) / 22_000) * 24;
    const noise = (random() - 0.5) * 20;
    const cohort: ExamplePointProperties["cohort"] = index % 7 < 5 ? "weekday" : "weekend";
    const cohortBias = cohort === "weekday" ? 12 : -6;

    return {
      id: `point-${seed}-${index}`,
      label: minuteLabel(jitteredX),
      properties: { cohort },
      x: jitteredX,
      y: clamp(50 + commuteWave + lunchPulse + eveningPulse + cohortBias + noise, 4, 124),
    };
  }).sort((a, b) => a.x - b.x);
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;

    return state / 0x1_0000_0000;
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function minuteLabel(value: number) {
  const minutes = Math.round(value);
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const remainingMinutes = (minutes % 60).toString().padStart(2, "0");

  return `${hours}:${remainingMinutes}`;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ExampleApp />
  </StrictMode>,
);
