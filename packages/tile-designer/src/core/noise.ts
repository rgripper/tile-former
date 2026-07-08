// World-coordinate noise primitives for the bake stages. Everything here is a
// pure function of (world position, seed) so adjacent tiles sampling the same
// world pixels agree — that is the entire seamlessness story.

import { hash2D } from "./rng.ts";

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Smoothed value noise on an integer lattice, output [0,1).
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = smooth(x - xi);
  const ty = smooth(y - yi);
  const a = hash2D(xi, yi, seed);
  const b = hash2D(xi + 1, yi, seed);
  const c = hash2D(xi, yi + 1, seed);
  const d = hash2D(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

// 3-octave fBm, output ~[0,1). freq is cycles per pixel of the base octave.
export function fbm(x: number, y: number, seed: number, freq: number): number {
  return (
    valueNoise(x * freq, y * freq, seed) * 0.5714 +
    valueNoise(x * freq * 2, y * freq * 2, seed ^ 0x9e3779b9) * 0.2857 +
    valueNoise(x * freq * 4, y * freq * 4, seed ^ 0x517cc1b7) * 0.1429
  );
}

// 4×4 Bayer ordered-dither threshold, output in [0,1) with 16 levels.
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function bayer(x: number, y: number): number {
  return (BAYER4[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;
}

// Cellular (Worley) edge closeness: 0 on a cell boundary rising to ~1 at cell
// centers, computed as F2−F1 over jittered feature points. Used for cracks
// (dry clay, frost polygons) by thresholding near 0.
export function cellEdge(x: number, y: number, seed: number, cellSize: number): number {
  const cx = Math.floor(x / cellSize);
  const cy = Math.floor(y / cellSize);
  let f1 = Infinity;
  let f2 = Infinity;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i;
      const gy = cy + j;
      const px = (gx + hash2D(gx, gy, seed)) * cellSize;
      const py = (gy + hash2D(gx, gy, seed ^ 0x68bc21eb)) * cellSize;
      const dx = x - px;
      const dy = y - py;
      const d = dx * dx + dy * dy;
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return (Math.sqrt(f2) - Math.sqrt(f1)) / cellSize;
}
