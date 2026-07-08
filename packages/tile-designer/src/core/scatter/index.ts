// Static scatter stage (M3): pebbles, twigs, and stray fallen leaves stamped
// into the baked floor on top of substrate + mats. Placement is a world
// lattice (see stamps.ts) so scatter crossing a tile border is painted
// identically by both tiles. Animated scatter (ferns/reeds/flowers) is M4 and
// lives in separate overlay sprites, not here.

import type { Ramp, StyleParams } from "../types.ts";
import { rampAt } from "../palette/index.ts";
import { insideDiamond, put, type PixelBuffer } from "../pixels.ts";
import { stampField } from "../stamps.ts";
import { leafStamp } from "../mats/index.ts";

// Pebble: 3×2 rounded blob (corners clipped), lit top row, darker flanks.
// Small pebbles (h < 0.4) drop the second row.
function pebbleStamp(dx: number, dy: number, h: number, ramp: Ramp): number | null {
  if (dx < 0 || dx > 2) return null;
  if (dy === 0) return rampAt(ramp, 0.55 + h * 0.35 - (dx === 1 ? 0 : 0.15));
  if (dy === 1 && h >= 0.4 && dx === 1) return rampAt(ramp, 0.15 + h * 0.2);
  return null;
}

// Twig: 4–6px near-horizontal line with a 1px kink past the midpoint.
function twigStamp(dx: number, dy: number, h: number, ramp: Ramp): number | null {
  const len = 3 + Math.floor(h * 3);
  if (dx < 0 || dx > len) return null;
  const bend = h < 0.5 ? 1 : -1;
  if (dy !== (dx > len / 2 ? bend : 0)) return null;
  return rampAt(ramp, 0.1 + h * 0.35);
}

export function paintStaticScatter(
  buf: PixelBuffer,
  style: StyleParams,
  ox: number,
  oy: number,
  seed: number,
): void {
  const { pebble, twig, leaf } = style.staticScatter;
  const ramps = style.scatterRamps;
  const doPebble = pebble > 0.02;
  const doTwig = twig > 0.02;
  const doLeaf = leaf > 0.02;
  if (!doPebble && !doTwig && !doLeaf) return;

  for (let y = 0; y < buf.height; y++) {
    for (let x = 0; x < buf.width; x++) {
      if (!insideDiamond(x, y)) continue;
      const wx = ox + x;
      const wy = oy + y;
      let c: number | null = null;
      if (doPebble) c = stampField(wx, wy, seed ^ 0x9368b53d, 11, 6, pebble * 0.5, pebbleStamp, ramps.pebble);
      if (c === null && doTwig) c = stampField(wx, wy, seed ^ 0x02e5be93, 13, 7, twig * 0.45, twigStamp, ramps.twig);
      if (c === null && doLeaf) c = stampField(wx, wy, seed ^ 0x6a09e667, 9, 5, leaf * 0.4, leafStamp, ramps.leaf);
      if (c !== null) put(buf, x, y, c);
    }
  }
}
