// World-lattice stamp helpers for mats (M3) and scatter. A lattice cell may
// own one feature (a leaf, a pebble, a lichen disc); the feature's anchor is
// jittered inside its cell and every pixel checks the 3×3 neighboring cells,
// so features crossing a tile border are painted identically by both tiles —
// the same seamlessness contract as the noise primitives.
//
// Cell height is conventionally ~half the cell width to keep feature spacing
// isotropic under the 2:1 iso squash. A stamp's pixel extent must stay within
// one cell size or the 3×3 scan can miss it.

import type { Ramp } from "./types.ts";
import { hash2D } from "./rng.ts";

// Renders one feature: (dx, dy) is the pixel offset from the feature anchor,
// h is the feature's own random value, ramp is threaded through from the
// caller (kept as a parameter so stamps can be static functions rather than
// per-pixel closures). Returns a color or null (miss).
export type StampFn = (dx: number, dy: number, h: number, ramp: Ramp) => number | null;

// Color of the stamped feature covering (wx, wy), or null if no feature does.
export function stampField(
  wx: number,
  wy: number,
  seed: number,
  cellW: number,
  cellH: number,
  prob: number,
  stamp: StampFn,
  ramp: Ramp,
): number | null {
  const cx = Math.floor(wx / cellW);
  const cy = Math.floor(wy / cellH);
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i;
      const gy = cy + j;
      if (hash2D(gx, gy, seed) >= prob) continue;
      const ax = Math.floor((gx + hash2D(gx, gy, seed ^ 0x517cc1b7)) * cellW);
      const ay = Math.floor((gy + hash2D(gx, gy, seed ^ 0x85ebca6b)) * cellH);
      const c = stamp(wx - ax, wy - ay, hash2D(gx, gy, seed ^ 0xcc9e2d51), ramp);
      if (c !== null) return c;
    }
  }
  return null;
}

// Round-feature variant for discs/domes (lichen, cushion plants). Returns the
// nearest covering spot with normalized distance d ∈ [0,1] to its center
// (iso-corrected), normalized offsets, and the spot's random value.
export type Spot = { d: number; ndx: number; ndy: number; h: number };

export function spotField(
  wx: number,
  wy: number,
  seed: number,
  cellW: number,
  cellH: number,
  prob: number,
  radius: number,
): Spot | null {
  const cx = Math.floor(wx / cellW);
  const cy = Math.floor(wy / cellH);
  let best: Spot | null = null;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i;
      const gy = cy + j;
      if (hash2D(gx, gy, seed) >= prob) continue;
      const ax = (gx + hash2D(gx, gy, seed ^ 0x517cc1b7)) * cellW;
      const ay = (gy + hash2D(gx, gy, seed ^ 0x85ebca6b)) * cellH;
      const ndx = (wx - ax) / radius;
      const ndy = ((wy - ay) * 2) / radius; // iso squash compensation
      const d = Math.sqrt(ndx * ndx + ndy * ndy);
      if (d <= 1 && (best === null || d < best.d)) {
        best = { d, ndx, ndy, h: hash2D(gx, gy, seed ^ 0xcc9e2d51) };
      }
    }
  }
  return best;
}
