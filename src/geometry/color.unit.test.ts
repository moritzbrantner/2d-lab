import { describe, expect, it } from "vitest";

import { parseHexColor, parsePaintColor } from "./color";

describe("color parsing", () => {
  it("parses short and long CSS hex colors", () => {
    expect(parseHexColor("#369")).toEqual([
      0x33 / 255,
      0x66 / 255,
      0x99 / 255,
      1,
    ]);
    expect(parseHexColor("#33669980")).toEqual([
      0x33 / 255,
      0x66 / 255,
      0x99 / 255,
      0x80 / 255,
    ]);
  });

  it("preserves the legacy rgba form emitted by the Maps fixture", () => {
    expect(parsePaintColor("rgba(74, 222, 128, 0.72)")).toEqual([
      74 / 255,
      222 / 255,
      128 / 255,
      0.72,
    ]);
    expect(parsePaintColor("rgba(236, 254, 255, 0.7)")).toEqual([
      236 / 255,
      254 / 255,
      255 / 255,
      0.7,
    ]);
  });

  it("rejects unsupported or out-of-range paint forms", () => {
    expect(parseHexColor("rgb(0 0 0)")).toBeNull();
    expect(parseHexColor("#12xz34")).toBeNull();
    expect(parsePaintColor("rgb(0 0 0)")).toBeNull();
    expect(parsePaintColor("rgba(256, 0, 0, 1)")).toBeNull();
    expect(parsePaintColor("rgba(0, 0, 0, 1.1)")).toBeNull();
    expect(parsePaintColor("rgba(0.5, 0, 0, 1)")).toBeNull();
  });
});
