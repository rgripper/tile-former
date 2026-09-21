// Shared pixel-buffer contract for all bake stages.

import { TILE_H, TILE_W } from "./types.ts";
import { fbm, smoothstep } from "./noise.ts";

export type PixelBuffer = {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA, length = width * height * 4
};

export function makeBuffer(width = TILE_W, height = TILE_H): PixelBuffer {
  return hidePixelData({ width, height, data: new Uint8ClampedArray(width * height * 4) });
}

// Marks a pixel payload non-enumerable. Every object in this package that
// carries a big typed array must go through this before it can reach a React
// prop, which in practice means all of them — PixelBuffer, MaskBitmap and
// FeatureSpriteRef all end up inside an Atlas, and `AtlasPanel` takes an Atlas.
//
// Why it is needed: React's development build serialises each component's props
// for its performance track (`logComponentRender` → `addObjectToProperties`),
// which walks objects with `for...in` down to depth 3. A typed array's indices
// are enumerable own properties, so one PixelBuffer reaching a prop costs React
// one [string, string] pair *per pixel byte*. Measured with Chrome's sampling
// heap profiler on a single 32×32 terrain-preview rebuild: 954 MB allocated, of
// which 953 MB was `addValueToProperties` + `logComponentRender` and ~1 MB was
// this package's own code. A production build of the same interaction stays at
// 4–5 MB, flat — so this is purely a dev-mode tax, but dev is where the tab was
// running out of memory after a handful of preview-option changes.
//
// `for...in` skips non-enumerable keys, while `buf.data[i]` is unaffected.
//
// The one real consequence: `{ ...buf }` now silently drops the pixels, because
// spread copies enumerable own properties only. Use `aliasBuffer` when you need
// a fresh object identity for the same pixels — what a caller mutating a buffer
// in place needs so React sees a changed prop. Nothing does that today (the
// progressive per-tile bake that did is gone with v1), but the failure is
// silent, so `TileCanvas` guards against it.
export function hidePixelData<T extends { data: ArrayBufferView }>(obj: T): T {
  Object.defineProperty(obj, "data", {
    value: obj.data,
    enumerable: false,
    writable: true,
    configurable: true,
  });
  return obj;
}

// A new object identity over the same pixels. Callers that mutate a buffer in
// place and republish it need React to see a changed prop; `{ ...buf }` used to
// do that and no longer can (see hidePixelData).
export function aliasBuffer(buf: PixelBuffer): PixelBuffer {
  return hidePixelData({ width: buf.width, height: buf.height, data: buf.data });
}

// Diamond mask in the 2:1 iso tile: |dx| + |dy| <= 1 in normalized coords.
export function insideDiamond(x: number, y: number): boolean {
  const dx = (x + 0.5) / (TILE_W / 2) - 1;
  const dy = (y + 0.5) / (TILE_H / 2) - 1;
  return Math.abs(dx) + Math.abs(dy) <= 1;
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
