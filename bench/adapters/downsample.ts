import { LTTB } from "downsample";

import type { VizOhlcvBar } from "../../src/types";

export function getDownsampledCloseSeries(
  bars: readonly VizOhlcvBar[],
  query: { targetBarCount: number; xDomain: [number, number] },
) {
  const points = bars
    .filter((bar) => bar.timestamp >= query.xDomain[0] && bar.timestamp <= query.xDomain[1])
    .map((bar) => [bar.timestamp, bar.close] as [number, number]);

  return LTTB(points, query.targetBarCount);
}
