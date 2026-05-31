export type SeededRandom = {
  between(min: number, max: number): number;
  int(min: number, max: number): number;
  next(): number;
  normal(mean?: number, stdDev?: number): number;
};

export function createSeededRandom(seed: number): SeededRandom {
  let state = seed >>> 0;

  function next() {
    state = (state + 0x6d2b_79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  return {
    between(min, max) {
      return min + (max - min) * next();
    },
    int(min, max) {
      return Math.floor(min + (max - min + 1) * next());
    },
    next,
    normal(mean = 0, stdDev = 1) {
      const u1 = Math.max(Number.EPSILON, next());
      const u2 = Math.max(Number.EPSILON, next());
      const magnitude = Math.sqrt(-2 * Math.log(u1));
      return mean + stdDev * magnitude * Math.cos(2 * Math.PI * u2);
    },
  };
}
