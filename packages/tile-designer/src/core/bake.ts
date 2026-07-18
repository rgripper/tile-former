// Composes the bake stages for one tile. As of M3 this is: substrate
// generators + the mat stage (tufts, spots, litter stamps) + static scatter
// (pebbles/twigs/leaves) + flat water. All noise is world-coordinate so
// neighboring tiles are seamless.

import type { RenderStyle, StyleParams } from "./types.ts";
import { hash2D } from "./rng.ts";
import { grainCoord } from "./noise.ts";
import { makeBuffer, put, rowSpan, type PixelBuffer } from "./pixels.ts";
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
  render: RenderStyle,
): PixelBuffer {
  const buf = makeBuffer();
  if (style.water) {
    for (let y = 0; y < buf.height; y++) {
      const [x0, x1] = rowSpan(y);
      const gy = grainCoord(oy + y, render.grain);
      for (let x = x0; x <= x1; x++) {
        const gx = grainCoord(ox + x, render.grain);
        const n = hash2D(gx, gy, seed ^ 0x9e3779b9);
        put(buf, x, y, WATER_RAMP[n < 0.85 ? 1 : n < 0.95 ? 2 : 3]!);
      }
    }
    return buf;
  }
  // Whole-tile dominant-tone bias (±0.5 ramp step) keyed off the tile's world
  // origin, so neighboring tiles occasionally settle a shade apart. Zero unless
  // tile variation is on.
  const tileBias = render.tileVariation ? hash2D(ox, oy, seed ^ 0x51ed270b) - 0.5 : 0;
  paintSubstrate(buf, style, ox, oy, seed, render, tileBias);
  paintMats(buf, style, ox, oy, seed, render, tileBias);
  paintStaticScatter(buf, style, ox, oy, seed);
  return buf;
}
