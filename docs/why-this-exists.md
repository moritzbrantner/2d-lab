# Why This Exists

`@moritzbrantner/viz-engine` is not a chart renderer. It is a data and frame
engine for renderers.

## Use This Engine When

- Multiple views should share the same datasets and indexes.
- You need typed-array payloads for Canvas, WebGL, workers, or high-frequency
  rendering.
- You want the same data contracts across SVG, Canvas, WebGL, React, server
  rendering, or future renderer packages.
- You need JS fallbacks and Rust/WASM kernels behind one API.
- You want XY, geo, and finance data layers to share one frame lifecycle.

## Use A Chart Library Directly When

- You only need one chart and the library can aggregate the data itself.
- You want built-in axes, legends, animation, tooltip UI, and layout.
- You do not need worker transfer or shared indexes.
- Your data volume is small enough that renderer-level transformation is fine.

## Benchmark Positioning

The benchmark suite compares data-kernel work, not full visual renderers. It
measures index construction, binned series, histograms, heatmaps, rolling
series, geo viewport work, finance downsampling, return series, and WASM startup
costs.

It intentionally does not measure SVG, Canvas, WebGL, React lifecycle overhead,
or full chart libraries such as ECharts, uPlot, Recharts, or Chart.js.

See [bench/README.md](../bench/README.md) for commands and caveats.
