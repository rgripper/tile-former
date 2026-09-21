// The v2 material generators: one periodic, lattice-space texture function per
// material, run ~24 times each at atlas-build time instead of once per pixel of
// every tile in the world.
//
// These are ports of v1's `substrate/index.ts` and `mats/index.ts` generators.
// The visual intent of each is unchanged — the dominant-centred base field, the
// crack networks, the tussock clumping, the litter stamps are all the same
// ideas with the same relative weights. What changed is the coordinate system,
// and with it four things:
//
//  1. **Periodic.** Every primitive is a `periodic*` one, so a variant tiles
//     with copies of itself invisibly (PLAN.md, "Hidden seams"). Frequencies are
//     therefore integer *cells per lattice unit*, not cycles per world pixel;
//     a non-integer would put the wrap boundary somewhere other than the tile
//     edge. Conversion used throughout: one lattice unit ≈ 72 native px, so
//     v1's `freq` f in cycles/px becomes `cells ≈ round(72 · f)`.
//
//  2. **No iso squash correction.** Lattice space is the undistorted ground
//     plane, so v1's hand-doubled y-frequencies (`fbm(wx, wy * 2, …)`) and
//     `spotField`'s explicit `* 2` are simply gone. Circles are circles; discs
//     and stamps come out iso-projected for free, which is what a thing lying
//     flat on the ground should do.
//
//  3. **`bias`, not `tileBias`.** Tone variation between cells is a threshold
//     shift applied to the base field *before* quantisation, so it changes the
//     mix of light and dark blocks. The uniform ramp-index shift v1 used is the
//     thing milestone L measured as making the tile grid obvious (PLAN.md,
//     "Decided"). Substrates and diffuse mats therefore add `c.bias` to their
//     base; stamp and spot generators, whose output is discrete features rather
//     than a quantised field, ignore it.
//
//  4. **`density`, not edge strength.** v1's `s` was a per-pixel distance to a
//     patch boundary, because coverage was continuous. Coverage is now quantised
//     to {none, sparse, full} and the *boundary is the mask's job* (masks.ts),
//     so a mat generator only needs to know how densely to fill the region it is
//     given. See PLAN.md, "One unified material stack, quantised coverage".
//
// Nothing here knows about tiles, dual cells, masks or the atlas. A generator is
// a pure function of (u, v) in the unit lattice square plus its context.

import type { MatId, Ramp, RenderMaterialId, SubstrateId } from "../types.ts";
import {
  periodicAnchors,
  periodicBlockHash,
  periodicCellEdge,
  periodicFbm,
  periodicSpot,
} from "../noise.ts";
import { DEFAULT_BLOCKS, quantizeLattice } from "../lattice.ts";
import { rampAt } from "../palette/index.ts";
import { resolveLatticeTone } from "../tone.ts";

export type MaterialCtx = {
  ramp: Ramp;
  // Variant seed. Shape variants differ only in this.
  seed: number;
  // Seed for any layer that carries long-range *structure* — currently only
  // sand's ripple phase. It is deliberately the same for every variant of a
  // material, which is the caveat noise.ts states outright: periodicity makes a
  // variant abut *itself* seamlessly, and for a statistically uniform texture
  // that is enough, but a field with direction and continuity (dune ripples,
  // strata) visibly breaks where two variants meet. Sharing the structural layer
  // and letting variants differ only in detail is the fix.
  //
  // Rock cracks and frost polygons deliberately do NOT use this: their networks
  // have no long-range direction, so a mismatch at a tile edge reads as one more
  // crack junction. Measured on a 9×9 tiled field — no grid visible.
  structureSeed: number;
  // Threshold bias in ramp-step units, applied to the base field before
  // quantisation. Keep well inside ±0.5 (one whole step) or a variant stops
  // being a re-mix of the same material and becomes a flat shift of it.
  bias: number;
  // Coverage density in [0,1] for the mats. Substrates ignore it (they are the
  // ground itself, not something lying on it).
  density: number;
  // Climate texturing scalars, exactly as v1: arid drives crack networks, wet
  // drives sheen highlights.
  arid: number;
  wet: number;
  // Authoring block grid, in blocks per lattice unit. This is v2's "brush size"
  // — the replacement for v1's `RenderStyle.grain`, now a property of the
  // authoring space rather than something applied to world pixels after the
  // fact. Must be an integer or the block grid stops wrapping.
  blocks: number;
};

// A material's color at (u, v), or null where it does not cover — mats leave
// holes for what is underneath, substrates never do.
export type MaterialGen = (u: number, v: number, c: MaterialCtx) => number | null;

// --- Material instances -------------------------------------------------------
//
// The atlas stores one set of variants per *instance*, not per material id: a
// map holds several biomes, and the same `grass` under two of them can carry
// different ramps (biome overrides, and the climate tint in resolve.ts). Two
// instances of one id are two independent entries in the draw stack, so the
// boundary between them gets dual-grid rounding like any other.
//
// The key therefore has to cover everything the generator reads — but only what
// it reads. Keying every material by `arid` and `wet` measured 22 -> 51
// instances on real maps, almost all of it spurious: only three generators look
// at them at all. `READS_ARID` / `READS_WET` declare which, and
// `materials.test.ts` asserts the declaration matches what the generators
// actually do, so it cannot drift into cache collisions.
export const READS_ARID: ReadonlySet<RenderMaterialId> = new Set<RenderMaterialId>(["soil", "clay"]);
export const READS_WET: ReadonlySet<RenderMaterialId> = new Set<RenderMaterialId>(["clay", "mud"]);

// One material as the atlas builds it: an id plus every generator input that is
// not a variant index.
export type MaterialInstance = {
  id: RenderMaterialId;
  key: string;
  ramp: Ramp;
  arid: number;
  wet: number;
};

const rampKey = (ramp: Ramp) => ramp.map((c) => c.toString(16).padStart(6, "0")).join("");

export function materialInstance(
  id: RenderMaterialId,
  ramp: Ramp,
  arid: number,
  wet: number,
): MaterialInstance {
  const a = READS_ARID.has(id) ? arid : 0;
  const w = READS_WET.has(id) ? wet : 0;
  return { id, key: `${id}|${rampKey(ramp)}|${a}|${w}`, ramp, arid: a, wet: w };
}

export function defaultCtx(ramp: Ramp, seed: number): MaterialCtx {
  return {
    ramp,
    seed,
    structureSeed: seed,
    bias: 0,
    density: 1,
    arid: 0,
    wet: 0,
    blocks: DEFAULT_BLOCKS,
  };
}

// --- Substrates ---------------------------------------------------------------
//
// Same contract as v1: the generator returns a *ramp position* in 0..3, centred
// on the material's dominant step with only low-amplitude, low-frequency wobble,
// so quantising it yields mostly the dominant tone with off-dominant pixels
// clustered into soft patches instead of speckle. Cracks subtract enough to
// reach step 0; sheen and sparkle push past 3. `resolveLatticeTone` clamps.

// Low-frequency structural field, the direct analogue of v1's `field` helper.
const field = (u: number, v: number, seed: number, cells: number) => periodicFbm(u, v, seed, cells);

export const SUBSTRATE_GENS: Record<SubstrateId, MaterialGen> = {
  bareRock(u, v, c) {
    // Diagonal strata around a mid-grey dominant; fracture lines drop to dark.
    // The shear `u + 2v` keeps integer coefficients, which is what preserves
    // periodicity — v1's 2.4 would have put the wrap in the wrong place.
    let base = 1.4 + (periodicFbm(u + 2 * v, v, c.seed, 3) - 0.5) * 1.1 + c.bias;
    if (periodicCellEdge(u, v, c.seed ^ 0x2545f491, 3) < 0.06) base -= 1.6;
    return resolveLatticeTone(base, u, v, c.ramp, c.seed, c.blocks);
  },

  scree(u, v, c) {
    // Faceted rubble: each clump carries one tone around a light dominant.
    // 12 blocks per lattice unit ≈ 6 native px per clump — twice v1's, because
    // at 3 px the facets read as grain rather than as rubble.
    const clump = periodicBlockHash(u, v, c.seed, 12);
    return resolveLatticeTone(1.7 + (clump - 0.5) * 1.3 + c.bias, u, v, c.ramp, c.seed, c.blocks);
  },

  sand(u, v, c) {
    // Wind ripples as gentle light/dark banding on a bright dominant. Authored
    // directly in lattice space rather than ported term-by-term: the band
    // wavevector has to be integer to wrap, and (1, 4) puts about four ripples
    // across a tile, which is the chunky read v2 wants where v1's ~2-px ripples
    // were sub-pixel shimmer once the tile was drawn small.
    //
    // The wavevector and most of the wandering phase are variant-independent, so
    // a whole sand field reads as one continuous set of dunes however its
    // variants are shuffled — this is the material the `structureSeed` note is
    // about. A shared phase alone is period-1, though, which makes every tile
    // carry an identical ripple motif; a smaller per-variant term breaks that
    // repetition, and because it only offsets the phase rather than changing the
    // wavevector it reads as ripples forking and stepping, not as a seam.
    const wander =
      periodicFbm(u, v, c.structureSeed ^ 0x71d4ea3, 2) * 1.4 +
      periodicFbm(u, v, c.seed ^ 0x2b3c4d5e, 2) * 0.5;
    const ripple = 0.5 + 0.5 * Math.sin(2 * Math.PI * (u + 4 * v + wander));
    return resolveLatticeTone(2.15 + (ripple - 0.5) * 1.15 + c.bias, u, v, c.ramp, c.seed, c.blocks);
  },

  soil(u, v, c) {
    let base = 1.3 + (field(u, v, c.seed, 4) - 0.5) * 1.1 + c.bias;
    if (c.arid > 0.4 && periodicCellEdge(u, v, c.seed ^ 0x3c6ef372, 4) < 0.05 * c.arid) base -= 1.6;
    return resolveLatticeTone(base, u, v, c.ramp, c.seed, c.blocks);
  },

  clay(u, v, c) {
    let base = 1.4 + (field(u, v, c.seed, 3) - 0.5) * 1.0 + c.bias;
    if (c.arid > 0.15 && periodicCellEdge(u, v, c.seed ^ 0xbf58476d, 6) < 0.1 * c.arid) base -= 1.9;
    // Sheen glint. Not biased: it is a specular hit, not part of the tonal mix.
    if (c.wet > 0.3 && periodicBlockHash(u, v, c.seed ^ 0x94d049bb, c.blocks) > 1 - 0.05 * c.wet) {
      base = 3.6;
    }
    return resolveLatticeTone(base, u, v, c.ramp, c.seed, c.blocks);
  },

  mud(u, v, c) {
    let base = 1.35 + (field(u, v, c.seed, 4) - 0.5) * 1.4 + c.bias;
    if (periodicBlockHash(u, v, c.seed ^ 0xd6e8feb8, c.blocks) > 1 - 0.06 * Math.max(c.wet, 0.4)) {
      base = 3.6;
    }
    return resolveLatticeTone(base, u, v, c.ramp, c.seed, c.blocks);
  },

  peat(u, v, c) {
    // Fibrous streaks around a dark dominant: wide in u, fine in v — the one
    // place an anisotropic block grid is wanted rather than an artifact.
    const streak = periodicBlockHash(u, v, c.seed, 16, 32);
    const base = field(u, v, c.seed ^ 0x5851f42d, 5);
    return resolveLatticeTone(
      1.35 + (base * 0.5 + streak * 0.5 - 0.5) * 1.6 + c.bias,
      u,
      v,
      c.ramp,
      c.seed,
      c.blocks,
    );
  },

  frozenGround(u, v, c) {
    let base = 1.9 + (field(u, v, c.seed, 4) - 0.5) * 1.0 + c.bias;
    const edge = periodicCellEdge(u, v, c.seed ^ 0x85ebca6b, 4);
    if (edge < 0.08) base -= 1.6;
    else if (edge < 0.16) base -= 0.7;
    return resolveLatticeTone(base, u, v, c.ramp, c.seed, c.blocks);
  },

  water(u, v, c) {
    // Open water: a calm body with soft, broken wavelets and the occasional
    // glint where light catches a crest.
    //
    // The body is fBm and the ripple only modulates it. The first version drove
    // the tone from the sine alone, and a sine is arcsine-distributed — it
    // spends most of its time at the extremes — so every tile split into bold
    // light/dark stripes that read as corrugated metal, not water. fBm
    // concentrates around its mean, which keeps the dominant step dominant and
    // breaks the wavelets into irregular dashes.
    //
    // Wavelets carry long-range direction, so the wavevector and phase ride on
    // `structureSeed` for the reason sand's ripples do: a whole lake reads as
    // one surface however its variants are shuffled (MaterialCtx.structureSeed).
    const drift = periodicFbm(u, v, c.structureSeed ^ 0x5bd1e995, 2) * 1.2;
    const ripple = Math.sin(2 * Math.PI * (2 * u + 3 * v + drift));
    const body = periodicFbm(u, v, c.seed ^ 0x3f1a7c29, 4);
    // The glint is gated on the crest, not scattered freely: an ungated sparkle
    // reads as snow on the water. Not biased, for the same reason clay's and
    // mud's sheen is not — it is a specular hit, not part of the tonal mix.
    if (ripple > 0.8 && periodicBlockHash(u, v, c.seed ^ 0x9e3779b1, c.blocks) > 0.88) {
      return resolveLatticeTone(3.4, u, v, c.ramp, c.seed, c.blocks);
    }
    return resolveLatticeTone(
      1.25 + (body - 0.5) * 1.2 + ripple * 0.38 + c.bias,
      u,
      v,
      c.ramp,
      c.seed,
      c.blocks,
    );
  },

  snow(u, v, c) {
    if (periodicBlockHash(u, v, c.seed ^ 0xcc9e2d51, c.blocks) > 0.985) {
      return resolveLatticeTone(3.6, u, v, c.ramp, c.seed, c.blocks);
    }
    return resolveLatticeTone(
      2.6 + (field(u, v, c.seed, 3) - 0.5) * 1.0 + c.bias,
      u,
      v,
      c.ramp,
      c.seed,
      c.blocks,
    );
  },
};

// --- Mats ----------------------------------------------------------------------
//
// A mat covers the region its mask gives it, but not solidly: every generator
// leaves holes so the substrate below shows through, which is what stops a
// high-coverage cell reading as one flat green. v1 had *three* stacked hole
// mechanisms (per-pixel misses, a low-frequency patch macro-shape, and per-mat
// structural gates) and spent two rounds of fixes on the interaction between
// them at the tile rim. Two of the three are gone here: the patch macro-shape is
// now the mask, and there is no rim to hold anything off. What is left is the
// generator's own texture, scaled by `density`.

// fBm concentrates around 0.5, so gating on it raw saturates both ends of the
// fill range: measured, `turf` at fill 0.92 painted **100%** of the cell and at
// 0.78 painted 98% — grass and dryGrass at `full` density left no holes at all,
// against the stated intent right above. Stretching the field about its midpoint
// by this much makes the CDF very nearly the identity (0.3 -> 30%, 0.5 -> 50%,
// 0.92 -> 88%), so `fill` reads as "fraction of the cell painted" and the
// density levels mean what they say. Same fix, and coincidentally the same
// constant, as masks.ts's SPILL_CONTRAST.
const TURF_CONTRAST = 2.4;

// Turf fill shared by the grassy mats. The show-through is a low-frequency mask,
// not per-pixel, so bare ground forms small worn patches rather than brown
// speckle. Tonal life comes from the accent in `resolveLatticeTone`.
function turf(u: number, v: number, c: MaterialCtx, fill: number, densityScale = 1): number | null {
  const cover = fill * c.density * densityScale;
  const n = periodicFbm(u, v, c.seed ^ 0x1f123bb5, 12);
  if ((n - 0.5) * TURF_CONTRAST + 0.5 > cover) return null;
  const blade = periodicBlockHash(u, v, c.seed ^ 0x51ed270b, c.blocks);
  return resolveLatticeTone(
    1.85 + (blade - 0.5) * 1.05 + c.bias,
    u,
    v,
    c.ramp,
    c.seed,
    c.blocks,
  );
}

// --- Litter stamps ---
//
// A stamp is a small fixed shape placed at a jittered anchor. Its shape is
// defined on the *block* grid, not on native pixels: at the default 32 blocks
// per lattice unit one block is about 2 native px, so a "2×1 block" leaf is a
// 4×2 px chunk — deliberately chunkier than v1's 2×1 native px, and, because
// blocks are lattice-space squares, iso-projected on screen the way something
// lying on the ground should be.
//
// Offsets reach the stamp function as integer block deltas from the anchor. That
// works because the sample coordinate is block-quantised before the anchor scan:
// `du · blocksPerCell` is then (integer block index − a constant per anchor), and
// rounding is shift-equivariant for integer shifts, so every sample block of one
// stamp agrees on the same integer grid.
type BlockStamp = (du: number, dv: number, h: number, ramp: Ramp) => number | null;

// Litter leaf: a 2×1 body with an offset tip block, shaded per leaf.
const leafStamp: BlockStamp = (du, dv, h, ramp) => {
  if (dv === 0 && (du === 0 || du === 1)) return rampAt(ramp, 0.25 + h * 0.55 + du * 0.1);
  if (dv === -1 && du === (h < 0.5 ? 0 : 1)) return rampAt(ramp, 0.6 + h * 0.3);
  return null;
};

// Fallen needle: a 3-block dash at a ±1:2 slope (an iso-friendly diagonal),
// 2 blocks thick so it reads as a stroke rather than a hairline. One block
// shorter than v1's, because a stamp has to stay inside one anchor cell for the
// 3×3 scan to find it from every pixel it covers, and at 8 cells per lattice
// unit a cell is 4 blocks across. It still lands at a slightly higher coverage
// fraction than v1's (~32% vs ~28% at full density) since each block is bigger.
const needleStamp: BlockStamp = (du, dv, h, ramp) => {
  if (du < 0 || du > 2) return null;
  const dir = h < 0.5 ? 1 : -1;
  const v0 = Math.round(du * 0.5) * dir;
  if (dv !== v0 && dv !== v0 + dir) return null;
  return rampAt(ramp, 0.2 + h * 0.45);
};

// `cells` must divide `blocks` so that blocks-per-cell is an integer and stamp
// shapes land on the block grid identically in every cell.
function stampAt(
  u: number,
  v: number,
  c: MaterialCtx,
  seedMix: number,
  cells: number,
  prob: number,
  stamp: BlockStamp,
): number | null {
  const bpc = c.blocks / cells;
  const bu = quantizeLattice(u, c.blocks);
  const bv = quantizeLattice(v, c.blocks);
  for (const a of periodicAnchors(bu, bv, c.seed ^ seedMix, cells, prob)) {
    const col = stamp(Math.round(a.du * bpc), Math.round(a.dv * bpc), a.h, c.ramp);
    if (col !== null) return col;
  }
  return null;
}

export const MAT_GENS: Record<MatId, MaterialGen> = {
  grass: (u, v, c) => turf(u, v, c, 0.92),

  dryGrass: (u, v, c) => turf(u, v, c, 0.78),

  sedge(u, v, c) {
    // Tussocks: only clumped cells grow, denser toward each clump's own value.
    // A *field*, not a block hash: v1 gated on `hash2D(floor(wx/6), floor(wy/3))`,
    // and porting that literally put a hard threshold on an axis-aligned grid in
    // lattice space, so the tussocks came out as a visible lattice of rhombi
    // rather than as clumps.
    const clump = periodicFbm(u, v, c.seed ^ 0x94d049bb, 5);
    if (clump < 0.45) return null;
    return turf(u, v, c, 0.95, 0.4 + 0.6 * clump);
  },

  moss(u, v, c) {
    // Dense soft carpet, low-contrast mottle.
    if (periodicBlockHash(u, v, c.seed ^ 0x7feb352d, c.blocks) > 0.97 * c.density) return null;
    const mottle = periodicFbm(u, v, c.seed ^ 0x2c1b3c6d, 8);
    return resolveLatticeTone(
      1.4 + (mottle - 0.5) * 1.1 + c.bias,
      u,
      v,
      c.ramp,
      c.seed,
      c.blocks,
    );
  },

  lichen(u, v, c) {
    // Crusty discs: pale speckled interior, darker rim. Radius is in cells, so
    // 0.36 of a cell reproduces v1's 3.2 px disc in a 9 px cell.
    const spot = periodicSpot(u, v, c.seed ^ 0xb5297a4d, 8, 0.85 * c.density, 0.36);
    if (spot === null) return null;
    const grain = periodicBlockHash(u, v, c.seed ^ 0x68e31da4, c.blocks);
    if (spot.d > 0.75) return rampAt(c.ramp, 0.1 + grain * 0.15);
    return rampAt(c.ramp, 0.45 + spot.h * 0.3 + grain * 0.25 - spot.d * 0.2);
  },

  leafLitter: (u, v, c) => stampAt(u, v, c, 0x3ad8025f, 8, 0.9 * c.density, leafStamp),

  needleLitter: (u, v, c) => stampAt(u, v, c, 0xe6546b64, 8, 0.85 * c.density, needleStamp),

  cushion(u, v, c) {
    // Dome mats: lit from above, darkening down the flanks to the rim.
    const spot = periodicSpot(u, v, c.seed ^ 0x27d4eb2f, 6, 0.8 * c.density, 0.4);
    if (spot === null) return null;
    const grain = periodicBlockHash(u, v, c.seed ^ 0x165667b1, c.blocks);
    const ndv = spot.dv / 0.4;
    return rampAt(c.ramp, 0.7 - spot.d * 0.35 - ndv * 0.2 + grain * 0.15);
  },
};

export const MATERIAL_GENS: Record<SubstrateId | MatId, MaterialGen> = {
  ...SUBSTRATE_GENS,
  ...MAT_GENS,
};

