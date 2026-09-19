export type Rgba = readonly [
  red: number,
  green: number,
  blue: number,
  alpha: number,
];

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
  const withAlpha =
    expanded.length === 6 ? expanded + "ff" : expanded;

  return [
    Number.parseInt(withAlpha.slice(0, 2), 16) / 255,
    Number.parseInt(withAlpha.slice(2, 4), 16) / 255,
    Number.parseInt(withAlpha.slice(4, 6), 16) / 255,
    Number.parseInt(withAlpha.slice(6, 8), 16) / 255,
  ];
}
