// Composes the bake stages for one tile. As of M3 this is: substrate
// generators + the mat stage (tufts, spots, litter stamps) + static scatter
// (pebbles/twigs/leaves) + flat water. All noise is world-coordinate so
// neighboring tiles are seamless.

import type { RenderStyle, StyleParams } from "./types.ts";
import { TILE_H, TILE_W } from "./types.ts";
import { hash2D } from "./rng.ts";
import { grainCoord, valueNoise } from "./noise.ts";
import { makeBuffer, put, rowSpan, type PixelBuffer } from "./pixels.ts";
import { paintSubstrate } from "./substrate/index.ts";
import { paintMats } from "./mats/index.ts";
import { paintStaticScatter } from "./scatter/index.ts";

const WATER_RAMP = [0x1e4e86, 0x2e6db4, 0x3f7ec4, 0x5a94d4];

// Lattice spacing for the tile-bias field, in tiles. Larger = the dominant
// tone drifts across more neighboring tiles before it's noticeably shifted.
const VARIATION_SCALE = 4;

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
  // Whole-tile dominant-tone bias (±0.5 ramp step), sampled from a smooth
  // low-frequency field over the tile's world origin so the bias drifts
  // gradually across neighboring tiles instead of jumping tile-to-tile. Zero
  // unless tile variation is on.
  const tileBias = render.tileVariation
    ? valueNoise(ox / TILE_W / VARIATION_SCALE, oy / TILE_H / VARIATION_SCALE, seed ^ 0x51ed270b) - 0.5
    : 0;
  paintSubstrate(buf, style, ox, oy, seed, render, tileBias);
  paintMats(buf, style, ox, oy, seed, render, tileBias);
  paintStaticScatter(buf, style, ox, oy, seed);
  return buf;
}
