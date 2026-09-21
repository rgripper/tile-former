// Noise primitives.
//
// Two families live here during the v2 transition:
//
//  1. **World-coordinate** (`valueNoise`, `fbm`, `cellEdge`) — v1's primitives,
//     pure functions of (world position, seed). The per-pixel bake they were
//     written for is gone (milestone G), but they survive as the package's
//     general-purpose noise: anything sampled over *tile* coordinates rather
//     than inside a tile still wants them — the terrain preview's altitude
//     field, the tone-bias field, the previews' property jitter. `grainCoord`
//     went with the bake; chunkiness is a property of the authoring lattice
//     now (lattice.ts, `quantizeLattice`), not something applied to world
//     pixels after the fact.
//
//  2. **Lattice-periodic** (`periodic*`) — v2's primitives, pure functions of a
//     lattice coordinate in [0, 1) with **period 1 in both axes**. Because the
//     iso diamond *is* the unit lattice square (see lattice.ts), period-1
//     functions match across all four diamond edges automatically, so a variant
//     texture tiles with copies of itself invisibly.
//
// A note on what periodicity does and does not buy, since it is easy to
// over-claim: it guarantees that a variant abuts **itself** seamlessly. Two
// *different* variants meeting at an edge still disagree there. For textures
// with no long-range structure (a chunky stipple of one dominant tone plus
// sparse off-tone blocks — i.e. most of this art style) that disagreement is
// invisible, because there is nothing continuous to break. Materials that *do*
// carry long-range structure (sand ripples, rock strata, crack networks) need
// their structural layer shared across variants, with variants differing only
// in detail. That is a milestone-A authoring decision, not something these
// primitives can solve.

import { hash2D } from "./rng.ts";

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Hermite step: 0 at/below a, 1 at/above b, smooth in between.
export function smoothstep(a: number, b: number, x: number): number {
  return smooth(Math.min(1, Math.max(0, (x - a) / (b - a))));
}

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

// ---------------------------------------------------------------------------
// Lattice-periodic primitives (v2)
//
// All of these take lattice coordinates and an integer `cells` = the number of
// noise cells per period. `cells` MUST be an integer: the whole mechanism is
// that lattice indices are hashed modulo `cells`, so a non-integer would put the
// wrap boundary somewhere other than the tile edge and the seam would reappear.
// Callers wanting a period of P lattice units pass u/P and v/P.
// ---------------------------------------------------------------------------

// Non-negative modulo on integers.
const imod = (n: number, m: number) => ((n % m) + m) % m;

// Periodic smoothed value noise. Identical to `valueNoise` except the four
// corner hashes are taken at lattice indices wrapped modulo `cells`.
export function periodicValueNoise(
  u: number,
  v: number,
  seed: number,
  cells: number,
): number {
  const x = u * cells;
  const y = v * cells;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = smooth(x - xi);
  const ty = smooth(y - yi);
  const x0 = imod(xi, cells);
  const x1 = imod(xi + 1, cells);
  const y0 = imod(yi, cells);
  const y1 = imod(yi + 1, cells);
  const a = hash2D(x0, y0, seed);
  const b = hash2D(x1, y0, seed);
  const c = hash2D(x0, y1, seed);
  const d = hash2D(x1, y1, seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

// Periodic 3-octave fBm. Octaves at cells, 2·cells, 4·cells — all integers when
// `cells` is, so every octave wraps on the same boundary and the sum stays
// periodic. Weights match `fbm` so the two are visually comparable.
export function periodicFbm(u: number, v: number, seed: number, cells: number): number {
  return (
    periodicValueNoise(u, v, seed, cells) * 0.5714 +
    periodicValueNoise(u, v, seed ^ 0x9e3779b9, cells * 2) * 0.2857 +
    periodicValueNoise(u, v, seed ^ 0x517cc1b7, cells * 4) * 0.1429
  );
}

// Periodic per-block hash — the lattice-space replacement for `hash2D` on
// grained world pixels. `blocks` must be an integer; returns a value that is
// constant across each authoring block and wraps at the tile edge.
//
// `blocksV` defaults to `blocks` (square blocks, which is what you want almost
// everywhere since lattice space is already isotropic). Pass it explicitly only
// for deliberately anisotropic texture — peat's fibrous streaks are the one
// current case: wide in u, fine in v.
export function periodicBlockHash(
  u: number,
  v: number,
  seed: number,
  blocks: number,
  blocksV: number = blocks,
): number {
  return hash2D(imod(Math.floor(u * blocks), blocks), imod(Math.floor(v * blocksV), blocksV), seed);
}

// Periodic cellular (Worley) edge closeness, for crack networks and frost
// polygons. Same F2−F1 formulation as `cellEdge`.
//
// The trick that makes it periodic: each feature point is *hashed* at its
// wrapped cell index but *positioned* at its unwrapped one, so distances stay
// correct across the wrap boundary while the point pattern repeats.
export function periodicCellEdge(
  u: number,
  v: number,
  seed: number,
  cells: number,
): number {
  const x = u * cells;
  const y = v * cells;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let f1 = Infinity;
  let f2 = Infinity;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i;
      const gy = cy + j;
      const wx = imod(gx, cells);
      const wy = imod(gy, cells);
      const px = gx + hash2D(wx, wy, seed);
      const py = gy + hash2D(wx, wy, seed ^ 0x68bc21eb);
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
  return Math.sqrt(f2) - Math.sqrt(f1);
}

// Periodic feature anchor scan. The lattice-space counterpart of
// `stampField`/`spotField`: a cell may own one feature whose anchor is jittered
// inside it, and every sample checks the 3×3 neighbouring cells so a feature
// straddling the tile edge is painted identically from both sides.
//
// Anchors are hashed at wrapped indices and positioned at unwrapped ones (as
// above), so the anchor pattern is periodic while offsets stay continuous. No
// iso squash correction is needed here — lattice space is already isotropic,
// unlike v1's `spotField`, which carried an explicit `* 2` on dy.
//
// Returns anchors in *lattice cell units*: `du`/`dv` are offsets from the anchor
// measured in cells, so a generator compares them against a radius in cells.
export type PeriodicAnchor = { du: number; dv: number; h: number };

export function periodicAnchors(
  u: number,
  v: number,
  seed: number,
  cells: number,
  prob: number,
): PeriodicAnchor[] {
  const x = u * cells;
  const y = v * cells;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const out: PeriodicAnchor[] = [];
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i;
      const gy = cy + j;
      const wx = imod(gx, cells);
      const wy = imod(gy, cells);
      if (hash2D(wx, wy, seed) >= prob) continue;
      const ax = gx + hash2D(wx, wy, seed ^ 0x517cc1b7);
      const ay = gy + hash2D(wx, wy, seed ^ 0x85ebca6b);
      out.push({ du: x - ax, dv: y - ay, h: hash2D(wx, wy, seed ^ 0xcc9e2d51) });
    }
  }
  return out;
}

// Nearest covering anchor within `radius` (in cells), or null. Convenience
// wrapper over `periodicAnchors` for disc/dome features (lichen, cushions).
export function periodicSpot(
  u: number,
  v: number,
  seed: number,
  cells: number,
  prob: number,
  radius: number,
): (PeriodicAnchor & { d: number }) | null {
  let best: (PeriodicAnchor & { d: number }) | null = null;
  for (const a of periodicAnchors(u, v, seed, cells, prob)) {
    const d = Math.hypot(a.du, a.dv) / radius;
    if (d <= 1 && (best === null || d < best.d)) best = { ...a, d };
  }
  return best;
}
