import { createVizEngine, type VizOhlcvBar } from "@moritzbrantner/viz-engine/core";

export function mountFinanceCandlesExample(root: HTMLElement) {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 320;
  root.replaceChildren(canvas);

  const bars = createBars(480);
  const engine = createVizEngine({ backend: "auto" });
  const datasetId = engine.addDataset({
    bars,
    instrument: { assetClass: "equity", currency: "USD", symbol: "ACME" },
    kind: "finance-ohlcv",
  });

  engine.addLayer({
    datasetId,
    kind: "finance-candles",
    targetBarCount: 120,
    xDomain: [bars[0].timestamp, bars[bars.length - 1].timestamp],
  });
  engine.addLayer({
    datasetId,
    kind: "finance-returns",
    method: "log",
    targetPointCount: 120,
    xDomain: [bars[0].timestamp, bars[bars.length - 1].timestamp],
  });

  const frame = engine.computeFrame({
    viewport: {
      height: canvas.height,
      width: canvas.width,
      xDomain: [bars[0].timestamp, bars[bars.length - 1].timestamp],
    },
  });
  const candleLayer = frame.layers.find((layer) => layer.kind === "finance-candles");
  const context = canvas.getContext("2d");

  if (
    !context ||
    !candleLayer ||
    candleLayer.kind !== "finance-candles" ||
    !("typedCandles" in candleLayer)
  ) {
    return;
  }

  drawCandles(context, candleLayer.typedCandles, canvas.width, canvas.height);
}

function createBars(count: number): VizOhlcvBar[] {
  const start = Date.UTC(2024, 0, 1);
  let close = 100;

  return Array.from({ length: count }, (_, index) => {
    const open = close;
    close = open + Math.sin(index / 9) * 1.8 + Math.cos(index / 17) * 0.9;
    const high = Math.max(open, close) + 2;
    const low = Math.min(open, close) - 2;

    return {
      close,
      high,
      low,
      open,
      timestamp: start + index * 86_400_000,
      volume: 100_000 + index * 500,
    };
  });
}

function drawCandles(
  context: CanvasRenderingContext2D,
  bars: {
    close: Float64Array;
    high: Float64Array;
    low: Float64Array;
    open: Float64Array;
  },
  width: number,
  height: number,
) {
  const lows = [...bars.low];
  const highs = [...bars.high];
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const range = Math.max(1, max - min);
  const candleWidth = width / Math.max(1, bars.close.length);

  context.clearRect(0, 0, width, height);

  for (let index = 0; index < bars.close.length; index += 1) {
    const x = index * candleWidth + candleWidth / 2;
    const openY = priceToY(bars.open[index], min, range, height);
    const closeY = priceToY(bars.close[index], min, range, height);
    const highY = priceToY(bars.high[index], min, range, height);
    const lowY = priceToY(bars.low[index], min, range, height);
    const rising = bars.close[index] >= bars.open[index];

    context.strokeStyle = rising ? "#16a34a" : "#dc2626";
    context.fillStyle = context.strokeStyle;
    context.beginPath();
    context.moveTo(x, highY);
    context.lineTo(x, lowY);
    context.stroke();
    context.fillRect(
      x - candleWidth * 0.3,
      Math.min(openY, closeY),
      Math.max(1, candleWidth * 0.6),
      Math.max(1, Math.abs(closeY - openY)),
    );
  }
}

function priceToY(value: number, min: number, range: number, height: number) {
  return height - ((value - min) / range) * height;
}
