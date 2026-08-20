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

// Reference gradient magnitude that counts as "steep enough to drain freely".
// A central difference (±1 step) over the altitude field, so the value depends
// on the *step size* of the caller — a patch-scale difference spans
// tilesPerPatch tiles and is correspondingly larger.
//
// These are measured, not guessed. Over four climate segments the |gradient|
// distribution is remarkably stable (it is set by the altitude noise field's
// roughness, not by segmentBase):
//
//            p10    p50    p90    p99    max
//   tile    0.009  0.025  0.049  0.071  0.092
//   patch   0.034  0.087  0.147  0.205  0.248
//
// Each reference is set so a median slope lands near 0.45 and a p90 slope near
// 0.8, with the steepest ~10% saturating at 1 (a steep tile *is* fully
// free-draining). The previous single hardcoded 0.3 was mismatched to both
// scales: at tile scale a median gradient produced slopeDrainage ≈ 0.08, so 70%
// of the formula was inert and drainage could never exceed ~0.38. That made
// `sand`, `bareRock` and `scree` unreachable in tile-designer's substrate
// scoring and killed its warm-desert mechanism outright.
//
// If `localNoiseScale` or the altitude amplitude changes materially, re-measure
// and update these.
export const TILE_GRADIENT_REF = 0.055;
export const PATCH_GRADIENT_REF = 0.19;

// Drainage from terrain slope and rock permeability.
// gx/gy are altitude differences (east−west, south−north); permeability ∈ [0, 1].
// `gradientRef` must match the scale the caller took its differences at.
// Convention: 0 = fully waterlogged, 1 = fully free-draining.
export function computeDrainage(
  gx: number,
  gy: number,
  permeability: number,
  gradientRef: number,
): number {
  const slopeDrainage = clamp(Math.sqrt(gx * gx + gy * gy) / gradientRef, 0, 1);
  return clamp(slopeDrainage * 0.7 + permeability * 0.3, 0, 1);
}

// Encodes (x, y) as a single integer for use in Set/Map.
// width must be provided so the encoding is collision-free for the grid dimensions.
export function tileKey(x: number, y: number, width: number): number {
  return x * width + y;
}
