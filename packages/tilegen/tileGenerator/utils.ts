export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export const MOORE8: ReadonlyArray<[number, number]> = [
  [-1, -1], [-1, 0], [-1, 1],
  [ 0, -1],          [ 0, 1],
  [ 1, -1], [ 1, 0], [ 1, 1],
];

export const VON4: ReadonlyArray<[number, number]> = [
  [0, 1], [0, -1], [1, 0], [-1, 0],
];

// Box-Muller transform: u1, u2 uniform in (0,1) → one N(mean, stddev) sample.
export function sampleNormal(mean: number, stddev: number, u1: number, u2: number): number {
  const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
  return mean + stddev * z;
}
