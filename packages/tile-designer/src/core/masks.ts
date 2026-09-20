// The procedural corner-mask set: 16 alpha masks over one dual-grid cell.
//
// --- What a dual cell is, and which tile each corner is ---
//
// PLAN.md ("Dual-grid geometry on the iso lattice") derives that the dual
// lattice is the tile lattice shifted straight down by TILE_H/2. Dual cell
// (c, r) is therefore congruent to the tile diamond, and its four *corners* are
// the centres of tiles (c, r), (c+1, r), (c, r+1), (c+1, r+1) — which is the
// whole point: a material boundary passes through the cell's interior, never
// along its edge.
//
// In lattice space (lattice.ts: the diamond is the unit square, u along +col and
// v along +row) those corners land at exactly the unit square's corners:
//
//     (u,v) = (0,0) → tile (c,   r)     screen: top corner
//     (u,v) = (1,0) → tile (c+1, r)     screen: right corner
//     (u,v) = (0,1) → tile (c,   r+1)   screen: left corner
//     (u,v) = (1,1) → tile (c+1, r+1)   screen: bottom corner
//
// So a corner's index is `(v ? 2 : 0) | (u ? 1 : 0)` and a **code** is the 4-bit
// set of corners that belong to the material being drawn. 16 codes, one mask
// each — 16 per material, not 16 per pair (PLAN.md, "Scaling dual-grid past two
// materials"), and closed under intersection, which is what makes the altitude
// gate a bitwise AND rather than new machinery.
//
// --- The nominal region ---
//
// Corner q nominally owns its quadrant of the cell. Union those over the code
// and you get a region whose boundary runs along the mid-lines u = 0.5 and
// v = 0.5 — and only along the *segments* of them that separate a member corner
// from a non-member one. Unioned over the four dual cells that meet at a tile
// centre, those quadrants reconstruct exactly that tile's diamond, so "nominal"
// means "the material's own tile footprint", drawn one quarter at a time.
//
// A cell edge is never a nominal boundary: the region continues into the
// neighbouring cell there. `nominalSigned` measures distance only to the
// separating mid-line segments, which is what makes the field agree across cell
// edges (see the continuity argument below).
//
// --- The overhang-only rule ---
//
// PLAN.md: "A mask's alpha must fully cover its nominal corner half-space and
// may spill a few px outward, never recede inward." Here that is one clamp:
// `if (signed >= 0) return true`, before the spill is even consulted. It buys
// two things. The lowest-priority material at a cell always has code 15 (every
// corner is "itself or higher"), so it draws the full cell and nothing can peek
// through from below; and at a cliff the upper lip always overlaps the face
// rather than exposing a gap.
//
// Because higher-priority materials are drawn *last*, the visible boundary is
// always the higher material's spilled edge. That means the spill can be
// generous — a fat organic overhang, not a couple of pixels — as long as it
// stays well under 0.5 lattice units, past which a material would start covering
// a tile centre that is not its own.
//
// --- How the spill stays continuous across cell edges ---
//
// Two adjacent dual cells share an edge, and the two tiles at that edge's
// endpoints are corners of *both* cells (cell (c,r)'s corners 0,1 are cell
// (c,r−1)'s corners 2,3). So the nominal field agrees across the edge by
// construction. The spill does not: neighbouring cells generally draw different
// mask variants, and a boundary crossing the shared edge would jog by the full
// spill amplitude where the two variants' noise disagrees.
//
// The obvious fix — taper the spill to zero on the cell boundary — works, but it
// pins every boundary crossing to the exact nominal midpoint, so a long boundary
// pinches to a waist once per tile. Instead the spill field is a **blend of a
// shared field and a variant-specific one**: variant-specific in the cell
// interior, fading to a single variant-independent field at the cell edge. The
// shared field is itself period-1, so its values on the two sides of an edge are
// neighbouring samples of one smooth function.
//
// The property that actually decides whether a seam is visible is therefore not
// exact equality (which block quantisation makes unachievable anyway — the two
// sides of an edge are genuinely different authoring blocks) but that **the jump
// across the edge is no larger than jumps that already occur block-to-block
// inside a cell**. That is the same contract lattice.test.ts holds the periodic
// primitives to, and masks.test.ts measures it the same way.

import { periodicBlockHash, periodicFbm, smoothstep } from "./noise.ts";
import { DEFAULT_BLOCKS, latticeAt, quantizeLattice } from "./lattice.ts";
import { hidePixelData, rowSpan } from "./pixels.ts";
import { TILE_H, TILE_W } from "./types.ts";

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const MASK_CODES = 16;
export const CODE_FULL = 15;
export const CODE_EMPTY = 0;

// Corner index → (du, dv) tile offset from the dual cell's index, in the order
// documented above. Exported so the compositor (milestone D) builds codes from
// the same table this file measures against.
export const CORNER_TILE_OFFSETS: ReadonlyArray<readonly [du: 0 | 1, dv: 0 | 1]> = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

export function cornerIndex(du: 0 | 1, dv: 0 | 1): number {
  return (dv << 1) | du;
}

// --- Tuning -----------------------------------------------------------------

// Maximum outward spill, in lattice units (1 unit ≈ 72 native px, ≈ 36 on
// screen). Must stay well below 0.5: at 0.5 a material would reach a
// neighbouring tile's centre and read as occupying a tile it does not own.
export const SPILL_AMP = 0.2;
// Floor on the spill as a fraction of SPILL_AMP. Without it the noise
// occasionally lands near zero and the boundary snaps flat onto the nominal
// mid-line for a stretch — a straight vector edge, which is exactly the read
// v1's fray fixes were about (PLAN.md, "hard-edged isolated patches").
const SPILL_FLOOR = 0.15;
// Noise cells per lattice unit for the spill field. Low enough that the
// boundary wanders in long lobes rather than fizzing.
const SPILL_CELLS = 4;
// fBm concentrates around 0.5, and a spill that only varies over the middle
// third of its range reads as a *constant-width ribbon* laid along a straight
// nominal line — measured on the first build of this file, where the two mask
// variants of a code were also near-indistinguishable for the same reason. The
// field is stretched about its midpoint so the boundary actually wanders.
const SPILL_CONTRAST = 2.4;
// Distance from the cell edge over which the variant-specific spill field takes
// over from the shared one.
const EDGE_BLEND = 0.14;
// Outermost slice of the spill (lattice units) that is dithered rather than
// solid, so the overhang ends in organic speckle instead of a clean arc. Same
// technique and the same reason as v1's FRAY_BAND, one abstraction level up.
const FRAY_BAND = 0.05;

// --- Nominal geometry --------------------------------------------------------

// Squared distance from (px, py) to the segment (ax, ay)–(bx, by).
function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const t = Math.min(1, Math.max(0, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
  const dx = wx - t * vx;
  const dy = wy - t * vy;
  return dx * dx + dy * dy;
}

// True when (u, v) is in a quadrant this code owns.
export function nominalInside(code: number, u: number, v: number): boolean {
  const q = (v < 0.5 ? 0 : 2) | (u < 0.5 ? 0 : 1);
  return ((code >> q) & 1) === 1;
}

// Signed distance to the nominal boundary in lattice units: positive inside the
// code's quadrant union, negative outside, ±Infinity for the two degenerate
// codes (15 has no boundary and is everywhere inside; 0 has none and is
// everywhere outside).
//
// Only mid-line segments that actually *separate* a member corner from a
// non-member one count. The cell's own edges never do — the region continues
// past them into the neighbouring cell.
export function nominalSigned(code: number, u: number, v: number): number {
  const m0 = code & 1;
  const m1 = (code >> 1) & 1;
  const m2 = (code >> 2) & 1;
  const m3 = (code >> 3) & 1;
  let d2 = Infinity;
  // u = 0.5 between corners 0|1 (upper half) and 2|3 (lower half).
  if (m0 !== m1) d2 = Math.min(d2, segDist2(u, v, 0.5, 0, 0.5, 0.5));
  if (m2 !== m3) d2 = Math.min(d2, segDist2(u, v, 0.5, 0.5, 0.5, 1));
  // v = 0.5 between corners 0|2 (left half) and 1|3 (right half).
  if (m0 !== m2) d2 = Math.min(d2, segDist2(u, v, 0, 0.5, 0.5, 0.5));
  if (m1 !== m3) d2 = Math.min(d2, segDist2(u, v, 0.5, 0.5, 1, 0.5));
  const d = d2 === Infinity ? Infinity : Math.sqrt(d2);
  return nominalInside(code, u, v) ? d : -d;
}

// --- The mask itself ---------------------------------------------------------

// Covered? Binary — this is pixel art, so there is no alpha ramp; the organic
// read comes from the shape of the cut, never from feathering it.
//
// `variant` selects one of a material-independent family of spill fields. Masks
// do not depend on the material, so the whole set is built once and reused by
// every material in the atlas.
export function maskAt(
  code: number,
  variant: number,
  u: number,
  v: number,
  seed: number,
  blocks: number = DEFAULT_BLOCKS,
): boolean {
  if (code === CODE_FULL) return true;
  if (code === CODE_EMPTY) return false;
  const signed = nominalSigned(code, u, v);
  // The overhang-only clamp. Everything below can only *add* coverage.
  if (signed >= 0) return true;
  if (signed < -SPILL_AMP) return false; // out of reach; skip the noise
  // The spill field and the fray dither are sampled on the authoring block grid
  // so the overhang reads as chunky steps at the same scale as the material
  // textures it sits against, rather than as a smooth curve stair-stepped by
  // the rasteriser.
  const bu = quantizeLattice(u, blocks);
  const bv = quantizeLattice(v, blocks);
  // `blend` is evaluated on the exact coordinate, so how far a sample is from
  // the cell edge does not itself depend on the block grid.
  const blend = smoothstep(0, EDGE_BLEND, Math.min(u, 1 - u, v, 1 - v));
  const shared = periodicFbm(bu, bv, seed, SPILL_CELLS);
  const own = periodicFbm(bu, bv, seed ^ ((variant + 1) * 0x9e3779b9), SPILL_CELLS);
  const n = clamp01((shared + blend * (own - shared) - 0.5) * SPILL_CONTRAST + 0.5);
  const spill = SPILL_AMP * (SPILL_FLOOR + (1 - SPILL_FLOOR) * n);
  const over = spill + signed;
  if (over <= 0) return false;
  if (over >= FRAY_BAND) return true;
  return periodicBlockHash(bu, bv, seed ^ 0x5bd1e995 ^ (variant << 8), blocks) < over / FRAY_BAND;
}

// --- Rasterisation -----------------------------------------------------------

// One mask as a TILE_W×TILE_H coverage bitmap (0 or 255), diamond-clipped.
export type MaskBitmap = {
  code: number;
  variant: number;
  data: Uint8Array; // length TILE_W * TILE_H
};

export function renderMask(
  code: number,
  variant: number,
  seed: number,
  blocks: number = DEFAULT_BLOCKS,
): MaskBitmap {
  const data = new Uint8Array(TILE_W * TILE_H);
  if (code !== CODE_EMPTY) {
    for (let y = 0; y < TILE_H; y++) {
      const [x0, x1] = rowSpan(y);
      for (let x = x0; x <= x1; x++) {
        const [u, v] = latticeAt(x, y);
        if (maskAt(code, variant, u, v, seed, blocks)) data[y * TILE_W + x] = 255;
      }
    }
  }
  return hidePixelData({ code, variant, data });
}

// The full material-independent mask set: `variants` spill fields for each of
// the 16 codes. Code 0 is kept in the array (as an empty bitmap) purely so the
// index is the code — the atlas skips it.
export function buildMaskSet(seed: number, variants: number, blocks: number = DEFAULT_BLOCKS): MaskBitmap[][] {
  const out: MaskBitmap[][] = [];
  for (let code = 0; code < MASK_CODES; code++) {
    const row: MaskBitmap[] = [];
    // Codes 0 and 15 have no boundary, so extra spill variants of them would be
    // byte-identical. One entry each; callers index with `variant % row.length`.
    const n = code === CODE_EMPTY || code === CODE_FULL ? 1 : variants;
    for (let variant = 0; variant < n; variant++) {
      row.push(renderMask(code, variant, seed, blocks));
    }
    out.push(row);
  }
  return out;
}

// --- Hard nominal footprints (the level clip) ---------------------------------

// The same 16 regions with the spill switched off: `nominalInside` rasterised
// flat, diamond-clipped. These are not drawn — they are used as an *outer clip*
// where a dual cell straddles two floor levels (compose.ts, "spill runs
// downhill, never uphill").
//
// Why the spill has to stop at a level boundary: two levels of one cell are
// drawn at y offsets CLIFF_UNIT apart, with the upper tile's cliff face
// standing in the gap. A mask boundary that separates two *materials* has
// nothing behind it, so an organic overhang is free; one that separates two
// *levels* has a wall behind it, and the lower level's overhang lands on that
// wall — floor texture painted a few pixels up the cliff, in wandering chunks.
// With SPILL_AMP = 0.2 that is ±0.2·TILE_H/2 ≈ 3 px of a 12 px face eaten from
// below, which is what made cliff colour read as offset from the ground above
// it. Clipped, the lower level stops dead at its nominal edge — and that edge
// is exactly where the cliff face's foot already is, so nothing organic is
// lost: the straight line was always going to be there, drawn by the wall.
//
// Material-independent, seed-independent and variant-independent, so all 16 are
// built once on first use.
const nominalMasks: Array<Uint8Array | undefined> = new Array(MASK_CODES);

export function nominalMask(code: number): Uint8Array {
  let mask = nominalMasks[code];
  if (mask === undefined) {
    mask = new Uint8Array(TILE_W * TILE_H);
    if (code !== CODE_EMPTY) {
      for (let y = 0; y < TILE_H; y++) {
        const [x0, x1] = rowSpan(y);
        for (let x = x0; x <= x1; x++) {
          const [u, v] = latticeAt(x, y);
          if (code === CODE_FULL || nominalInside(code, u, v)) mask[y * TILE_W + x] = 255;
        }
      }
    }
    nominalMasks[code] = mask;
  }
  return mask;
}
