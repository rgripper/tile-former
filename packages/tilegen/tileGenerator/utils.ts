import { createNoise2D } from "simplex-noise";
import { createRand } from "../rand";

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

export function makeNoise2D(seed: string) {
  return createNoise2D(createRand(seed).next);
}

// Drainage from terrain slope and rock permeability.
// gx/gy are altitude differences (east−west, south−north); permeability ∈ [0, 1].
export function computeDrainage(gx: number, gy: number, permeability: number): number {
  const slopeDrainage = clamp(Math.sqrt(gx * gx + gy * gy) / 0.3, 0, 1);
  return clamp(slopeDrainage * 0.7 + permeability * 0.3, 0, 1);
}

// Encodes (x, y) as a single integer for use in Set/Map.
// width must be provided so the encoding is collision-free for the grid dimensions.
export function tileKey(x: number, y: number, width: number): number {
  return x * width + y;
}
