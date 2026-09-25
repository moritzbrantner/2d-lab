export type Rgba = readonly [
  red: number,
  green: number,
  blue: number,
  alpha: number,
];

const CSS_NUMBER = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
const LEGACY_RGBA_PATTERN = new RegExp(
  `^rgba\\(\\s*(${CSS_NUMBER})\\s*,\\s*(${CSS_NUMBER})\\s*,\\s*(${CSS_NUMBER})\\s*,\\s*(${CSS_NUMBER})\\s*\\)$`,
  "i",
);

export function parseHexColor(value: string): Rgba | null {
  if (!value.startsWith("#")) {
    return null;
  }

  const hex = value.slice(1);
  if (![3, 4, 6, 8].includes(hex.length) || !/^[0-9a-f]+$/i.test(hex)) {
    return null;
  }

  const expanded =
    hex.length <= 4
      ? [...hex].map((digit) => digit + digit).join("")
      : hex;
  const withAlpha = expanded.length === 6 ? expanded + "ff" : expanded;

  return [
    Number.parseInt(withAlpha.slice(0, 2), 16) / 255,
    Number.parseInt(withAlpha.slice(2, 4), 16) / 255,
    Number.parseInt(withAlpha.slice(4, 6), 16) / 255,
    Number.parseInt(withAlpha.slice(6, 8), 16) / 255,
  ];
}

export function parsePaintColor(value: string): Rgba | null {
  return parseHexColor(value) ?? parseLegacyRgbaColor(value);
}

function parseLegacyRgbaColor(value: string): Rgba | null {
  const match = LEGACY_RGBA_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const red = Number(match[1]);
  const green = Number(match[2]);
  const blue = Number(match[3]);
  const alpha = Number(match[4]);
  const rgb = [red, green, blue];

  if (
    rgb.some(
      (channel) =>
        !Number.isInteger(channel) || channel < 0 || channel > 255,
    ) ||
    !Number.isFinite(alpha) ||
    alpha < 0 ||
    alpha > 1
  ) {
    return null;
  }

  return [red / 255, green / 255, blue / 255, alpha];
}
