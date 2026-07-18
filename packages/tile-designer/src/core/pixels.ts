// Shared pixel-buffer contract for all bake stages.

import { TILE_H, TILE_W } from "./types.ts";

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

export function put(buf: PixelBuffer, x: number, y: number, color: number): void {
  const o = (y * buf.width + x) * 4;
  buf.data[o] = (color >> 16) & 0xff;
  buf.data[o + 1] = (color >> 8) & 0xff;
  buf.data[o + 2] = color & 0xff;
  buf.data[o + 3] = 255;
}
