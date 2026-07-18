// Static scatter stage (M3): pebbles, twigs, and stray fallen leaves stamped
// into the baked floor on top of substrate + mats. Placement is a world
// lattice (see stamps.ts) so scatter crossing a tile border is painted
// identically by both tiles. Animated scatter (ferns/reeds/flowers) is M4 and
// lives in separate overlay sprites, not here.
//
// Unlike the substrate/mat stages this stage iterates *features*, not pixels:
// scatter is sparse, so walking the lattice cells that overlap the tile and
// stamping each hit directly is far cheaper than querying a 3×3 cell
// neighborhood per pixel. Per-pixel priority (pebble over twig over leaf, and
// lattice scan order within a type) is preserved by painting types in priority
// order, cells in (cy, cx) order, and never overwriting a claimed pixel.

import type { Ramp, StyleParams } from "../types.ts";
import { hash2D } from "../rng.ts";
import { rampAt } from "../palette/index.ts";
import { insideDiamond, put, type PixelBuffer } from "../pixels.ts";
import { leafStamp } from "../mats/index.ts";
import type { StampFn } from "../stamps.ts";

// Pebble: 3×2 rounded blob (corners clipped), lit top row, darker flanks.
// Small pebbles (h < 0.4) drop the second row.
function pebbleStamp(dx: number, dy: number, h: number, ramp: Ramp): number | null {
  if (dx < 0 || dx > 2) return null;
  if (dy === 0) return rampAt(ramp, 0.55 + h * 0.35 - (dx === 1 ? 0 : 0.15));
  if (dy === 1 && h >= 0.4 && dx === 1) return rampAt(ramp, 0.15 + h * 0.2);
  return null;
}

// Twig: 4–6px near-horizontal line with a 1px kink past the midpoint, 2px
// thick so it reads as a chunky stroke rather than a single-pixel-width string.
function twigStamp(dx: number, dy: number, h: number, ramp: Ramp): number | null {
  const len = 3 + Math.floor(h * 3);
  if (dx < 0 || dx > len) return null;
  const bend = h < 0.5 ? 1 : -1;
  const y0 = dx > len / 2 ? bend : 0;
  if (dy !== y0 && dy !== y0 + bend) return null;
  return rampAt(ramp, 0.1 + h * 0.35);
}

// Pixel bounding box of each stamp fn relative to its anchor (inclusive), so
// the stamping loop only visits pixels a stamp can actually cover.
type ScatterKind = {
  stamp: StampFn;
  cellW: number;
  cellH: number;
  seedX: number;
  dx0: number;
  dx1: number;
  dy0: number;
  dy1: number;
};
const PEBBLE: ScatterKind = { stamp: pebbleStamp, cellW: 11, cellH: 6, seedX: 0x9368b53d, dx0: 0, dx1: 2, dy0: 0, dy1: 1 };
const TWIG: ScatterKind = { stamp: twigStamp, cellW: 13, cellH: 7, seedX: 0x02e5be93, dx0: 0, dx1: 6, dy0: -2, dy1: 2 };
const LEAF: ScatterKind = { stamp: leafStamp, cellW: 9, cellH: 5, seedX: 0x6a09e667, dx0: 0, dx1: 1, dy0: -1, dy1: 0 };

// Reused claim mask: 1 where an earlier (higher-priority) feature already
// painted, so later types/features can't overwrite — same winner as the old
// per-pixel 3×3 query. Sized lazily to the largest buffer seen.
let claimed = new Uint8Array(0);

function stampKind(
  buf: PixelBuffer,
  kind: ScatterKind,
  ox: number,
  oy: number,
  seed: number,
  prob: number,
  ramp: Ramp,
): void {
  const { stamp, cellW, cellH, dx0, dx1, dy0, dy1 } = kind;
  const s = seed ^ kind.seedX;
  // Lattice cells whose jittered anchor could paint any pixel of this tile.
  const gx0 = Math.floor((ox - dx1) / cellW) - 1;
  const gx1 = Math.floor((ox + buf.width - 1 - dx0) / cellW);
  const gy0 = Math.floor((oy - dy1) / cellH) - 1;
  const gy1 = Math.floor((oy + buf.height - 1 - dy0) / cellH);
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      if (hash2D(gx, gy, s) >= prob) continue;
      const ax = Math.floor((gx + hash2D(gx, gy, s ^ 0x517cc1b7)) * cellW);
      const ay = Math.floor((gy + hash2D(gx, gy, s ^ 0x85ebca6b)) * cellH);
      const h = hash2D(gx, gy, s ^ 0xcc9e2d51);
      for (let dy = dy0; dy <= dy1; dy++) {
        const y = ay + dy - oy;
        if (y < 0 || y >= buf.height) continue;
        for (let dx = dx0; dx <= dx1; dx++) {
          const x = ax + dx - ox;
          if (x < 0 || x >= buf.width || !insideDiamond(x, y)) continue;
          const o = y * buf.width + x;
          if (claimed[o]) continue;
          const c = stamp(dx, dy, h, ramp);
          if (c !== null) {
            put(buf, x, y, c);
            claimed[o] = 1;
          }
        }
      }
    }
  }
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

  const size = buf.width * buf.height;
  if (claimed.length < size) claimed = new Uint8Array(size);
  else claimed.fill(0, 0, size);

  if (doPebble) stampKind(buf, PEBBLE, ox, oy, seed, pebble * 0.5, ramps.pebble);
  if (doTwig) stampKind(buf, TWIG, ox, oy, seed, twig * 0.45, ramps.twig);
  if (doLeaf) stampKind(buf, LEAF, ox, oy, seed, leaf * 0.4, ramps.leaf);
}
