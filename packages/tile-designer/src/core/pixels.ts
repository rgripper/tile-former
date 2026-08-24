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

// --- Vector primitives -------------------------------------------------------
// Flat-shaded polygon fill and 1px lines, for the terrain preview's cliff faces
// and altitude rims (core/terrain.ts) — the one place this package draws
// vector shapes rather than sampling a generator per pixel.

// Solid fill of a convex polygon via horizontal scanline intersection. Only
// ever called with axis-aligned parallelograms (cliff faces), so a plain
// even-odd scan is sufficient; no attempt at general polygon support.
export function fillPolygon(buf: PixelBuffer, points: ReadonlyArray<readonly [number, number]>, color: number): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(buf.height - 1, Math.ceil(maxY));
  const n = points.length;
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const [ax, ay] = points[i]!;
      const [bx, by] = points[(i + 1) % n]!;
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) {
        xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.max(0, Math.round(xs[i]!));
      const x1 = Math.min(buf.width - 1, Math.round(xs[i + 1]!) - 1);
      for (let x = x0; x <= x1; x++) put(buf, x, y, color);
    }
  }
}

// 1px Bresenham line — this is pixel art, so a stroke is a hard 1px path, never
// an antialiased or width-scaled one.
export function drawLine(buf: PixelBuffer, x0: number, y0: number, x1: number, y1: number, color: number): void {
  let cx = Math.round(x0);
  let cy = Math.round(y0);
  const ex = Math.round(x1);
  const ey = Math.round(y1);
  const dx = Math.abs(ex - cx);
  const sx = cx < ex ? 1 : -1;
  const dy = -Math.abs(ey - cy);
  const sy = cy < ey ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (cx >= 0 && cx < buf.width && cy >= 0 && cy < buf.height) put(buf, cx, cy, color);
    if (cx === ex && cy === ey) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      cx += sx;
    }
    if (e2 <= dx) {
      err += dx;
      cy += sy;
    }
  }
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
