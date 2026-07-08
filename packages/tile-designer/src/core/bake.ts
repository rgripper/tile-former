// Composes the bake stages for one tile. As of M3 this is: substrate
// generators + the mat stage (tufts, spots, litter stamps) + static scatter
// (pebbles/twigs/leaves) + flat water. All noise is world-coordinate so
// neighboring tiles are seamless.

import type { StyleParams } from "./types.ts";
import { hash2D } from "./rng.ts";
import { insideDiamond, makeBuffer, put, type PixelBuffer } from "./pixels.ts";
import { paintSubstrate } from "./substrate/index.ts";
import { paintMats } from "./mats/index.ts";
import { paintStaticScatter } from "./scatter/index.ts";

const WATER_RAMP = [0x1e4e86, 0x2e6db4, 0x3f7ec4, 0x5a94d4];

// Bakes one tile's floor at (ox, oy) world pixel origin. Pure and
// deterministic in (style, ox, oy, seed).
export function bakeTile(
  style: StyleParams,
  ox: number,
  oy: number,
  seed: number,
): PixelBuffer {
  const buf = makeBuffer();
  if (style.water) {
    for (let y = 0; y < buf.height; y++) {
      for (let x = 0; x < buf.width; x++) {
        if (!insideDiamond(x, y)) continue;
        const n = hash2D(ox + x, oy + y, seed ^ 0x9e3779b9);
        put(buf, x, y, WATER_RAMP[n < 0.85 ? 1 : n < 0.95 ? 2 : 3]!);
      }
    }
    return buf;
  }
  paintSubstrate(buf, style, ox, oy, seed);
  paintMats(buf, style, ox, oy, seed);
  paintStaticScatter(buf, style, ox, oy, seed);
  return buf;
}
