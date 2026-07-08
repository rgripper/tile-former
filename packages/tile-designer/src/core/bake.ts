// Composes the bake stages for one tile. As of M2 this is: substrate
// generators + an interim mat pass (clustered patches, replaced by real
// tuft/litter art in M3) + flat water. All noise is world-coordinate so
// neighboring tiles are seamless.

import type { StyleParams } from "./types.ts";
import { hash2D } from "./rng.ts";
import { fbm } from "./noise.ts";
import { insideDiamond, makeBuffer, put, type PixelBuffer } from "./pixels.ts";
import { paintSubstrate } from "./substrate/index.ts";

const WATER_RAMP = [0x1e4e86, 0x2e6db4, 0x3f7ec4, 0x5a94d4];

// Interim M2 mats: each layer claims patches where low-frequency noise falls
// under its coverage, with per-pixel ramp variation inside a patch. First-hit
// wins (mats are ordered by coverage descending).
function paintMats(
  buf: PixelBuffer,
  style: StyleParams,
  ox: number,
  oy: number,
  seed: number,
): void {
  const mats = style.surface.mats;
  if (mats.length === 0) return;
  for (let y = 0; y < buf.height; y++) {
    for (let x = 0; x < buf.width; x++) {
      if (!insideDiamond(x, y)) continue;
      const wx = ox + x;
      const wy = oy + y;
      for (let mi = 0; mi < mats.length; mi++) {
        const mat = mats[mi]!;
        const patch = fbm(wx, wy * 2, seed ^ (0xabcd1234 + mi * 0x1013), 0.045);
        // Soften the patch boundary with per-pixel noise so edges fray.
        const fray = (hash2D(wx, wy, seed ^ (0x2c1b3c6d + mi)) - 0.5) * 0.25;
        if (patch + fray < mat.coverage * 0.9) {
          const ramp = style.matRamps[mat.id]!;
          const v = hash2D(wx, wy, seed ^ (0x7f4a7c15 + mi));
          put(buf, x, y, ramp[v < 0.15 ? 0 : v < 0.6 ? 1 : v < 0.9 ? 2 : 3]!);
          break;
        }
      }
    }
  }
}

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
  return buf;
}
