# Focused Examples

The focused examples are small, typechecked source examples under
`examples/focused/`. They are not standalone apps. Mount them from a local app
or copy the relevant pattern into a consumer project.

## Vanilla Canvas Renderer

File: `examples/focused/vanilla-canvas.ts`

Uses `@moritzbrantner/viz-engine` to compute a typed binned-series frame
and draw it directly to a `<canvas>`.

## React Renderer

File: `examples/focused/react-renderer.tsx`

Uses `@moritzbrantner/viz-engine/react` for provider, dataset, layer, and typed
frame hooks, then renders a simple SVG path.

## Worker Frame Computation

Files:

- `examples/focused/worker-main.ts`
- `examples/focused/worker-thread.ts`

Uses `@moritzbrantner/viz-engine` and `getVizFrameTransferables` to compute
a typed heatmap frame in a worker and transfer typed-array buffers back to the
main thread.

## Geo Viewport Rendering

File: `examples/focused/geo-viewport.ts`

Uses `@moritzbrantner/viz-engine` to cluster geo points for a flat viewport
and draw the typed cluster payload to a canvas.

## Finance Candles And Returns

File: `examples/focused/finance-candles.ts`

Uses `@moritzbrantner/viz-engine` to compute finance candles and returns
from OHLCV bars, then draws the typed candle payload to a canvas.

## Run Model

These examples intentionally stay as source examples for now:

- no separate Vite apps
- no additional dependencies
- included in `tsconfig.json` through `examples/**/*.ts` and
  `examples/**/*.tsx`
