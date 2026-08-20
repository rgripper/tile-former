// Shared pixel-buffer contract for all bake stages.

import { TILE_H, TILE_W } from "./types.ts";
import { fbm, smoothstep } from "./noise.ts";

export type PixelBuffer = {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA, length = width * height * 4
};

export function makeBuffer(width = TILE_W, height = TILE_H): PixelBuffer {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

// Diamond mask in the 2:1 iso tile: |dx| + |dy| <= 1 in normalized coords.
export function insideDiamond(x: number, y: number): boolean {
  const dx = (x + 0.5) / (TILE_W / 2) - 1;
  const dy = (y + 0.5) / (TILE_H / 2) - 1;
  return Math.abs(dx) + Math.abs(dy) <= 1;
}

// Normalized inset from the diamond edge: 0 exactly on the border, 1 at the
// tile center. Same |dx|+|dy| space as insideDiamond, so it is 1 - (|dx|+|dy|).
// Unlike the noise generators this is a per-tile *local* quantity — the price of
// holding non-primary patches off the rim is that those patches no longer cross
// tile borders, which is the intended trade for clean biome seams.
export function edgeInset(x: number, y: number): number {
  const dx = (x + 0.5) / (TILE_W / 2) - 1;
  const dy = (y + 0.5) / (TILE_H / 2) - 1;
  return 1 - (Math.abs(dx) + Math.abs(dy));
}

// Inclusive [x0, x1] span of diamond pixels on row y — closed-form version of
// scanning insideDiamond across the row. Lets the bake stages iterate only the
// ~50% of the rect that is actually inside the diamond.
export function rowSpan(y: number): [number, number] {
  const dy = Math.abs((y + 0.5) / (TILE_H / 2) - 1);
  const halfW = TILE_W / 2;
  // |dx| <= 1 - dy  =>  x + 0.5 in [halfW*dy, TILE_W - halfW*dy]
  const x0 = Math.ceil(halfW * dy - 0.5);
  const x1 = TILE_W - 1 - x0;
  return [x0, x1];
}

export function put(buf: PixelBuffer, x: number, y: number, color: number): void {
  const o = (y * buf.width + x) * 4;
  buf.data[o] = (color >> 16) & 0xff;
  buf.data[o + 1] = (color >> 8) & 0xff;
  buf.data[o + 2] = color & 0xff;
  buf.data[o + 3] = 255;
}

// --- Isolate edge gate -------------------------------------------------------
// Shared by the substrate and mat stages (both previously carried an identical
// private copy of these constants and the smoothstep below).
//
// `isolatedPatches` mode suppresses non-primary materials near the tile rim so
// the border stays pure primary and biome seams read clean. The naive form,
// smoothstep(MARGIN, MARGIN+FEATHER, edgeInset(x,y)), gates on the raw inset —
// and since a constant inset is by definition a diamond contour concentric with
// the tile, that draws a hard-edged diamond a few pixels in from the border. It
// is highly visible: whatever the non-primary materials contribute (a speckle
// of dryGrass, a patch of a second substrate) stops dead along a perfectly
// straight line that traces the tile shape, which reads as a rectangular
// cut-off rather than as ground.
//
// Perturbing the inset by low-frequency noise before the smoothstep breaks that
// contour into an irregular wandering boundary at essentially no cost. The
// noise is keyed on WORLD coordinates, so two adjacent tiles perturb their
// shared border identically and the gate stays seam-consistent.
export const EDGE_MARGIN = 0.16;
export const EDGE_FEATHER = 0.14;
// How far the gate contour may wander, in edge-inset units. Large enough to
// destroy the diamond read, bounded so non-primary material still cannot reach
// the actual rim (which is what keeps biome seams clean).
export const EDGE_INSET_JITTER = 0.16;
const EDGE_JITTER_FREQ = 0.05;

export function isolateEdgeGate(
  x: number,
  y: number,
  wx: number,
  wy: number,
  seed: number,
): number {
  const jitter = (fbm(wx, wy * 2, seed ^ 0x39c1f2b7, EDGE_JITTER_FREQ) - 0.5) * 2 * EDGE_INSET_JITTER;
  return smoothstep(EDGE_MARGIN, EDGE_MARGIN + EDGE_FEATHER, edgeInset(x, y) + jitter);
}
