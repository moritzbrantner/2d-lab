import {
  Badge,
  Button,
  Slider,
  Stat,
  StatGroup,
  StatLabel,
  StatValue,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
} from "@moritzbrantner/ui";
import {
  PageActions,
  PageContent,
  PageDescription,
  PageHeader,
  PageShell,
  PageTitle,
  Surface,
  SurfaceContent,
  SurfaceDescription,
  SurfaceHeader,
  SurfaceTitle,
} from "@moritzbrantner/ui/shell";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  createVizEngine,
  type VizCartesianViewport,
  type VizGeoAggregationFeature,
  type VizGeoBounds,
  type VizGeoFlow,
  type VizGeoFlowFeature,
  type VizGeoHeatFeature,
  type VizGeoJsonFeatureCollection,
  type VizGeoPoint,
  type VizGeoViewport,
  type VizLayer,
  type VizOhlcvBar,
  type VizRenderFrame,
  type VizRenderLayer,
  type VizSeriesPoint,
  type VizValueMode,
  type VizViewport,
} from "../../src";

import { VizEngineDemo } from "./VizEngineDemo";
import "@moritzbrantner/ui/atlas/styles.css";
import "./styles.css";

type ExamplePointProperties = {
  cohort: "weekday" | "weekend";
};

type VisualizationSlug = "overview" | VizLayer["kind"];

type VisualizationPage = {
  description: string;
  label: string;
  slug: VisualizationSlug;
};

type FocusedFrame = {
  frame: VizRenderFrame;
  viewport: VizViewport;
};

const valueModes: VizValueMode[] = ["average", "count", "max", "sum"];
const queryClient = new QueryClient();
const cartesianViewport: VizCartesianViewport = {
  height: 440,
  width: 920,
  xDomain: [0, 1_440],
};
const financeViewport: VizCartesianViewport = {
  height: 440,
  width: 920,
  xDomain: [0, 1_440],
};
const geoViewport: VizGeoViewport = {
  bounds: [11.7, 50.65, 14.8, 53.25],
  center: [13.25, 52],
  display: "flat",
  height: 440,
  kind: "geo",
  width: 920,
  zoom: 7,
};
const plotPadding = {
  bottom: 42,
  left: 54,
  right: 20,
  top: 20,
};
const visualizationPages: VisualizationPage[] = [
  {
    description: "All sample layers rendered together with live controls and hit testing.",
    label: "Overview",
    slug: "overview",
  },
  {
    description: "Downsample dense XY points into display-ready bins.",
    label: "Binned series",
    slug: "binned-series",
  },
  {
    description: "Bucket XY values into counts for distribution views.",
    label: "Histogram",
    slug: "histogram",
  },
  {
    description: "Aggregate XY density into a two-dimensional cell grid.",
    label: "Heatmap",
    slug: "heatmap",
  },
  {
    description: "Compute trailing moving statistics over dense XY points.",
    label: "Rolling series",
    slug: "rolling-series",
  },
  {
    description: "Cluster geographic points for viewport-aware map rendering.",
    label: "Geo clusters",
    slug: "geo-clusters",
  },
  {
    description: "Return raw geographic points visible in the current viewport.",
    label: "Geo points",
    slug: "geo-points",
  },
  {
    description: "Convert weighted points into heat features for map overlays.",
    label: "Geo heat",
    slug: "geo-heat",
  },
  {
    description: "Filter GeoJSON features against the active map viewport.",
    label: "GeoJSON",
    slug: "geojson",
  },
  {
    description: "Filter and weight origin-destination lines for map flows.",
    label: "Geo flows",
    slug: "geo-flows",
  },
  {
    description: "Downsample OHLCV bars into candlestick-friendly data.",
    label: "Finance candles",
    slug: "finance-candles",
  },
  {
    description: "Project finance bars into line-series rows.",
    label: "Finance line",
    slug: "finance-line",
  },
  {
    description: "Compute financial return series for risk and performance views.",
    label: "Finance returns",
    slug: "finance-returns",
  },
];

function ExampleApp() {
  const [seed, setSeed] = useState(7);
  const [pointCount, setPointCount] = useState(24_000);
  const [targetBinCount, setTargetBinCount] = useState(180);
  const [valueMode, setValueMode] = useState<VizValueMode>("average");
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [currentSlug, setCurrentSlug] = useState<VisualizationSlug>(getPageSlugFromLocation);

  useEffect(() => {
    function handlePopState() {
      setCurrentSlug(getPageSlugFromLocation());
    }

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const pointsQuery = useQuery({
    initialData: () => createExamplePoints(pointCount, seed),
    queryFn: () => createExamplePoints(pointCount, seed),
    queryKey: ["example-points", pointCount, seed],
    staleTime: Number.POSITIVE_INFINITY,
  });
  const points = pointsQuery.data;
  const currentPage =
    visualizationPages.find((page) => page.slug === currentSlug) ?? visualizationPages[0];

  function navigateTo(page: VisualizationPage) {
    const url = page.slug === "overview" ? "./" : `./?page=${page.slug}`;

    window.history.pushState(null, "", url);
    setCurrentSlug(page.slug);
  }

  return (
    <PageShell maxWidth="full" className="min-h-screen gap-4">
      <PageHeader className="items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="outline" className="mb-3">
            @moritzbrantner/viz-engine
          </Badge>
          <PageTitle>Visualization engine examples</PageTitle>
          <PageDescription>
            Render dense cartesian, geographic, and finance layers through the shared engine.
          </PageDescription>
        </div>
        <PageActions>
          <Button onClick={() => setSeed((currentSeed) => currentSeed + 1)}>Regenerate data</Button>
        </PageActions>
      </PageHeader>

      <nav
        className="flex flex-wrap gap-2 rounded-lg border bg-card p-2"
        aria-label="Visualization pages"
      >
        {visualizationPages.map((page) => (
          <Button
            asChild
            key={page.slug}
            size="sm"
            variant={page.slug === currentPage.slug ? "default" : "ghost"}
          >
            <a
              aria-current={page.slug === currentPage.slug ? "page" : undefined}
              href={page.slug === "overview" ? "./" : `./?page=${page.slug}`}
              onClick={(event) => {
                event.preventDefault();
                navigateTo(page);
              }}
            >
              {page.label}
            </a>
          </Button>
        ))}
      </nav>

      <PageContent className="gap-4">
        {currentPage.slug === "overview" ? (
          <OverviewPage
            pointCount={pointCount}
            points={points}
            setPointCount={setPointCount}
            setShowHeatmap={setShowHeatmap}
            setTargetBinCount={setTargetBinCount}
            setValueMode={setValueMode}
            showHeatmap={showHeatmap}
            targetBinCount={targetBinCount}
            valueMode={valueMode}
          />
        ) : (
          <FocusedVisualizationPage page={currentPage} seed={seed} />
        )}
      </PageContent>
    </PageShell>
  );
}

function OverviewPage({
  pointCount,
  points,
  setPointCount,
  setShowHeatmap,
  setTargetBinCount,
  setValueMode,
  showHeatmap,
  targetBinCount,
  valueMode,
}: {
  pointCount: number;
  points: readonly VizSeriesPoint[];
  setPointCount: (value: number) => void;
  setShowHeatmap: (value: boolean) => void;
  setTargetBinCount: (value: number) => void;
  setValueMode: (value: VizValueMode) => void;
  showHeatmap: boolean;
  targetBinCount: number;
  valueMode: VizValueMode;
}) {
  return (
    <>
      <Surface aria-label="Example controls" padding="compact">
        <SurfaceContent className="grid gap-3 lg:grid-cols-[minmax(190px,1fr)_minmax(190px,1fr)_auto_auto]">
          <label className="grid min-h-14 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md bg-muted px-3">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Points</span>
            <Slider
              max={80_000}
              min={2_000}
              onValueChange={([value]) => setPointCount(value ?? pointCount)}
              step={2_000}
              thumbAriaLabel="Point count"
              value={[pointCount]}
            />
            <strong className="min-w-16 text-right">{pointCount.toLocaleString()}</strong>
          </label>

          <label className="grid min-h-14 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md bg-muted px-3">
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              Series bins
            </span>
            <Slider
              max={320}
              min={32}
              onValueChange={([value]) => setTargetBinCount(value ?? targetBinCount)}
              step={8}
              thumbAriaLabel="Series bin count"
              value={[targetBinCount]}
            />
            <strong className="min-w-12 text-right">{targetBinCount}</strong>
          </label>

          <div className="grid gap-1">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Value</span>
            <ToggleGroup
              aria-label="Value mode"
              onValueChange={(mode) => {
                if (isValueMode(mode)) {
                  setValueMode(mode);
                }
              }}
              type="single"
              value={valueMode}
            >
              {valueModes.map((mode) => (
                <ToggleGroupItem key={mode} value={mode}>
                  {mode}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <label className="flex min-h-14 items-center justify-center gap-3 rounded-md bg-muted px-3">
            <Switch
              aria-label="Toggle heatmap layer"
              checked={showHeatmap}
              onCheckedChange={setShowHeatmap}
            />
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              Heatmap layer
            </span>
          </label>
        </SurfaceContent>
      </Surface>

      <VizEngineDemo
        bucketCount={48}
        points={points}
        showHeatmap={showHeatmap}
        targetBinCount={targetBinCount}
        valueMode={valueMode}
      />

      <GeoEngineDemo />
    </>
  );
}

function FocusedVisualizationPage({ page, seed }: { page: VisualizationPage; seed: number }) {
  const focusedQuery = useQuery({
    initialData: () => createFocusedFrame(page.slug, seed),
    queryFn: () => createFocusedFrame(page.slug, seed),
    queryKey: ["focused-frame", page.slug, seed],
    staleTime: Number.POSITIVE_INFINITY,
  });
  const focused = focusedQuery.data;
  const layer = focused.frame.layers[0] ?? null;
  const viewport = focused.viewport;
  const yDomain =
    viewport.kind === "geo" ? null : deriveFocusedYDomain(focused.frame.layers, page.slug);
  const summary = createFrameSummary(focused.frame, layer);

  return (
    <Surface>
      <SurfaceHeader className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <Badge variant="outline" className="mb-3">
            {page.slug}
          </Badge>
          <SurfaceTitle>{page.label}</SurfaceTitle>
          <SurfaceDescription>{page.description}</SurfaceDescription>
        </div>
        <StatGroup
          className="grid min-w-full grid-cols-3 gap-2 lg:min-w-96"
          aria-label="Frame summary"
        >
          {summary.map(([label, value]) => (
            <Stat key={label}>
              <StatLabel>{label}</StatLabel>
              <StatValue>{value}</StatValue>
            </Stat>
          ))}
        </StatGroup>
      </SurfaceHeader>

      <SurfaceContent className="min-w-0">
        <svg
          aria-label={`${page.label} visualization`}
          className={viewport.kind === "geo" ? "focused-map" : "focused-chart"}
          role="img"
          viewBox={`0 0 ${viewport.width} ${viewport.height}`}
        >
          {viewport.kind === "geo" ? (
            <>
              <GeoBackdrop viewport={viewport} />
              {focused.frame.layers.map((renderLayer) => (
                <GeoLayer key={renderLayer.layerId} layer={renderLayer} viewport={viewport} />
              ))}
            </>
          ) : (
            <>
              <CartesianFrame viewport={viewport} yDomain={yDomain ?? [0, 1]} />
              {focused.frame.layers.map((renderLayer) => (
                <CartesianLayer
                  key={renderLayer.layerId}
                  layer={renderLayer}
                  viewport={viewport}
                  yDomain={yDomain ?? [0, 1]}
                />
              ))}
            </>
          )}
        </svg>
      </SurfaceContent>
    </Surface>
  );
}

function GeoEngineDemo() {
  const geoQuery = useQuery({
    initialData: () => ({
      clusters: createFocusedFrame("geo-clusters", 7),
      flow: createFocusedFrame("geo-flows", 7),
      heat: createFocusedFrame("geo-heat", 7),
      shape: createFocusedFrame("geojson", 7),
    }),
    queryFn: () => ({
      clusters: createFocusedFrame("geo-clusters", 7),
      flow: createFocusedFrame("geo-flows", 7),
      heat: createFocusedFrame("geo-heat", 7),
      shape: createFocusedFrame("geojson", 7),
    }),
    queryKey: ["overview-geo-frame"],
    staleTime: Number.POSITIVE_INFINITY,
  });
  const { clusters, flow, heat, shape } = geoQuery.data;
  const viewport = geoViewport;
  const layers = [
    ...shape.frame.layers,
    ...flow.frame.layers,
    ...heat.frame.layers,
    ...clusters.frame.layers,
  ];

  return (
    <Surface aria-label="Geo frame demo">
      <SurfaceHeader>
        <Badge variant="outline" className="mb-3">
          Geo frame
        </Badge>
        <SurfaceTitle>Rust-backed map layers</SurfaceTitle>
      </SurfaceHeader>
      <SurfaceContent>
        <svg className="geo-map" role="img" viewBox={`0 0 ${viewport.width} ${viewport.height}`}>
          <GeoBackdrop viewport={viewport} />
          {layers.map((layer, index) => (
            <GeoLayer
              key={`${layer.kind}-${layer.layerId}-${index}`}
              layer={layer}
              viewport={viewport}
            />
          ))}
        </svg>
      </SurfaceContent>
    </Surface>
  );
}

function createFocusedFrame(slug: VisualizationSlug, seed: number): FocusedFrame {
  const engine = createVizEngine({ backend: "auto" });

  if (slug === "overview") {
    return {
      frame: engine.computeFrame({ frameFormat: "objects", viewport: cartesianViewport }),
      viewport: cartesianViewport,
    };
  }

  if (isCartesianLayerKind(slug)) {
    const datasetId = engine.addDataset({ kind: "xy", points: createExamplePoints(32_000, seed) });

    engine.addLayer(createCartesianLayer(slug, datasetId));

    return {
      frame: engine.computeFrame({ frameFormat: "objects", viewport: cartesianViewport }),
      viewport: cartesianViewport,
    };
  }

  if (isFinanceLayerKind(slug)) {
    const datasetId = engine.addDataset({
      bars: createFinanceBars(seed),
      instrument: { assetClass: "equity", currency: "USD", exchange: "NASDAQ", symbol: "AAPL" },
      kind: "finance-ohlcv",
    });

    engine.addLayer(createFinanceLayer(slug, datasetId));

    return {
      frame: engine.computeFrame({ frameFormat: "objects", viewport: financeViewport }),
      viewport: financeViewport,
    };
  }

  const viewport = geoViewport;
  const datasetId = createGeoDataset(engine, slug);

  engine.addLayer(createGeoLayer(slug, datasetId));

  return {
    frame: engine.computeFrame({ frameFormat: "objects", viewport }),
    viewport,
  };
}

function createCartesianLayer(
  kind: "binned-series" | "heatmap" | "histogram" | "rolling-series",
  datasetId: string,
) {
  if (kind === "binned-series") {
    return {
      datasetId,
      kind,
      targetBinCount: 180,
      valueMode: "average" as const,
      xDomain: cartesianViewport.xDomain,
    };
  }

  if (kind === "rolling-series") {
    return {
      alpha: 0.18,
      datasetId,
      kind,
      minPeriods: 8,
      statistic: "mean" as const,
      windowSize: 24,
      xDomain: cartesianViewport.xDomain,
    };
  }

  if (kind === "histogram") {
    return {
      bucketCount: 56,
      datasetId,
      kind,
      xDomain: cartesianViewport.xDomain,
    };
  }

  return {
    datasetId,
    kind,
    xBinCount: 72,
    xDomain: cartesianViewport.xDomain,
    yBinCount: 32,
    yDomain: [0, 130] as [number, number],
  };
}

function createFinanceLayer(
  kind: "finance-candles" | "finance-line" | "finance-returns",
  datasetId: string,
) {
  if (kind === "finance-candles") {
    return {
      datasetId,
      kind,
      targetBarCount: 42,
      xDomain: financeViewport.xDomain,
    };
  }

  if (kind === "finance-line") {
    return {
      datasetId,
      kind,
      targetPointCount: 90,
      value: "close" as const,
      xDomain: financeViewport.xDomain,
    };
  }

  return {
    datasetId,
    kind,
    method: "simple" as const,
    targetPointCount: 90,
    xDomain: financeViewport.xDomain,
  };
}

function createGeoDataset(engine: ReturnType<typeof createVizEngine>, kind: VizLayer["kind"]) {
  if (kind === "geojson") {
    return engine.addDataset({
      featureCollection: createGeoJsonFeatureCollection(),
      kind: "geojson",
    });
  }

  if (kind === "geo-flows") {
    return engine.addDataset({
      flows: createGeoFlows(),
      kind: "geo-flows",
    });
  }

  return engine.addDataset({
    kind: "geo-points",
    points: createGeoPoints(),
  });
}

function createGeoLayer(
  kind: Exclude<
    VizLayer["kind"],
    | "binned-series"
    | "histogram"
    | "heatmap"
    | "rolling-series"
    | "finance-candles"
    | "finance-line"
    | "finance-returns"
  >,
  datasetId: string,
) {
  if (kind === "geo-clusters") {
    return { datasetId, kind, radius: 72 };
  }

  if (kind === "geo-heat") {
    return { datasetId, kind, radiusMeters: 36_000, weightMetric: "demand" };
  }

  if (kind === "geojson") {
    return { clipToViewport: true, datasetId, kind, simplifyTolerance: 0.001 };
  }

  if (kind === "geo-flows") {
    return { aggregate: "none" as const, datasetId, kind, minWeight: 2, weightMetric: "demand" };
  }

  return { datasetId, kind };
}

function CartesianFrame({
  viewport,
  yDomain,
}: {
  viewport: VizCartesianViewport;
  yDomain: [number, number];
}) {
  const xTicks = [0, 360, 720, 1_080, 1_440];
  const yTicks = createYTicks(yDomain);

  return (
    <g className="chart-frame">
      <rect
        height={plotHeight(viewport)}
        width={plotWidth(viewport)}
        x={plotPadding.left}
        y={plotPadding.top}
      />
      {yTicks.map((tick) => {
        const y = scaleY(tick, viewport, yDomain);

        return (
          <g key={tick}>
            <line x1={plotPadding.left} x2={viewport.width - plotPadding.right} y1={y} y2={y} />
            <text x={plotPadding.left - 10} y={y + 4}>
              {formatTick(tick)}
            </text>
          </g>
        );
      })}
      {xTicks.map((tick) => (
        <text key={tick} x={scaleX(tick, viewport)} y={viewport.height - 12}>
          {minuteLabel(tick)}
        </text>
      ))}
    </g>
  );
}

function CartesianLayer({
  layer,
  viewport,
  yDomain,
}: {
  layer: VizRenderLayer;
  viewport: VizCartesianViewport;
  yDomain: [number, number];
}) {
  if (layer.kind === "binned-series") {
    return (
      <path className="series-layer focused-series" d={linePath(layer.rows, viewport, yDomain)} />
    );
  }

  if (layer.kind === "rolling-series") {
    return (
      <path className="series-layer focused-series" d={linePath(layer.rows, viewport, yDomain)} />
    );
  }

  if (layer.kind === "histogram") {
    return (
      <g className="histogram-layer focused-histogram">
        {layer.buckets.map((bucket) => (
          <rect
            height={scaleY(0, viewport, yDomain) - scaleY(bucket.pointCount, viewport, yDomain)}
            key={bucket.index}
            rx={2}
            width={Math.max(
              2,
              scaleX(bucket.value1, viewport) - scaleX(bucket.value0, viewport) - 2,
            )}
            x={scaleX(bucket.value0, viewport)}
            y={scaleY(bucket.pointCount, viewport, yDomain)}
          />
        ))}
      </g>
    );
  }

  if (layer.kind === "heatmap") {
    const maxCount = Math.max(1, ...layer.cells.map((cell) => cell.pointCount));

    return (
      <g className="heatmap-layer">
        {layer.cells.map((cell) =>
          cell.pointCount > 0 ? (
            <rect
              height={Math.max(
                1,
                scaleY(cell.y0, viewport, yDomain) - scaleY(cell.y1, viewport, yDomain) - 1,
              )}
              key={cell.index}
              opacity={Math.min(0.82, 0.1 + (cell.pointCount / maxCount) * 0.72)}
              width={Math.max(1, scaleX(cell.x1, viewport) - scaleX(cell.x0, viewport) - 1)}
              x={scaleX(cell.x0, viewport)}
              y={scaleY(cell.y1, viewport, yDomain)}
            />
          ) : null,
        )}
      </g>
    );
  }

  if (layer.kind === "finance-candles") {
    const candleWidth = Math.max(5, plotWidth(viewport) / Math.max(1, layer.bars.length) / 2.3);

    return (
      <g className="finance-candle-layer">
        {layer.bars.map((bar) => {
          const x = scaleX(bar.timestamp, viewport);
          const openY = scaleY(bar.open, viewport, yDomain);
          const closeY = scaleY(bar.close, viewport, yDomain);
          const top = Math.min(openY, closeY);

          return (
            <g key={bar.timestamp}>
              <line
                x1={x}
                x2={x}
                y1={scaleY(bar.high, viewport, yDomain)}
                y2={scaleY(bar.low, viewport, yDomain)}
              />
              <rect
                data-direction={bar.close >= bar.open ? "up" : "down"}
                height={Math.max(2, Math.abs(closeY - openY))}
                width={candleWidth}
                x={x - candleWidth / 2}
                y={top}
              />
            </g>
          );
        })}
      </g>
    );
  }

  if (layer.kind === "finance-line") {
    return <path className="finance-line-layer" d={linePath(layer.rows, viewport, yDomain)} />;
  }

  if (layer.kind === "finance-returns") {
    return (
      <path
        className="finance-return-layer focused-return"
        d={linePath(layer.rows, viewport, yDomain)}
      />
    );
  }

  return null;
}

function GeoBackdrop({ viewport }: { viewport: VizGeoViewport }) {
  const ticks = [0.2, 0.4, 0.6, 0.8];

  return (
    <g className="geo-backdrop">
      <rect height={viewport.height} width={viewport.width} x={0} y={0} />
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={viewport.width * tick} x2={viewport.width * tick} y1={0} y2={viewport.height} />
          <line
            x1={0}
            x2={viewport.width}
            y1={viewport.height * tick}
            y2={viewport.height * tick}
          />
        </g>
      ))}
    </g>
  );
}

function GeoLayer({ layer, viewport }: { layer: VizRenderLayer; viewport: VizGeoViewport }) {
  if (layer.kind === "geojson") {
    return (
      <g className="geo-shapes">
        {layer.featureCollection.features.map((feature, index) =>
          getPolygonRings(feature.geometry).map((ring, ringIndex) => (
            <polygon
              key={`${index}-${ringIndex}`}
              points={ring.map((position) => projectGeo(position, viewport).join(",")).join(" ")}
            />
          )),
        )}
      </g>
    );
  }

  if (layer.kind === "geo-flows") {
    return (
      <g className="geo-flows">
        {layer.features.map((feature) => (
          <GeoFlowPath key={feature.flow.id} feature={feature} viewport={viewport} />
        ))}
      </g>
    );
  }

  if (layer.kind === "geo-heat") {
    return (
      <g className="geo-heat-points">
        {layer.features.map((feature) => (
          <GeoHeatCircle key={feature.id} feature={feature} viewport={viewport} />
        ))}
      </g>
    );
  }

  if (layer.kind === "geo-clusters") {
    return (
      <g className="geo-clusters">
        {layer.features.map((feature, index) => (
          <GeoClusterMark key={index} feature={feature} viewport={viewport} />
        ))}
      </g>
    );
  }

  if (layer.kind === "geo-points") {
    return (
      <g className="geo-points">
        {layer.features.map((point) => {
          const [cx, cy] = projectGeo([point.longitude, point.latitude], viewport);

          return (
            <g key={point.id} transform={`translate(${cx} ${cy})`}>
              <circle r={7} />
              <text y={-12}>{point.label}</text>
            </g>
          );
        })}
      </g>
    );
  }

  return null;
}

function GeoFlowPath({
  feature,
  viewport,
}: {
  feature: VizGeoFlowFeature;
  viewport: VizGeoViewport;
}) {
  const [x1, y1] = projectGeo(feature.flow.from, viewport);
  const [x2, y2] = projectGeo(feature.flow.to, viewport);
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.12;

  return (
    <path
      d={`M ${x1.toFixed(2)} ${y1.toFixed(2)} Q ${midX.toFixed(2)} ${midY.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`}
      strokeWidth={1 + feature.value * 6}
    />
  );
}

function GeoHeatCircle({
  feature,
  viewport,
}: {
  feature: VizGeoHeatFeature;
  viewport: VizGeoViewport;
}) {
  const [cx, cy] = projectGeo(feature.coordinates, viewport);

  return <circle cx={cx} cy={cy} r={12 + feature.value * 28} />;
}

function GeoClusterMark({
  feature,
  viewport,
}: {
  feature: VizGeoAggregationFeature;
  viewport: VizGeoViewport;
}) {
  const [cx, cy] = projectGeo(feature.coordinates, viewport);
  const label = feature.kind === "cluster" ? feature.pointCountAbbreviated : feature.point.label;

  return (
    <g transform={`translate(${cx} ${cy})`}>
      <circle r={feature.kind === "cluster" ? 16 : 9} />
      <text y={feature.kind === "cluster" ? 4 : -13}>{label}</text>
    </g>
  );
}

function createFrameSummary(frame: VizRenderFrame, layer: VizRenderLayer | null) {
  const rows =
    layer?.kind === "binned-series" ||
    layer?.kind === "rolling-series" ||
    layer?.kind === "finance-line" ||
    layer?.kind === "finance-returns"
      ? layer.rows.length
      : layer?.kind === "histogram"
        ? layer.buckets.length
        : layer?.kind === "heatmap"
          ? layer.cells.filter((cell) => cell.pointCount > 0).length
          : layer?.kind === "finance-candles"
            ? layer.bars.length
            : layer && "features" in layer
              ? layer.features.length
              : 0;

  return [
    ["Backend", frame.stats.backend.toUpperCase()],
    ["Compute", `${frame.stats.computeMs.toFixed(2)} ms`],
    ["Items", rows.toLocaleString()],
  ];
}

function deriveFocusedYDomain(
  layers: readonly VizRenderLayer[],
  slug: VisualizationSlug,
): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const layer of layers) {
    if (layer.bounds) {
      min = Math.min(min, layer.bounds[1]);
      max = Math.max(max, layer.bounds[3]);
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return slug === "finance-returns" ? [-0.04, 0.04] : [0, 130];
  }

  if (min === max) {
    return [min - 1, max + 1];
  }

  const padding = (max - min) * 0.12;

  return [min - padding, max + padding];
}

function linePath(
  rows: Array<{ value: number | null; x: number }>,
  viewport: VizCartesianViewport,
  yDomain: [number, number],
) {
  return rows
    .filter((row) => row.value !== null && Number.isFinite(row.value))
    .map((row, index) => {
      const x = scaleX(row.x, viewport);
      const y = scaleY(row.value ?? 0, viewport, yDomain);

      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function scaleX(value: number, viewport: VizCartesianViewport) {
  const [min, max] = viewport.xDomain;

  return plotPadding.left + ((value - min) / (max - min)) * plotWidth(viewport);
}

function scaleY(value: number, viewport: VizCartesianViewport, yDomain: [number, number]) {
  const [min, max] = yDomain;

  return plotPadding.top + (1 - (value - min) / (max - min)) * plotHeight(viewport);
}

function plotWidth(viewport: VizCartesianViewport) {
  return viewport.width - plotPadding.left - plotPadding.right;
}

function plotHeight(viewport: VizCartesianViewport) {
  return viewport.height - plotPadding.top - plotPadding.bottom;
}

function createYTicks(yDomain: [number, number]) {
  const [min, max] = yDomain;
  const step = (max - min) / 4;

  return Array.from({ length: 5 }, (_, index) => min + step * index);
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

function createFinanceBars(seed: number): VizOhlcvBar[] {
  const random = createSeededRandom(seed + 101);
  let previousClose = 102;

  return Array.from({ length: 96 }, (_, index) => {
    const timestamp = index * 15;
    const drift = Math.sin(index / 7) * 2.2 + (random() - 0.5) * 4;
    const open = previousClose;
    const close = Math.max(72, open + drift);
    const high = Math.max(open, close) + 2 + random() * 4;
    const low = Math.min(open, close) - 2 - random() * 4;

    previousClose = close;

    return {
      close: Number(close.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      open: Number(open.toFixed(2)),
      timestamp,
      volume: Math.round(80_000 + random() * 90_000),
    };
  });
}

function createGeoPoints(): VizGeoPoint[] {
  return [
    { id: "berlin", label: "Berlin", latitude: 52.52, longitude: 13.405, metrics: { demand: 9 } },
    { id: "potsdam", label: "Potsdam", latitude: 52.39, longitude: 13.064, metrics: { demand: 5 } },
    { id: "leipzig", label: "Leipzig", latitude: 51.34, longitude: 12.37, metrics: { demand: 6 } },
    { id: "dresden", label: "Dresden", latitude: 51.05, longitude: 13.74, metrics: { demand: 7 } },
    { id: "halle", label: "Halle", latitude: 51.48, longitude: 11.97, metrics: { demand: 4 } },
    { id: "cottbus", label: "Cottbus", latitude: 51.76, longitude: 14.33, metrics: { demand: 3 } },
    { id: "dessau", label: "Dessau", latitude: 51.84, longitude: 12.24, metrics: { demand: 4 } },
    {
      id: "frankfurt-oder",
      label: "Frankfurt",
      latitude: 52.35,
      longitude: 14.55,
      metrics: { demand: 3 },
    },
  ];
}

function createGeoFlows(): VizGeoFlow[] {
  return [
    { from: [13.405, 52.52], id: "berlin-leipzig", metrics: { demand: 6 }, to: [12.37, 51.34] },
    { from: [13.405, 52.52], id: "berlin-dresden", metrics: { demand: 8 }, to: [13.74, 51.05] },
    { from: [12.37, 51.34], id: "leipzig-halle", metrics: { demand: 5 }, to: [11.97, 51.48] },
    { from: [13.064, 52.39], id: "potsdam-cottbus", metrics: { demand: 3 }, to: [14.33, 51.76] },
  ];
}

function createGeoJsonFeatureCollection(): VizGeoJsonFeatureCollection {
  return {
    features: [
      {
        geometry: {
          coordinates: [
            [
              [12.2, 51.75],
              [14.65, 51.75],
              [14.65, 53.08],
              [12.2, 53.08],
              [12.2, 51.75],
            ],
          ],
          type: "Polygon",
        },
        id: "brandenburg-demo",
        properties: { name: "North region" },
        type: "Feature",
      },
      {
        geometry: {
          coordinates: [
            [
              [11.85, 50.78],
              [14.38, 50.78],
              [14.38, 51.68],
              [11.85, 51.68],
              [11.85, 50.78],
            ],
          ],
          type: "Polygon",
        },
        id: "saxony-demo",
        properties: { name: "South region" },
        type: "Feature",
      },
    ],
    type: "FeatureCollection",
  };
}

function getPolygonRings(geometry: unknown): Array<Array<[number, number]>> {
  if (!geometry || typeof geometry !== "object") {
    return [];
  }

  const polygon = geometry as { coordinates?: Array<Array<[number, number]>>; type?: string };
  return polygon.type === "Polygon" && Array.isArray(polygon.coordinates)
    ? polygon.coordinates
    : [];
}

function projectGeo(position: readonly [number, number], viewport: VizGeoViewport) {
  const bounds: VizGeoBounds = viewport.bounds;
  const x = ((position[0] - bounds[0]) / (bounds[2] - bounds[0])) * viewport.width;
  const y = (1 - (position[1] - bounds[1]) / (bounds[3] - bounds[1])) * viewport.height;

  return [x, y];
}

function isCartesianLayerKind(
  slug: VisualizationSlug,
): slug is "binned-series" | "heatmap" | "histogram" | "rolling-series" {
  return (
    slug === "binned-series" ||
    slug === "histogram" ||
    slug === "heatmap" ||
    slug === "rolling-series"
  );
}

function isFinanceLayerKind(
  slug: VisualizationSlug,
): slug is "finance-candles" | "finance-line" | "finance-returns" {
  return slug === "finance-candles" || slug === "finance-line" || slug === "finance-returns";
}

function isValueMode(value: string): value is VizValueMode {
  return valueModes.includes(value as VizValueMode);
}

function getPageSlugFromLocation(): VisualizationSlug {
  const slug = new URLSearchParams(window.location.search).get("page");

  return visualizationPages.some((page) => page.slug === slug)
    ? (slug as VisualizationSlug)
    : "overview";
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

function formatTick(value: number) {
  return Math.abs(value) >= 100 ? Math.round(value).toLocaleString() : Number(value.toFixed(2));
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
    <QueryClientProvider client={queryClient}>
      <ExampleApp />
    </QueryClientProvider>
  </StrictMode>,
);
