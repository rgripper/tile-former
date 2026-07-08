// M1 flat-color preview painter: solid ramp colors, dithered substrate blend,
// stippled mats — no texture art yet. Replaced by the real substrate/mat
// generators in M2/M3, but the diamond mask and buffer contract stay.

import type { StyleParams } from "./types.ts";
import { TILE_H, TILE_W } from "./types.ts";
import { hash2D } from "./rng.ts";

export type PixelBuffer = {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA, length = width * height * 4
};

// Diamond mask in the 2:1 iso tile: |dx| + |dy| <= 1 in normalized coords.
export function insideDiamond(x: number, y: number): boolean {
  const dx = (x + 0.5) / (TILE_W / 2) - 1;
  const dy = (y + 0.5) / (TILE_H / 2) - 1;
  return Math.abs(dx) + Math.abs(dy) <= 1;
}

function put(buf: PixelBuffer, x: number, y: number, color: number): void {
  const o = (y * buf.width + x) * 4;
  buf.data[o] = (color >> 16) & 0xff;
  buf.data[o + 1] = (color >> 8) & 0xff;
  buf.data[o + 2] = color & 0xff;
  buf.data[o + 3] = 255;
}

const WATER_RAMP = [0x1e4e86, 0x2e6db4, 0x3f7ec4, 0x5a94d4];

export function paintFlatPreview(style: StyleParams, seed: number): PixelBuffer {
  const buf: PixelBuffer = {
    width: TILE_W,
    height: TILE_H,
    data: new Uint8ClampedArray(TILE_W * TILE_H * 4),
  };

  const subs = style.surface.substrates;
  const first = subs[0];

  for (let y = 0; y < TILE_H; y++) {
    for (let x = 0; x < TILE_W; x++) {
      if (!insideDiamond(x, y)) continue;

      if (style.water) {
        const n = hash2D(x, y, seed ^ 0x9e3779b9);
        put(buf, x, y, WATER_RAMP[n < 0.85 ? 1 : n < 0.95 ? 2 : 3]!);
        continue;
      }
      if (!first) continue;

      // Substrate pick: threshold world-ish noise against the first weight.
      let id = first.id;
      if (subs.length > 1 && hash2D(x, y, seed) >= first.weight) {
        id = subs[1]!.id;
      }
      const ramp = style.substrateRamps[id]!;
      // Mild per-pixel value variation within the ramp (mostly mid tones).
      const v = hash2D(x, y, seed ^ 0x51ed270b);
      let color = ramp[v < 0.55 ? 1 : v < 0.85 ? 2 : v < 0.95 ? 0 : 3]!;

      // Mats: stipple each layer at its coverage fraction, first-hit wins
      // (mats are ordered by coverage descending).
      for (let mi = 0; mi < style.surface.mats.length; mi++) {
        const mat = style.surface.mats[mi]!;
        const n = hash2D(x, y, seed ^ (0xabcd1234 + mi * 0x1013));
        if (n < mat.coverage * 0.75) {
          const mRamp = style.matRamps[mat.id]!;
          const mv = hash2D(x, y, seed ^ (0x7f4a7c15 + mi));
          color = mRamp[mv < 0.5 ? 1 : mv < 0.85 ? 2 : 3]!;
          break;
        }
      }

      put(buf, x, y, color);
    }
  }
  return buf;
}
