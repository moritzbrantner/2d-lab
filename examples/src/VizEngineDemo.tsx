import { useMemo, useState, type PointerEvent } from "react";

import {
  VizEngineProvider,
  useVizDataset,
  useVizEngine,
  useVizFrame,
  useVizLayer,
  type VizHitTestResult,
  type VizRenderLayer,
  type VizSeriesPoint,
  type VizValueMode,
} from "../../src";

type VizEngineDemoProps = {
  bucketCount: number;
  points: readonly VizSeriesPoint[];
  showHeatmap: boolean;
  targetBinCount: number;
  valueMode: VizValueMode;
};

const viewport = {
  height: 420,
  width: 960,
  xDomain: [0, 1_440] as [number, number],
};
const yDomain = [0, 130] as [number, number];
const plotPadding = {
  bottom: 36,
  left: 36,
  right: 16,
  top: 16,
};
const plotWidth = viewport.width - plotPadding.left - plotPadding.right;
const plotHeight = viewport.height - plotPadding.top - plotPadding.bottom;

export function VizEngineDemo(props: VizEngineDemoProps) {
  return (
    <VizEngineProvider backend="auto">
      <VizEngineDemoLayers {...props} />
    </VizEngineProvider>
  );
}

function VizEngineDemoLayers({
  bucketCount,
  points,
  showHeatmap,
  targetBinCount,
  valueMode,
}: VizEngineDemoProps) {
  const engine = useVizEngine();
  const datasetId = useVizDataset(points);
  const [hit, setHit] = useState<VizHitTestResult | null>(null);

  const heatmapLayer = useMemo(
    () =>
      datasetId && showHeatmap
        ? {
            datasetId,
            kind: "heatmap" as const,
            xBinCount: 80,
            xDomain: viewport.xDomain,
            yBinCount: 28,
            yDomain,
          }
        : null,
    [datasetId, showHeatmap],
  );
  const histogramLayer = useMemo(
    () =>
      datasetId
        ? {
            bucketCount,
            datasetId,
            kind: "histogram" as const,
            xDomain: viewport.xDomain,
          }
        : null,
    [bucketCount, datasetId],
  );
  const binnedLayer = useMemo(
    () =>
      datasetId
        ? {
            datasetId,
            kind: "binned-series" as const,
            targetBinCount,
            valueMode,
            xDomain: viewport.xDomain,
          }
        : null,
    [datasetId, targetBinCount, valueMode],
  );

  const heatmapLayerId = useVizLayer(heatmapLayer);
  const histogramLayerId = useVizLayer(histogramLayer);
  const binnedLayerId = useVizLayer(binnedLayer);
  const frameDependencies = useMemo(
    () => [heatmapLayerId, histogramLayerId, binnedLayerId],
    [binnedLayerId, heatmapLayerId, histogramLayerId],
  );
  const frame = useVizFrame(viewport, frameDependencies);

  const summary = {
    backend: frame.stats.backend.toUpperCase(),
    computeMs: `${frame.stats.computeMs.toFixed(2)} ms`,
    datasets: frame.stats.datasetCount.toLocaleString(),
    layers: frame.stats.layerCount.toLocaleString(),
    sourcePoints: points.length.toLocaleString(),
  };

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const point = getSvgPoint(event);

    setHit(engine.hitTest({ viewport, x: point.x, y: point.y }));
  }

  return (
    <section className="demo-grid">
      <div className="chart-panel">
        <svg
          aria-label="Viz engine demo chart"
          className="chart"
          onPointerLeave={() => setHit(null)}
          onPointerMove={handlePointerMove}
          role="img"
          viewBox={`0 0 ${viewport.width} ${viewport.height}`}
        >
          <ChartFrame />
          {frame.layers.map((layer) => (
            <VizEngineLayer key={layer.layerId} layer={layer} />
          ))}
          {hit ? <HitMarker hit={hit} /> : null}
        </svg>
      </div>

      <aside className="stats-panel" aria-label="Frame stats">
        <dl className="stats-list">
          {Object.entries(summary).map(([label, value]) => (
            <div key={label}>
              <dt>{label.replace(/([A-Z])/g, " $1")}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <div className="hit-readout">
          <span>Hit test</span>
          <strong>{hit?.sourcePointId ?? "No point"}</strong>
          <p>
            {hit
              ? `${hit.pointCount.toLocaleString()} point bin at ${minuteLabel(hit.x)}`
              : "Move over the series path"}
          </p>
        </div>
      </aside>
    </section>
  );
}

function ChartFrame() {
  const ticks = [0, 360, 720, 1_080, 1_440];
  const yTicks = [0, 32.5, 65, 97.5, 130];

  return (
    <g className="chart-frame">
      <rect height={plotHeight} width={plotWidth} x={plotPadding.left} y={plotPadding.top} />
      {yTicks.map((tick) => {
        const y = scaleY(tick);

        return (
          <g key={tick}>
            <line x1={plotPadding.left} x2={viewport.width - plotPadding.right} y1={y} y2={y} />
            <text x={plotPadding.left - 10} y={y + 4}>
              {Math.round(tick)}
            </text>
          </g>
        );
      })}
      {ticks.map((tick) => {
        const x = scaleX(tick);

        return (
          <text key={tick} x={x} y={viewport.height - 10}>
            {minuteLabel(tick)}
          </text>
        );
      })}
    </g>
  );
}

function VizEngineLayer({ layer }: { layer: VizRenderLayer }) {
  if (layer.kind === "heatmap") {
    const maxCount = Math.max(1, ...layer.cells.map((cell) => cell.pointCount));

    return (
      <g className="heatmap-layer">
        {layer.cells.map((cell) => {
          if (cell.pointCount === 0) {
            return null;
          }

          const opacity = Math.min(0.72, 0.08 + (cell.pointCount / maxCount) * 0.64);

          return (
            <rect
              height={Math.max(1, scaleY(cell.y0) - scaleY(cell.y1) - 1)}
              key={cell.index}
              opacity={opacity}
              width={Math.max(1, scaleX(cell.x1) - scaleX(cell.x0) - 1)}
              x={scaleX(cell.x0)}
              y={scaleY(cell.y1)}
            />
          );
        })}
      </g>
    );
  }

  if (layer.kind === "histogram") {
    const maxCount = Math.max(1, ...layer.buckets.map((bucket) => bucket.pointCount));

    return (
      <g className="histogram-layer">
        {layer.buckets.map((bucket) => {
          const height = (bucket.pointCount / maxCount) * 108;

          return (
            <rect
              height={height}
              key={bucket.index}
              rx={1}
              width={Math.max(1, scaleX(bucket.value1) - scaleX(bucket.value0) - 2)}
              x={scaleX(bucket.value0)}
              y={viewport.height - plotPadding.bottom - height}
            />
          );
        })}
      </g>
    );
  }

  if (layer.kind !== "binned-series") {
    return null;
  }

  const path = layer.rows
    .filter((row) => row.value !== null)
    .map((row, index) => {
      const x = scaleX(row.x);
      const y = scaleY(row.value ?? 0);

      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return <path className="series-layer" d={path} />;
}

function HitMarker({ hit }: { hit: VizHitTestResult }) {
  const x = scaleX(hit.x);
  const y = scaleY(hit.y ?? 0);

  return (
    <g className="hit-marker">
      <line x1={x} x2={x} y1={plotPadding.top} y2={viewport.height - plotPadding.bottom} />
      {hit.y !== null ? <circle cx={x} cy={y} r={5} /> : null}
    </g>
  );
}

function scaleX(value: number) {
  const [min, max] = viewport.xDomain;

  return plotPadding.left + ((value - min) / (max - min)) * plotWidth;
}

function scaleY(value: number) {
  const [min, max] = yDomain;

  return plotPadding.top + (1 - (value - min) / (max - min)) * plotHeight;
}

function getSvgPoint(event: PointerEvent<SVGSVGElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();

  return {
    x: ((event.clientX - bounds.left) / bounds.width) * viewport.width,
    y: ((event.clientY - bounds.top) / bounds.height) * viewport.height,
  };
}

function minuteLabel(value: number) {
  const minutes = Math.round(value);
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const remainingMinutes = (minutes % 60).toString().padStart(2, "0");

  return `${hours}:${remainingMinutes}`;
}
