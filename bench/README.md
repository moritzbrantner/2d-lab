# Viz Engine Benchmarks

This directory contains repeatable data-kernel benchmarks for `@moritzbrantner/viz-engine`.
It compares the engine against libraries that perform similar data work, not full chart renderers.

## What Is Measured

- XY index construction
- XY binned series, histograms, heatmaps, and rolling series
- Full cartesian `computeFrame` calls with binned, histogram, heatmap, and rolling layers
- Object and typed-array `computeFrame` frame formats
- Geo viewport clustering and heat feature generation
- Finance OHLCV downsampling and return series
- Rust/WASM density index construction, first query, and warm query costs

## What Is Not Measured

- SVG, Canvas, WebGL, or WebGPU rendering
- React hook lifecycle overhead
- Full chart libraries such as ECharts, uPlot, Recharts, or Chart.js
- Real market/map datasets
- CI pass/fail performance gates

## Commands

Run a short local sanity benchmark:

```sh
bun run bench:quick
```

Run the full Bun benchmark:

```sh
bun run bench:node
```

Run the browser benchmark in Chromium through Playwright:

```sh
bun run bench:browser
```

Regenerate the Markdown report from the latest JSON files:

```sh
bun run bench:report
```

Results are written to `bench/results/*.json`, and the latest human-readable report is written to
`bench/results/latest.md`. Generated result files are ignored by Git except for `.gitkeep`.

## Interpreting Results

Lower latency is better. Each result records mean, p50, p75, p95, p99, ops/sec, relative latency, sample count, and memory delta when the runtime exposes memory data.

Relative values use `viz-engine js` as the baseline when it exists for a workload. If there is no `viz-engine js` row, the report uses the fastest external implementation, then the fastest implementation in the group.

## Semantic Caveats

- `d3-array` is used as an XY aggregation baseline. The adapters normalize output shape, but D3 binning semantics are not identical to `viz-engine` for every edge case.
- `supercluster` is a geospatial clustering baseline. It uses a different KD-tree/tile clustering strategy than the current `viz-engine` grid clustering.
- `downsample` is a visual close-price downsampler. It does not preserve OHLC semantics, so the suite also includes a local OHLC aggregation baseline.
- Geo and finance WASM cases use `@mb-rust/geo-viz-wasm` and `@mb-rust/finance-data-wasm`; JS rows remain as fallback and parity baselines.
- Build the finance and geo WASM npm packages sequentially before browser benchmarking. Running two `wasm-pack` builds at once can race in `wasm-opt` output files.
- WASM startup cases run in one process, so module import is not isolated for every iteration. The suite separates construction, first-query, and warm-query costs.
- Typed frame cases measure the typed-array render path. They are the preferred signal for high-frequency WASM-backed cartesian rendering because they avoid object hydration.
- Shifting viewport frame cases use viewport-derived layer domains, so they measure recomputation instead of same-domain cache hits.

## Fixture Data

Fixtures are synthetic and deterministic:

- XY data combines trend, seasonality, noise, spikes, metrics, and controlled x-disorder.
- Geo data mixes clustered city points, outliers, metrics, and antimeridian viewport coverage.
- Finance data is a valid OHLCV random walk with adjusted close values and market-regime properties.

The seed is defined in `bench/config.ts`.
