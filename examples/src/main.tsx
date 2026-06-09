import {
  Badge,
  Button,
  ChartContainer,
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
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  BinnedChart,
  ChartHeatmapGrid,
  ChartMetricStrip,
  ChartPanel,
  ChartValueModeSelector,
  createChartDensityIndex,
  createChartDensityViewportSummary,
  createRollingChartSeries,
  getChartDataYBounds,
  type ChartSeriesPoint,
  type ChartValueMode as PackageChartValueMode,
} from "@moritzbrantner/charts";
import {
  FlatBubbleMap,
  FlatClusteredMap,
  FlatFlowMap,
  FlatGeoJsonMap,
  FlatHeatFieldMap,
  FlatHeatMap,
  FlatPointMap,
  createBubbleMapFeatures,
  createFlowMapFeatures,
  createHeatMapFeatureCollection,
} from "@moritzbrantner/maps/flat";

import {
  createVizEngine,
  type VizCartesianViewport,
  type VizGeoFlow,
  type VizGeoJsonFeatureCollection,
  type VizGeoPoint,
  type VizGeoViewport,
  type VizLayer,
  type VizOhlcvBar,
  type VizRenderFrame,
  type VizSeriesPoint,
  type VizValueMode,
  type VizViewport,
} from "@moritzbrantner/viz-engine/core";

import "@moritzbrantner/ui/atlas/styles.css";
import "@moritzbrantner/maps/styles.css";
import "./styles.css";

type ExamplePointProperties = {
  cohort: "weekday" | "weekend";
};

type VisualizationSlug = "overview" | VizLayer["kind"];
type PackageExampleSlug = "charts-package" | "maps-package";
type ExampleSlug = VisualizationSlug | PackageExampleSlug;

type VisualizationPage = {
  description: string;
  label: string;
  slug: ExampleSlug;
};

type FocusedFrame = {
  frame: VizRenderFrame;
  viewport: VizViewport;
};

const valueModes: VizValueMode[] = ["average", "count", "max", "sum"];
const packageChartValueModes: PackageChartValueMode[] = ["average", "count", "max", "sum"];
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
const packageMapStyle = { tiles: false } as const;
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
    description: "Interpolate point metrics into a viewport scalar grid.",
    label: "Geo scalar field",
    slug: "geo-scalar-field",
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
  {
    description: "Use @moritzbrantner/charts to bin and render viz-engine compatible points.",
    label: "Charts package",
    slug: "charts-package",
  },
  {
    description: "Use @moritzbrantner/maps feature builders with the same geo sample data.",
    label: "Maps package",
    slug: "maps-package",
  },
];

function ExampleApp() {
  const [seed, setSeed] = useState(7);
  const [pointCount, setPointCount] = useState(24_000);
  const [targetBinCount, setTargetBinCount] = useState(180);
  const [valueMode, setValueMode] = useState<VizValueMode>("average");
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [currentSlug, setCurrentSlug] = useState<ExampleSlug>(getPageSlugFromLocation);

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
        ) : currentPage.slug === "charts-package" ? (
          <ChartsPackageExample points={points} />
        ) : currentPage.slug === "maps-package" ? (
          <MapsPackageExample />
        ) : (
          <FocusedVisualizationPage
            page={{ ...currentPage, slug: currentPage.slug as VisualizationSlug }}
            seed={seed}
          />
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
  points: readonly VizSeriesPoint<ExamplePointProperties>[];
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

      <ChartsOverview
        bucketCount={48}
        points={points}
        showHeatmap={showHeatmap}
        targetBinCount={targetBinCount}
        valueMode={valueMode}
      />

      <MapsOverview />
    </>
  );
}

function FocusedVisualizationPage({
  page,
  seed,
}: {
  page: VisualizationPage & { slug: VisualizationSlug };
  seed: number;
}) {
  const focusedQuery = useQuery({
    initialData: () => createFocusedFrame(page.slug, seed),
    queryFn: () => createFocusedFrame(page.slug, seed),
    queryKey: ["focused-frame", page.slug, seed],
    staleTime: Number.POSITIVE_INFINITY,
  });
  const focused = focusedQuery.data;
  const layer = focused.frame.layers[0] ?? null;
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
        {isCartesianLayerKind(page.slug) || isFinanceLayerKind(page.slug) ? (
          <FocusedChartPackageView seed={seed} slug={page.slug} />
        ) : page.slug === "overview" ? null : (
          <FocusedMapPackageView slug={page.slug} />
        )}
      </SurfaceContent>
    </Surface>
  );
}

function ChartsOverview({
  bucketCount,
  points,
  showHeatmap,
  targetBinCount,
  valueMode,
}: {
  bucketCount: number;
  points: readonly VizSeriesPoint<ExamplePointProperties>[];
  showHeatmap: boolean;
  targetBinCount: number;
  valueMode: VizValueMode;
}) {
  const index = useMemo(
    () =>
      createChartDensityIndex(points as readonly ChartSeriesPoint<ExamplePointProperties>[], {
        backend: "auto",
      }),
    [points],
  );
  const summarySeries = useMemo(
    () =>
      index.getChartSeries({
        includeEmptyBins: true,
        targetBinCount,
        valueMode,
        xDomain: cartesianViewport.xDomain,
      }),
    [index, targetBinCount, valueMode],
  );
  const summary = createChartDensityViewportSummary(summarySeries);

  return (
    <section className="demo-grid">
      <ChartPanel
        badge="@moritzbrantner/charts"
        title="Dense traffic"
        description="The overview uses the chart package density index, chart shell, minimap, and heatmap grid."
      >
        <BinnedChart
          chartClassName="package-chart"
          config={{
            value: {
              color: valueMode === "count" ? "#d25435" : "#0f6b78",
              label: valueMode,
            },
          }}
          domain={cartesianViewport.xDomain}
          formatDomainValue={minuteLabel}
          fullDomain={cartesianViewport.xDomain}
          index={index}
          minimap
          query={{ includeEmptyBins: true }}
          renderDataOptions={{ xLabel: (sample) => minuteLabel(sample.x) }}
          valueMode={valueMode}
          wheel={false}
        >
          {({ rows }) =>
            valueMode === "count" ? (
              <BarChart data={rows} margin={{ bottom: 8, left: 4, right: 14, top: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis tickLine={false} axisLine={false} width={46} />
                <Bar dataKey="value" fill="var(--color-value)" radius={0} />
              </BarChart>
            ) : (
              <LineChart data={rows} margin={{ bottom: 8, left: 4, right: 14, top: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis tickLine={false} axisLine={false} width={46} />
                <Line
                  connectNulls
                  dataKey="value"
                  dot={false}
                  isAnimationActive={false}
                  stroke="var(--color-value)"
                  strokeWidth={2.4}
                  type="monotone"
                />
              </LineChart>
            )
          }
        </BinnedChart>
        {showHeatmap ? (
          <ChartHeatmapGrid
            className="mt-4 package-heatmap"
            cells={
              index.getHeatmap({
                includeEmptyCells: true,
                xBinCount: Math.min(72, targetBinCount),
                xDomain: cartesianViewport.xDomain,
                yBinCount: 28,
                yDomain: [0, 130],
              }).cells
            }
            formatX={minuteLabel}
            formatY={(value) => formatTick(value).toString()}
          />
        ) : null}
      </ChartPanel>

      <CardLikeStats
        summary={[
          ["Points", points.length.toLocaleString()],
          ["Bins", summary.binCount.toLocaleString()],
          ["Mode", summary.valueMode],
          ["Histogram buckets", bucketCount.toLocaleString()],
        ]}
      />
    </section>
  );
}

function MapsOverview() {
  const points = useMemo(() => createGeoPoints(), []);
  const flows = useMemo(
    () => createGeoFlows().map((flow, index) => ({ ...flow, id: flow.id ?? `flow-${index}` })),
    [],
  );

  return (
    <Surface aria-label="Map package overview">
      <SurfaceHeader>
        <Badge variant="outline" className="mb-3">
          @moritzbrantner/maps
        </Badge>
        <SurfaceTitle>Map package layers</SurfaceTitle>
      </SurfaceHeader>
      <SurfaceContent className="package-map-grid">
        <FlatClusteredMap
          mapLabel="Clustered demand map"
          mapStyle={packageMapStyle}
          points={points}
          showAttributionControl={false}
          style={{ height: 360 }}
        />
        <FlatFlowMap
          flowColor="#c84830"
          flowShape="arc"
          flows={flows}
          mapLabel="Flow demand map"
          mapStyle={packageMapStyle}
          showAttributionControl={false}
          style={{ height: 360 }}
          weightMetric="demand"
        />
      </SurfaceContent>
    </Surface>
  );
}

function CardLikeStats({ summary }: { summary: Array<[string, string]> }) {
  return (
    <Surface className="stats-panel" aria-label="Package rendering stats">
      <SurfaceContent className="grid h-full content-between gap-4 p-0">
        <StatGroup className="grid gap-2">
          {summary.map(([label, value]) => (
            <Stat key={label}>
              <StatLabel>{label}</StatLabel>
              <StatValue>{value}</StatValue>
            </Stat>
          ))}
        </StatGroup>
      </SurfaceContent>
    </Surface>
  );
}

function FocusedChartPackageView({
  seed,
  slug,
}: {
  seed: number;
  slug:
    | "binned-series"
    | "histogram"
    | "heatmap"
    | "rolling-series"
    | "finance-candles"
    | "finance-line"
    | "finance-returns";
}) {
  return isFinanceLayerKind(slug) ? (
    <FinancePackageChart seed={seed} slug={slug} />
  ) : (
    <CartesianPackageChart seed={seed} slug={slug} />
  );
}

function CartesianPackageChart({
  seed,
  slug,
}: {
  seed: number;
  slug: "binned-series" | "histogram" | "heatmap" | "rolling-series";
}) {
  const points = useMemo(() => createExamplePoints(32_000, seed), [seed]);
  const index = useMemo(
    () =>
      createChartDensityIndex(points as readonly ChartSeriesPoint<ExamplePointProperties>[], {
        backend: "auto",
      }),
    [points],
  );
  const focusedSeries = useMemo(
    () =>
      index.getChartSeries({
        includeEmptyBins: true,
        targetBinCount: 180,
        valueMode: "average",
        xDomain: cartesianViewport.xDomain,
      }),
    [index],
  );
  const rollingValuesByIndex = useMemo(
    () =>
      new Map(
        createRollingChartSeries(focusedSeries.samples, {
          minPoints: 8,
          statistic: "average",
          windowSize: 24,
        }).map((point) => [point.index, point.value] as const),
      ),
    [focusedSeries],
  );

  if (slug === "heatmap") {
    const heatmap = index.getHeatmap({
      includeEmptyCells: true,
      xBinCount: 72,
      xDomain: cartesianViewport.xDomain,
      yBinCount: 32,
      yDomain: [0, 130],
    });

    return (
      <ChartPanel badge="@moritzbrantner/charts" title="Heatmap">
        <ChartHeatmapGrid
          className="package-heatmap"
          cells={heatmap.cells}
          formatX={minuteLabel}
          formatY={(value) => formatTick(value).toString()}
        />
      </ChartPanel>
    );
  }

  if (slug === "histogram") {
    return (
      <ChartPanel badge="@moritzbrantner/charts" title="Histogram">
        <BinnedChart
          chartClassName="package-chart"
          config={{ count: { color: "#0f6b78", label: "Count" } }}
          domain={cartesianViewport.xDomain}
          formatDomainValue={minuteLabel}
          fullDomain={cartesianViewport.xDomain}
          index={index}
          query={{ includeEmptyBins: true }}
          renderDataOptions={{
            modes: ["count"],
            xLabel: (sample) => minuteLabel(sample.x),
          }}
          valueMode="count"
        >
          {({ rows }) => (
            <BarChart data={rows} margin={{ bottom: 8, left: 4, right: 14, top: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis tickLine={false} axisLine={false} width={46} />
              <Bar dataKey="count" fill="var(--color-count)" radius={0} />
            </BarChart>
          )}
        </BinnedChart>
      </ChartPanel>
    );
  }

  return (
    <ChartPanel
      badge="@moritzbrantner/charts"
      title={slug === "rolling-series" ? "Rolling series" : "Binned series"}
    >
      <BinnedChart
        chartClassName="package-chart"
        config={{
          average: { color: "#0f6b78", label: "Average" },
          rolling: { color: "#c84830", label: "Rolling" },
        }}
        domain={cartesianViewport.xDomain}
        formatDomainValue={minuteLabel}
        fullDomain={cartesianViewport.xDomain}
        index={index}
        query={{ includeEmptyBins: true }}
        renderDataOptions={{
          derived:
            slug === "rolling-series"
              ? {
                  rolling: (sample) => rollingValuesByIndex.get(sample.index) ?? null,
                }
              : undefined,
          modes: ["average"],
          xLabel: (sample) => minuteLabel(sample.x),
        }}
        valueMode="average"
      >
        {({ rows }) => (
          <LineChart data={rows} margin={{ bottom: 8, left: 4, right: 14, top: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} />
            <YAxis tickLine={false} axisLine={false} width={46} />
            <Line
              connectNulls
              dataKey={slug === "rolling-series" ? "rolling" : "average"}
              dot={false}
              isAnimationActive={false}
              stroke={slug === "rolling-series" ? "var(--color-rolling)" : "var(--color-average)"}
              strokeWidth={2.4}
              type="monotone"
            />
          </LineChart>
        )}
      </BinnedChart>
    </ChartPanel>
  );
}

function FinancePackageChart({
  seed,
  slug,
}: {
  seed: number;
  slug: "finance-candles" | "finance-line" | "finance-returns";
}) {
  const bars = useMemo(() => createFinanceBars(seed), [seed]);
  const rows = useMemo(() => createFinanceRows(bars, slug), [bars, slug]);
  const yBounds = getChartDataYBounds(
    rows,
    slug === "finance-candles"
      ? ["high", "low", "close"]
      : [slug === "finance-returns" ? "return" : "close"],
  );

  return (
    <ChartPanel badge="@moritzbrantner/charts" title={financeTitle(slug)}>
      <ChartContainer
        className="package-chart"
        config={{
          close: { color: "#0f6b78", label: "Close" },
          high: { color: "#9f7aea", label: "High" },
          low: { color: "#d25435", label: "Low" },
          return: { color: "#c84830", label: "Return" },
        }}
      >
        <LineChart data={rows} margin={{ bottom: 8, left: 4, right: 14, top: 12 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} />
          <YAxis
            domain={[
              yBounds.minY == null ? "auto" : yBounds.minY,
              yBounds.maxY == null ? "auto" : yBounds.maxY,
            ]}
            tickLine={false}
            axisLine={false}
            width={54}
          />
          {slug === "finance-returns" ? <ReferenceLine y={0} stroke="hsl(var(--border))" /> : null}
          {slug === "finance-candles" ? (
            <>
              <Line
                dataKey="high"
                dot={false}
                isAnimationActive={false}
                stroke="var(--color-high)"
                strokeWidth={1.6}
                type="monotone"
              />
              <Line
                dataKey="low"
                dot={false}
                isAnimationActive={false}
                stroke="var(--color-low)"
                strokeWidth={1.6}
                type="monotone"
              />
            </>
          ) : null}
          <Line
            dataKey={slug === "finance-returns" ? "return" : "close"}
            dot={false}
            isAnimationActive={false}
            stroke={slug === "finance-returns" ? "var(--color-return)" : "var(--color-close)"}
            strokeWidth={2.4}
            type="monotone"
          />
        </LineChart>
      </ChartContainer>
    </ChartPanel>
  );
}

function createFinanceRows(
  bars: readonly VizOhlcvBar[],
  slug: "finance-candles" | "finance-line" | "finance-returns",
) {
  let previousClose: number | null = null;

  return bars.map((bar) => {
    const row = {
      close: bar.close,
      high: bar.high,
      label: minuteLabel(bar.timestamp),
      low: bar.low,
      open: bar.open,
      return:
        slug === "finance-returns" && previousClose && previousClose !== 0
          ? (bar.close - previousClose) / previousClose
          : null,
      timestamp: bar.timestamp,
    };

    previousClose = bar.close;

    return row;
  });
}

function financeTitle(slug: "finance-candles" | "finance-line" | "finance-returns") {
  if (slug === "finance-candles") {
    return "Finance range";
  }

  return slug === "finance-line" ? "Finance line" : "Finance returns";
}

function FocusedMapPackageView({
  slug,
}: {
  slug: "geo-clusters" | "geo-points" | "geo-heat" | "geo-scalar-field" | "geojson" | "geo-flows";
}) {
  const points = useMemo(() => createGeoPoints(), []);
  const flows = useMemo(
    () => createGeoFlows().map((flow, index) => ({ ...flow, id: flow.id ?? `flow-${index}` })),
    [],
  );
  const geoJson = useMemo(() => createGeoJsonFeatureCollection(), []);
  const commonMapProps = {
    mapStyle: packageMapStyle,
    showAttributionControl: false,
    style: { height: 460 },
  };

  if (slug === "geo-clusters") {
    return <FlatClusteredMap {...commonMapProps} mapLabel="Clustered point map" points={points} />;
  }

  if (slug === "geo-points") {
    return <FlatPointMap {...commonMapProps} mapLabel="Point map" points={points} />;
  }

  if (slug === "geo-heat") {
    return (
      <FlatHeatMap
        {...commonMapProps}
        heatmapRadius={{ meters: 36_000 }}
        mapLabel="Heat map"
        points={points}
        weightMetric="demand"
      />
    );
  }

  if (slug === "geo-scalar-field") {
    return (
      <FlatHeatFieldMap
        {...commonMapProps}
        domainBounds={geoViewport.bounds}
        fieldColumns={48}
        fieldRows={28}
        interpolationK={8}
        mapLabel="Scalar field map"
        points={points}
        showDataPoints
        valueMetric="demand"
      />
    );
  }

  if (slug === "geojson") {
    return (
      <FlatGeoJsonMap
        {...commonMapProps}
        fitToData
        geoJson={geoJson as never}
        mapLabel="GeoJSON map"
      />
    );
  }

  return (
    <FlatFlowMap
      {...commonMapProps}
      flowColor="#c84830"
      flowShape="arc"
      flows={flows}
      mapLabel="Flow map"
      weightMetric="demand"
    />
  );
}

function ChartsPackageExample({
  points,
}: {
  points: readonly VizSeriesPoint<ExamplePointProperties>[];
}) {
  const [domain, setDomain] = useState<[number, number]>([240, 1_260]);
  const [valueMode, setValueMode] = useState<PackageChartValueMode>("average");
  const index = useMemo(
    () =>
      createChartDensityIndex(points as readonly ChartSeriesPoint<ExamplePointProperties>[], {
        backend: "auto",
      }),
    [points],
  );
  const series = useMemo(
    () =>
      index.getChartSeries({
        includeEmptyBins: true,
        targetBinCount: 96,
        valueMode,
        xDomain: domain,
      }),
    [domain, index, valueMode],
  );
  const summary = createChartDensityViewportSummary(series);

  return (
    <Surface>
      <SurfaceHeader className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <Badge variant="outline" className="mb-3">
            @moritzbrantner/charts@0.1.1
          </Badge>
          <SurfaceTitle>Chart package rendering</SurfaceTitle>
          <SurfaceDescription>
            The chart package consumes the same XY point shape and delegates binning to its density
            index.
          </SurfaceDescription>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <ChartMetricStrip label="Points" value={summary.itemCount.toLocaleString()} />
          <ChartMetricStrip label="Bins" value={summary.binCount.toLocaleString()} />
          <ChartMetricStrip label="Mode" value={summary.valueMode} />
        </div>
      </SurfaceHeader>
      <SurfaceContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <ChartValueModeSelector
            aria-label="Chart package value mode"
            definitions={packageChartValueModes.map((mode) => ({
              axisLabel: mode,
              color: mode === "count" ? "#d25435" : "#0f6b78",
              description: mode,
              formatValue: (value) => (value == null ? "No value" : formatTick(value).toString()),
              id: mode,
              label: mode,
              renderer: mode === "count" ? "bar" : "line",
            }))}
            onValueChange={setValueMode}
            value={valueMode}
          />
        </div>
        <ChartPanel
          badge={`${minuteLabel(domain[0])} - ${minuteLabel(domain[1])}`}
          title="Binned traffic"
          description="Drag or wheel the plot to change the active domain."
        >
          <BinnedChart
            chartClassName="package-chart"
            config={{
              value: {
                color: valueMode === "count" ? "#d25435" : "#0f6b78",
                label: valueMode,
              },
            }}
            domain={domain}
            formatDomainValue={minuteLabel}
            fullDomain={cartesianViewport.xDomain}
            index={index}
            minSpan={120}
            onDomainChange={setDomain}
            renderDataOptions={{
              xLabel: (sample) => minuteLabel(sample.x),
            }}
            valueMode={valueMode}
          >
            {({ rows }) =>
              valueMode === "count" ? (
                <BarChart data={rows} margin={{ bottom: 8, left: 4, right: 14, top: 12 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis tickLine={false} axisLine={false} width={46} />
                  <Bar dataKey="value" fill="var(--color-value)" radius={0} />
                </BarChart>
              ) : (
                <LineChart data={rows} margin={{ bottom: 8, left: 4, right: 14, top: 12 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis tickLine={false} axisLine={false} width={46} />
                  <Line
                    connectNulls
                    dataKey="value"
                    dot={false}
                    isAnimationActive={false}
                    stroke="var(--color-value)"
                    strokeWidth={2.4}
                    type="monotone"
                  />
                </LineChart>
              )
            }
          </BinnedChart>
        </ChartPanel>
      </SurfaceContent>
    </Surface>
  );
}

function MapsPackageExample() {
  const points = useMemo(() => createGeoPoints(), []);
  const flows = useMemo(
    () => createGeoFlows().map((flow, index) => ({ ...flow, id: flow.id ?? `flow-${index}` })),
    [],
  );
  const bubbleFeatures = useMemo(
    () =>
      createBubbleMapFeatures(points, {
        maxRadius: 30,
        minRadius: 7,
        weightMetric: "demand",
      }),
    [points],
  );
  const heatFeatures = useMemo(
    () => createHeatMapFeatureCollection(points, { weightMetric: "demand" }).features,
    [points],
  );
  const flowFeatures = useMemo(
    () =>
      createFlowMapFeatures(flows, {
        maxWidth: 10,
        minWidth: 2,
        weightMetric: "demand",
      }),
    [flows],
  );

  return (
    <Surface>
      <SurfaceHeader className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <Badge variant="outline" className="mb-3">
            @moritzbrantner/maps@0.1.4
          </Badge>
          <SurfaceTitle>Map package feature builders</SurfaceTitle>
          <SurfaceDescription>
            The maps package derives bubble, heat, and flow features from the same geographic sample
            data used by viz-engine.
          </SurfaceDescription>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <ChartMetricStrip label="Bubbles" value={bubbleFeatures.length.toLocaleString()} />
          <ChartMetricStrip label="Heat points" value={heatFeatures.length.toLocaleString()} />
          <ChartMetricStrip label="Flows" value={flowFeatures.length.toLocaleString()} />
        </div>
      </SurfaceHeader>
      <SurfaceContent className="package-map-grid">
        <FlatBubbleMap
          bubbleColor="#0f6b78"
          mapLabel="@moritzbrantner/maps bubble map"
          mapStyle={packageMapStyle}
          maxRadius={30}
          minRadius={7}
          points={points}
          showAttributionControl={false}
          style={{ height: 360 }}
          weightMetric="demand"
        />
        <FlatHeatMap
          mapLabel="@moritzbrantner/maps heat map"
          mapStyle={packageMapStyle}
          points={points}
          showAttributionControl={false}
          style={{ height: 360 }}
          weightMetric="demand"
        />
        <FlatFlowMap
          flowColor="#c84830"
          flowShape="arc"
          flows={flows}
          mapLabel="@moritzbrantner/maps flow map"
          mapStyle={packageMapStyle}
          maxWidth={10}
          minWidth={2}
          showAttributionControl={false}
          style={{ height: 360 }}
          weightMetric="demand"
        />
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
      frame: engine.hydrateFrame(
        engine.computeFrame({ frameFormat: "typed", viewport: cartesianViewport }),
      ),
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
      frame: engine.hydrateFrame(
        engine.computeFrame({ frameFormat: "typed", viewport: financeViewport }),
      ),
      viewport: financeViewport,
    };
  }

  const viewport = geoViewport;
  const datasetId = createGeoDataset(engine, slug);

  engine.addLayer(createGeoLayer(slug, datasetId));

  return {
    frame: engine.hydrateFrame(engine.computeFrame({ frameFormat: "typed", viewport })),
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

  if (kind === "geo-scalar-field") {
    return {
      datasetId,
      fieldColumns: 48,
      fieldRows: 28,
      interpolationK: 8,
      kind,
      valueMetric: "demand",
    };
  }

  if (kind === "geojson") {
    return { clipToViewport: true, datasetId, kind, simplifyTolerance: 0.001 };
  }

  if (kind === "geo-flows") {
    return { aggregate: "none" as const, datasetId, kind, minWeight: 2, weightMetric: "demand" };
  }

  return { datasetId, kind };
}

function createFrameSummary(frame: VizRenderFrame, layer: VizRenderFrame["layers"][number] | null) {
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
