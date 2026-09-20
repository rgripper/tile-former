// Milestone F: the feature overhang layer — pebbles, twigs and stray leaves
// as discrete decoration sprites allowed past the diamond.
//
// --- Why these are sprites, not coverage ---
//
// Everything else in the atlas is ground: a periodic texture cut by a corner
// mask, clipped to the diamond by construction. Scatter is the opposite kind
// of thing — a small *object* lying on the ground — and v1 already treated it
// that way (stamped per-pixel by `scatter/index.ts`). v2 keeps the object read
// but moves it to the atlas: a handful of pre-baked sprites per scatter kind,
// placed per tile instead of baked into every tile's pixels.
//
// --- The overhang ---
//
// Because a feature is an object rather than ground, it is NOT clipped to the
// diamond: `renderFeature` rasterises the whole TILE_W×TILE_H cell rect, so a
// pebble near a tile corner legitimately spills a few pixels past the diamond
// edge onto the neighbouring tile's rect. That is the "overhang-only mask
// rule" inverted for features — masks may never recede inward but may spill;
// features simply live outside the mask system entirely. The renderer draws
// them after the floor of their own tile (see terrain.ts's depth note), so the
// spill lands on top of already-painted ground and no gap can open.
//
// --- Authoring space ---
//
// Stamps are defined on the same authoring block grid as the litter mats
// (materials/index.ts, `BlockStamp`): integer block deltas from a jittered
// anchor, sampled through `latticeAt`, so shapes come out iso-projected for
// free and chunky at the same scale as the rest of the texture. Unlike the
// ground generators there is NO periodicity requirement — a feature is a
// self-contained object, and two copies of the same sprite abutting is exactly
// as invisible as any repeated prop.

import type { Density, MatId, Ramp, ScatterId, SubstrateId } from "../types.ts";
import { SCATTER_IDS, TILE_H, TILE_W } from "../types.ts";
import { hash2D } from "../rng.ts";
import { DEFAULT_BLOCKS, latticeAt } from "../lattice.ts";
import { rampAt } from "../palette/index.ts";
import type { PixelBuffer } from "../pixels.ts";

export { SCATTER_IDS };

// How many sprite variants per scatter kind. Far fewer than the ground
// materials' 8: features are sparse and isolated, so repetition never reads as
// a lattice the way a tiled ground texture does.
export const FEATURE_SHAPES = 4;

// --- Host-material compatibility -----------------------------------------------
//
// A scatter kind is only placed on tiles whose surface carries a compatible
// host material — the physical read of what can bear what. Exposed stones need
// thin stony ground; deadfall needs somewhere for it to have fallen from.
// Checked against the tile's substrate winner AND its mats (a leaf can land on
// grass), which is what "host-material compatibility" means operationally.
export const FEATURE_HOSTS: Record<ScatterId, ReadonlySet<SubstrateId | MatId>> = {
  pebble: new Set<SubstrateId | MatId>(["bareRock", "scree", "sand", "soil", "clay", "frozenGround"]),
  twig: new Set<SubstrateId | MatId>(["soil", "peat", "mud", "frozenGround", "needleLitter", "leafLitter"]),
  leaf: new Set<SubstrateId | MatId>(["soil", "clay", "mud", "peat", "grass", "moss", "leafLitter"]),
};

// One scatter kind as the feature atlas builds it: an id plus every input its
// stamps read (only the ramp — placement probability lives in the compositor,
// not the texture).
export type FeatureInstance = { id: ScatterId; key: string; ramp: Ramp };

const rampKey = (ramp: Ramp) => ramp.map((c) => c.toString(16).padStart(6, "0")).join("");

export function featureInstance(id: ScatterId, ramp: Ramp): FeatureInstance {
  return { id, key: `${id}|${rampKey(ramp)}`, ramp };
}

// --- Stamps ---------------------------------------------------------------------
//
// Same contract as materials/index.ts's BlockStamp: (du, dv) are integer block
// deltas from the anchor, h is the feature's own random value.

type StampFn = (du: number, dv: number, h: number, ramp: Ramp) => number | null;

// Pebble: a 4×2-block rounded stone (corners clipped), lit top face, darker
// flank. Small stones (h < 0.4) lose the second row.
const pebbleStamp: StampFn = (du, dv, h, ramp) => {
  if (du < -3 || du > 3 || dv < -1 || dv > 2) return null;
  if (dv === 0 || dv === 1) {
    if (du === -3 || du === 3) return null;
    return rampAt(ramp, 0.55 + h * 0.35 - (du === -1 ? 0 : 0.15));
  }
  if (h < 0.4 || du === -3 || du === 3) return null;
  return rampAt(ramp, 0.15 + h * 0.2);
};

// Twig: a 4–6-block near-horizontal stroke with a 1-block kink past the
// midpoint, 1 block thick — at 4 native px per block that already reads as a
// chunky branch, unlike v1's 2-px hairline.
const twigStamp: StampFn = (du, dv, h, ramp) => {
  const len = 3 + Math.floor(h * 3);
  if (du < -len || du > len || dv !== 0) return null;
  const bend = h < 0.5 ? 1 : -1;
  const shade = Math.abs(du) > len / 2 ? 0.08 * bend : 0;
  return rampAt(ramp, 0.18 + h * 0.3 + shade);
};

// Fallen leaf: a 2×1-block body with an offset tip block, shaded per leaf.
// Same shape as the litter mat's leafStamp — deliberately, so carpet litter
// and stray leaves read as the same object at different densities.
// Fallen leaf: a 3×1-block body with an offset tip block, shaded per leaf.
// Same idea as the litter mat's leafStamp — deliberately, so carpet litter
// and stray leaves read as the same object at different densities — but one
// block wider so it reads at feature scale AND so its far tip can actually
// cross the tile's diamond boundary (the overhang this layer exists for).
const leafStamp: StampFn = (du, dv, h, ramp) => {
  if (dv === 0 && du >= 0 && du <= 2) return rampAt(ramp, 0.25 + h * 0.55 + du * 0.1);
  if (dv === -1 && du === (h < 0.5 ? 0 : 1)) return rampAt(ramp, 0.6 + h * 0.3);
  return null;
};

const STAMPS: Record<ScatterId, StampFn> = { pebble: pebbleStamp, twig: twigStamp, leaf: leafStamp };

// Anchor jitter ranges, in lattice units. Anchors may sit anywhere inside the
// cell INCLUDING right up against its edges, and stamps extend in BOTH
// directions from the anchor — together that is what makes the past-the-diamond
// overhang actually happen rather than being geometrically impossible.
const ANCHOR_MIN = 0.04;
const ANCHOR_SPAN = 0.92;

// Per-kind anchor direction: pebbles/twigs extend both ways from their anchor,
// but the leaf keeps its litter-stamp orientation (+du body, −dv tip) — so its
// anchor is biased toward the cell's low-u/high-v edges to give it the same
// chance of overhanging.
const LEAF_ANCHOR_BIAS = -0.15;

// Renders one feature variant over the WHOLE cell rect — deliberately not
// clipped to the diamond (see the file header). Packed 0xAARRGGBB with alpha 0
// where nothing is drawn, matching atlas.ts's VariantTexture convention.
function renderFeature(id: ScatterId, shape: number, seed: number, ramp: Ramp): Int32Array {
  const stamp = STAMPS[id]!;
  const s = seed ^ Math.floor(hash2D(shape, 0, 0x66ea6f) * 0xffffffff);
  const au = ANCHOR_MIN + hash2D(shape, 1, s) * ANCHOR_SPAN + (id === "leaf" ? LEAF_ANCHOR_BIAS : 0);
  const av = ANCHOR_MIN + hash2D(shape, 2, s ^ 0x85ebca6b) * ANCHOR_SPAN;
  const h = hash2D(shape, 3, s ^ 0xcc9e2d51);
  const out = new Int32Array(TILE_W * TILE_H);
  for (let y = 0; y < TILE_H; y++) {
    for (let x = 0; x < TILE_W; x++) {
      const [u, v] = latticeAt(x, y);
      const du = Math.round((u - au) * DEFAULT_BLOCKS);
      const dv = Math.round((v - av) * DEFAULT_BLOCKS);
      const c = stamp(du, dv, h, ramp);
      if (c !== null) out[y * TILE_W + x] = c | 0x1000000;
    }
  }
  return out;
}

// Crops to the bounding box of drawn pixels. Same idea as atlas.ts's `cut`,
// minus the mask factor.
function crop(texture: Int32Array): FeatureSpriteRef | null {
  let minX = TILE_W;
  let minY = TILE_H;
  let maxX = -1;
  let maxY = -1;
  for (let o = 0; o < texture.length; o++) {
    if (texture[o] === 0) continue;
    const x = o % TILE_W;
    const y = (o / TILE_W) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX < 0) return null;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = texture[(y + minY) * TILE_W + (x + minX)]!;
      if (px === 0) continue;
      const d = (y * w + x) * 4;
      data[d] = (px >> 16) & 0xff;
      data[d + 1] = (px >> 8) & 0xff;
      data[d + 2] = px & 0xff;
      data[d + 3] = 255;
    }
  }
  return { w, h, offsetX: minX, offsetY: minY, data };
}

// --- The feature atlas -----------------------------------------------------------
//
// Deliberately NOT shelf-packed into shared pages yet: a map carries at most
// three kinds × 4 shapes of at most 32 KB, and the packer machinery only pays
// for itself at ground-atlas scale. Milestone G packs these alongside the main
// pages when it wires the real renderer.

export type FeatureSpriteRef = {
  w: number;
  h: number;
  offsetX: number;
  offsetY: number;
  data: Uint8ClampedArray;
};

export type FeatureAtlas = {
  instances: FeatureInstance[];
  stats: { sprites: number };
  lookup(key: string, shape: number): FeatureSpriteRef | null;
};

export function buildFeatureAtlas(instances: FeatureInstance[], seed: number): FeatureAtlas {
  const refs = new Map<string, FeatureSpriteRef>();
  let sprites = 0;
  for (const inst of instances) {
    for (let shape = 0; shape < FEATURE_SHAPES; shape++) {
      const ref = crop(renderFeature(inst.id, shape, seed, inst.ramp));
      if (ref === null) continue;
      refs.set(`${inst.key}|${shape % FEATURE_SHAPES}`, ref);
      sprites++;
    }
  }
  return {
    instances,
    stats: { sprites },
    lookup(key, shape) {
      return refs.get(`${key}|${shape % FEATURE_SHAPES}`) ?? null;
    },
  };
}

// Copies one feature sprite's non-transparent pixels into `dst` at (dx, dy),
// applying the sprite's own crop offset — same contract as atlas.blitSprite.
export function blitFeature(dst: PixelBuffer, ref: FeatureSpriteRef, dx: number, dy: number): void {
  for (let y = 0; y < ref.h; y++) {
    const py = dy + ref.offsetY + y;
    if (py < 0 || py >= dst.height) continue;
    for (let x = 0; x < ref.w; x++) {
      const so = (y * ref.w + x) * 4;
      if (ref.data[so + 3] === 0) continue;
      const px = dx + ref.offsetX + x;
      if (px < 0 || px >= dst.width) continue;
      const o = (py * dst.width + px) * 4;
      dst.data[o] = ref.data[so]!;
      dst.data[o + 1] = ref.data[so + 1]!;
      dst.data[o + 2] = ref.data[so + 2]!;
      dst.data[o + 3] = 255;
    }
  }
}

// Helper used by compose.tileSurface: does this style's surface carry a host
// for the given scatter kind?
export function hasHost(
  id: ScatterId,
  substrate: SubstrateId,
  mats: ReadonlyArray<{ id: MatId }>,
): boolean {
  const hosts = FEATURE_HOSTS[id];
  return hosts.has(substrate) || mats.some((m) => hosts.has(m.id));
}

// Quantised placement probability for a feature kind on one tile. `null` =
// none. Two levels mirror the mats' sparse/full split so the same vocabulary
// applies; thresholds sit near the low end because features are decoration,
// not cover — a dense leaf field is what the leafLitter mat is for.
export function quantiseScatter(v: number): Density | null {
  if (v <= 0.05) return null;
  return v >= 0.35 ? "full" : "sparse";
}
