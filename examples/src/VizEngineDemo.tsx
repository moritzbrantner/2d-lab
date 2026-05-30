import { Card, CardContent, Stat, StatGroup, StatLabel, StatValue } from "@moritzbrantner/ui";
import { useMemo, useState, type PointerEvent } from "react";

import {
  VizEngineProvider,
  useVizDataset,
  useVizEngine,
  useVizFrame,
  useVizLayer,
  type VizHitTestResult,
  type VizOhlcvBar,
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
const defaultYDomain = [0, 130] as [number, number];
const plotPadding = {
  bottom: 36,
  left: 36,
  right: 16,
  top: 16,
};
const plotWidth = viewport.width - plotPadding.left - plotPadding.right;
const plotHeight = viewport.height - plotPadding.top - plotPadding.bottom;
const financeBars: VizOhlcvBar[] = [
  { close: 94, high: 96, low: 90, open: 91, timestamp: 120, volume: 10_200 },
  { close: 102, high: 104, low: 93, open: 94, timestamp: 240, volume: 12_400 },
  { close: 99, high: 106, low: 97, open: 102, timestamp: 360, volume: 9_800 },
  { close: 111, high: 113, low: 98, open: 99, timestamp: 480, volume: 15_100 },
  { close: 118, high: 121, low: 109, open: 111, timestamp: 600, volume: 13_500 },
  { close: 114, high: 122, low: 112, open: 118, timestamp: 720, volume: 11_900 },
  { close: 123, high: 125, low: 113, open: 114, timestamp: 840, volume: 16_700 },
  { close: 119, high: 126, low: 117, open: 123, timestamp: 960, volume: 14_100 },
  { close: 127, high: 130, low: 118, open: 119, timestamp: 1_080, volume: 17_300 },
  { close: 124, high: 129, low: 122, open: 127, timestamp: 1_200, volume: 12_800 },
];

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
  const financeDataset = useMemo(
    () => ({
      bars: financeBars,
      instrument: { assetClass: "equity" as const, currency: "USD", symbol: "AAPL" },
      kind: "finance-ohlcv" as const,
    }),
    [],
  );
  const financeDatasetId = useVizDataset(financeDataset);
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
            yDomain: defaultYDomain,
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
  const financeCandleLayer = useMemo(
    () =>
      financeDatasetId
        ? {
            datasetId: financeDatasetId,
            kind: "finance-candles" as const,
            targetBarCount: 10,
            xDomain: viewport.xDomain,
          }
        : null,
    [financeDatasetId],
  );
  const financeLineLayer = useMemo(
    () =>
      financeDatasetId
        ? {
            datasetId: financeDatasetId,
            kind: "finance-line" as const,
            value: "close" as const,
            xDomain: viewport.xDomain,
          }
        : null,
    [financeDatasetId],
  );
  const financeReturnsLayer = useMemo(
    () =>
      financeDatasetId
        ? {
            datasetId: financeDatasetId,
            kind: "finance-returns" as const,
            method: "simple" as const,
            xDomain: viewport.xDomain,
          }
        : null,
    [financeDatasetId],
  );

  const heatmapLayerId = useVizLayer(heatmapLayer);
  const histogramLayerId = useVizLayer(histogramLayer);
  const binnedLayerId = useVizLayer(binnedLayer);
  const financeCandleLayerId = useVizLayer(financeCandleLayer);
  const financeLineLayerId = useVizLayer(financeLineLayer);
  const financeReturnsLayerId = useVizLayer(financeReturnsLayer);
  const frameDependencies = useMemo(
    () => [
      heatmapLayerId,
      histogramLayerId,
      binnedLayerId,
      financeCandleLayerId,
      financeLineLayerId,
      financeReturnsLayerId,
    ],
    [
      binnedLayerId,
      financeCandleLayerId,
      financeLineLayerId,
      financeReturnsLayerId,
      heatmapLayerId,
      histogramLayerId,
    ],
  );
  const frame = useVizFrame(viewport, frameDependencies);
  const chartYDomain = useMemo(() => deriveChartYDomain(frame.layers), [frame.layers]);

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
      <Card className="min-w-0 p-3">
        <CardContent className="p-0">
          <svg
            aria-label="Viz engine demo chart"
            className="chart"
            onPointerLeave={() => setHit(null)}
            onPointerMove={handlePointerMove}
            role="img"
            viewBox={`0 0 ${viewport.width} ${viewport.height}`}
          >
            <ChartFrame yDomain={chartYDomain} />
            {frame.layers.map((layer) => (
              <VizEngineLayer key={layer.layerId} layer={layer} yDomain={chartYDomain} />
            ))}
            {hit ? <HitMarker hit={hit} yDomain={chartYDomain} /> : null}
          </svg>
        </CardContent>
      </Card>

      <Card className="stats-panel" aria-label="Frame stats">
        <CardContent className="grid h-full content-between gap-4 p-0">
          <StatGroup className="grid gap-2">
            {Object.entries(summary).map(([label, value]) => (
              <Stat key={label}>
                <StatLabel>{label.replace(/([A-Z])/g, " $1")}</StatLabel>
                <StatValue>{value}</StatValue>
              </Stat>
            ))}
          </StatGroup>

          <div className="hit-readout">
            <span>Hit test</span>
            <strong>
              {hit?.kind === "cartesian" ? (hit.sourcePointId ?? "No point") : "No point"}
            </strong>
            <p>
              {hit?.kind === "cartesian"
                ? `${hit.pointCount.toLocaleString()} point bin at ${minuteLabel(hit.x)}`
                : "Move over the series path"}
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function ChartFrame({ yDomain }: { yDomain: [number, number] }) {
  const ticks = [0, 360, 720, 1_080, 1_440];
  const yTicks = createYTicks(yDomain);

  return (
    <g className="chart-frame">
      <rect height={plotHeight} width={plotWidth} x={plotPadding.left} y={plotPadding.top} />
      {yTicks.map((tick) => {
        const y = scaleY(tick, yDomain);

        return (
          <g key={tick}>
            <line x1={plotPadding.left} x2={viewport.width - plotPadding.right} y1={y} y2={y} />
            <text x={plotPadding.left - 10} y={y + 4}>
              {formatTick(tick)}
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

function VizEngineLayer({ layer, yDomain }: { layer: VizRenderLayer; yDomain: [number, number] }) {
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
              height={Math.max(1, scaleY(cell.y0, yDomain) - scaleY(cell.y1, yDomain) - 1)}
              key={cell.index}
              opacity={opacity}
              width={Math.max(1, scaleX(cell.x1) - scaleX(cell.x0) - 1)}
              x={scaleX(cell.x0)}
              y={scaleY(cell.y1, yDomain)}
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

  if (layer.kind === "finance-candles") {
    return (
      <g className="finance-candle-layer">
        {layer.bars.map((bar) => {
          const x = scaleX(bar.timestamp);
          const openY = scaleY(bar.open, yDomain);
          const closeY = scaleY(bar.close, yDomain);
          const top = Math.min(openY, closeY);
          const height = Math.max(2, Math.abs(closeY - openY));

          return (
            <g key={bar.timestamp}>
              <line x1={x} x2={x} y1={scaleY(bar.high, yDomain)} y2={scaleY(bar.low, yDomain)} />
              <rect
                height={height}
                width={8}
                x={x - 4}
                y={top}
                data-direction={bar.close >= bar.open ? "up" : "down"}
              />
            </g>
          );
        })}
      </g>
    );
  }

  if (layer.kind === "finance-line" || layer.kind === "finance-returns") {
    const path = layer.rows
      .filter((row) => row.value !== null)
      .map((row, index) => {
        const x = scaleX(row.x);
        const y = scaleY(row.value ?? 0, yDomain);

        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");

    return (
      <path
        className={layer.kind === "finance-line" ? "finance-line-layer" : "finance-return-layer"}
        d={path}
      />
    );
  }

  if (layer.kind !== "binned-series") {
    return null;
  }

  const path = layer.rows
    .filter((row) => row.value !== null)
    .map((row, index) => {
      const x = scaleX(row.x);
      const y = scaleY(row.value ?? 0, yDomain);

      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return <path className="series-layer" d={path} />;
}

function HitMarker({ hit, yDomain }: { hit: VizHitTestResult; yDomain: [number, number] }) {
  if (hit.kind !== "cartesian") {
    return null;
  }

  const x = scaleX(hit.x);
  const y = scaleY(hit.y ?? 0, yDomain);

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

function scaleY(value: number, yDomain: [number, number]) {
  const [min, max] = yDomain;

  return plotPadding.top + (1 - (value - min) / (max - min)) * plotHeight;
}

function deriveChartYDomain(layers: Array<VizRenderLayer>): [number, number] {
  let min = defaultYDomain[0];
  let max = defaultYDomain[1];

  for (const layer of layers) {
    if (layer.kind !== "binned-series") {
      if (layer.kind === "finance-candles") {
        for (const bar of layer.bars) {
          min = Math.min(min, bar.low);
          max = Math.max(max, bar.high);
        }
      }
      if (layer.kind === "finance-line") {
        for (const row of layer.rows) {
          if (row.value !== null && Number.isFinite(row.value)) {
            min = Math.min(min, row.value);
            max = Math.max(max, row.value);
          }
        }
      }
      continue;
    }

    for (const row of layer.rows) {
      if (row.value === null || !Number.isFinite(row.value)) {
        continue;
      }

      min = Math.min(min, row.value);
      max = Math.max(max, row.value);
    }
  }

  if (min === max) {
    return [min - 1, max + 1];
  }

  const paddedMax = max > defaultYDomain[1] ? Math.ceil(max * 1.08) : defaultYDomain[1];
  const paddedMin = min < defaultYDomain[0] ? Math.floor(min * 1.08) : defaultYDomain[0];

  return [paddedMin, paddedMax];
}

function createYTicks(yDomain: [number, number]) {
  const [min, max] = yDomain;
  const step = (max - min) / 4;

  return Array.from({ length: 5 }, (_, index) => min + step * index);
}

function formatTick(value: number) {
  return Math.abs(value) >= 100 ? Math.round(value).toLocaleString() : Number(value.toFixed(1));
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
