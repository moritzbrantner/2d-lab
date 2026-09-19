import { describe, expect, it } from "vitest";

import { parseHexColor } from "./color";

describe("parseHexColor", () => {
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

  it("rejects non-hex paints", () => {
    expect(parseHexColor("rgb(0 0 0)")).toBeNull();
    expect(parseHexColor("#12xz34")).toBeNull();
  });
});
