// The variant atlas: every sprite the floor layer can draw, built once.
//
// v1 baked a unique 128×64 texture per world tile. v2 bakes a fixed, small set
// of textures and reuses them — that inversion is the whole redesign (PLAN.md,
// "The inversion"). This file is where the set is enumerated and packed.
//
// --- What a sprite is ---
//
// A sprite is one **material texture variant** cut by one **corner mask**:
//
//     sprite = texture(material, density, shape, bias) × mask(code, maskShape)
//
// The two factors are independent, which is worth being explicit about because
// it is what keeps the build cheap. The texture is a periodic function of the
// whole unit lattice square and knows nothing about corners; the mask is
// material-independent and is built once for the entire atlas. So the generator
// — the expensive part — runs `fullShapes × biasLevels` times per material and
// density, and the 16 codes are then produced by masking, which is a memcpy.
//
// --- Variant counts ---
//
// Full-cell (code 15) sprites are what almost every cell draws, so they carry
// the variety: milestone L measured that one variant shows an obvious lattice of
// identical blobs and eight break it completely, and tone is a separate axis on
// top (a threshold bias inside the generator, never a flat ramp shift — see
// materials/index.ts). Partial codes only ever appear in the one-cell-wide band
// along a material boundary, so they get far fewer.
//
// Partial codes currently carry no bias levels: a boundary cell sits at bias 0
// while its neighbours may not, so a mild tone step is possible along a
// boundary. That is deliberate for now — it is much less visible than shape
// repetition, and it costs 14 × (biasLevels − 1) sprites per material to fix.
// Revisit against the terrain preview in milestone T.
//
// --- Packing ---
//
// Sprites are cropped to the bounding box of their non-transparent pixels before
// packing. Worth being precise about what that buys, since it is easy to
// overrate: a full-cell sprite's box is the whole diamond and saves nothing, so
// the win is entirely in the 14 partial codes — a single-corner box measures 33%
// of a full cell's, and the atlas as a whole comes out **24% smaller** than
// storing every sprite as an uncropped 64×32 rect. Placement is a shelf packer
// over rows sorted by height, which is close to optimal when heights only ever
// run 1..32.
//
// The remaining obvious waste is that a diamond fills only half its bounding
// box. Recovering it means interlocking diamonds at pack time rather than
// treating sprites as rectangles, which the renderer would also have to
// understand; not worth it while a whole map's atlas fits in one page.
//
// It does, but only since the bake went 1:1 (types.ts, TILE_W). Measured over
// all 35 biomes — 29 material instances, 41 instance×density, 2132 sprites —
// the whole-world atlas is 11.9 MB of sprite pixels in one 2048² page. At the
// old 2× bake the same set was 48.5 MB across four pages, and interlocking
// would have been worth doing. Raising `fullShapes` is the thing most likely
// to push this back over a page; 32 shapes lands at 32.8 MB / 3 pages.

import type { Density, RenderMaterialId, StyleParams } from "./types.ts";
import { DENSITIES, TILE_H, TILE_W } from "./types.ts";
import { DEFAULT_BLOCKS, latticeAt } from "./lattice.ts";
import { makeBuffer, rowSpan, type PixelBuffer } from "./pixels.ts";

import { buildMaskSet, CODE_EMPTY, CODE_FULL, MASK_CODES, nominalMask, type MaskBitmap } from "./masks.ts";
import {
  MATERIAL_GENS,
  materialInstance,
  type MaterialCtx,
  type MaterialInstance,
} from "./materials/index.ts";

// How full a mat's own texture is at each level. `full` is not 1.0 anywhere in
// the generators either — every mat deliberately leaves holes so the ground
// shows through; this scales that on top.
export const DENSITY_FILL: Record<Density, number> = { sparse: 0.55, full: 1 };

// One instance plus the density levels to build for it. Substrates are always
// `["full"]` — they are the ground, not something lying on it.
// `materialsFromStyle` enforces that.
export type MaterialRequest = MaterialInstance & { densities: Density[] };

export type AtlasConfig = {
  seed: number;
  // Shape variants of the full-cell sprite. 8 is milestone L's measured floor;
  // the default sits at 16 because the 1:1 bake made shapes cheap enough that
  // there is no reason to run at the floor (see DEFAULT_ATLAS_CONFIG).
  fullShapes: number;
  // Threshold-bias levels, applied to full-cell sprites only.
  biasLevels: number;
  // Ramp-step units between adjacent bias levels. Levels are centred on 0, so
  // `biasLevels: 3, biasStep: 0.18` gives −0.18 / 0 / +0.18.
  biasStep: number;
  // Shape variants of each partial code. Selects both the mask's spill field and
  // the texture shape, so the two stay in step without a third index.
  partialShapes: number;
  // Authoring block grid, in blocks per lattice unit — v2's brush size.
  blocks: number;
  pageSize: number;
};

// Measured at the 1:1 bake (types.ts, TILE_W), single-style atlas, as
// content / allocated / page fill:
//
//   shapes  page 1024              page 2048
//        8  2.2 MB / 4 MB / 56%    2.2 MB / 16 MB / 14%
//       16  3.5 MB / 4 MB / 89%    3.5 MB / 16 MB / 22%
//       32  6.2 MB / 8 MB / 77%    6.2 MB / 16 MB / 38%
//
// A page is allocated at full size whatever lands on it, so 2048 was spending
// 16 MB to hold 2.2 MB. At 1024 the same atlas is one 4 MB page — and the room
// that frees goes straight into `fullShapes`, which is the axis that actually
// fights the repeated-pattern read. 16 shapes at page 1024 is 4 MB: a quarter
// of today's allocation for twice the shape variety.
//
// The game wants the opposite trade and should pass `pageSize: 2048`: the
// whole-world atlas (all 35 biomes) is one 16 MB page at 74% fill there, versus
// four pages at 1024.
export const DEFAULT_ATLAS_CONFIG: AtlasConfig = {
  seed: 1234,
  fullShapes: 16,
  biasLevels: 3,
  biasStep: 0.18,
  partialShapes: 2,
  blocks: DEFAULT_BLOCKS,
  pageSize: 1024,
};

// How many shape and tone-bias variants a code carries. Pure policy over the
// config, and exported separately from `Atlas` because the compositor needs it
// *before* an atlas exists: on the GPU path, what the atlas must contain is
// decided by what the compositor asks for (see `SpriteVariant` and
// `buildFieldAtlas`), so compose cannot depend on a built atlas to reduce its
// own indices. `Atlas` satisfies this structurally, so call sites that already
// have one keep passing it.
export type SpriteCounts = {
  shapeCount(code: number): number;
  biasCount(code: number): number;
};

export function atlasCounts(config: AtlasConfig = DEFAULT_ATLAS_CONFIG): SpriteCounts {
  return {
    // Partial codes have fewer shapes than full ones: a boundary cell's shape is
    // mostly hidden by the mask anyway, and the sprite count is per code.
    shapeCount: (code) =>
      code === CODE_FULL ? config.fullShapes : code === CODE_EMPTY ? 0 : config.partialShapes,
    // Only full cells carry the tone-bias axis — see the deferral logged in A.
    biasCount: (code) => (code === CODE_FULL ? config.biasLevels : 1),
  };
}

// One entry the atlas must hold, as the compositor asks for it. `clip` is the
// level clip (compose.ts, "Spill runs downhill") and is `CODE_FULL` — no clip —
// for everything outside a floor-level straddle.
export type SpriteVariant = {
  key: string;
  density: Density;
  code: number;
  clip: number;
  shape: number;
  bias: number;
};

// Where a sprite lives, plus where its cropped box sits inside the nominal
// 64×32 cell rect so the renderer can place it without storing the crop.
export type SpriteRef = {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  offsetX: number;
  offsetY: number;
};

export type AtlasStats = {
  buildMs: number;
  sprites: number;
  pages: number;
  // Bytes of the packed pages, and of the same sprites stored uncropped as full
  // 64×32 rects — the ratio is what the cropping buys.
  packedBytes: number;
  uncroppedBytes: number;
  spritePixels: number;
  perMaterial: Array<{ key: string; id: RenderMaterialId; density: Density; sprites: number; pixels: number }>;
};

export type Atlas = {
  config: AtlasConfig;
  materials: MaterialRequest[];
  pages: PixelBuffer[];
  masks: MaskBitmap[][];
  stats: AtlasStats;
  // Keyed by `MaterialInstance.key`, not by material id: one map can hold two
  // instances of `grass` under different biome ramps. `clip` defaults to
  // CODE_FULL (the unclipped entry every atlas carries); a clipped one is only
  // present if it was requested through `buildAtlas`'s `extraClips`, so a miss
  // returns null rather than silently drawing the unclipped sprite over a cliff.
  lookup(
    key: string,
    density: Density,
    code: number,
    shape: number,
    bias: number,
    clip?: number,
  ): SpriteRef | null;
} & SpriteCounts;

// Copies one sprite's non-transparent pixels into `dst` at (dx, dy) — the
// sprite's own crop offset (`ref.offsetX/Y`) is applied on top, matching the
// contract `CellSprite.x/y` documents (compose.ts).
//
// `clip`, when given, is a TILE_W×TILE_H coverage bitmap in the sprite's own
// cell rect (masks.ts, `nominalMask`): a pixel outside it is dropped. That is
// how a dual cell's lower floor level is held back from spilling up the cliff
// face above it — see compose.ts, `CellSprite.clip`.
export function blitSprite(
  dst: PixelBuffer,
  atlas: Atlas,
  ref: SpriteRef,
  dx: number,
  dy: number,
  clip?: Uint8Array,
): void {
  const page = atlas.pages[ref.page]!;
  for (let y = 0; y < ref.h; y++) {
    const py = dy + ref.offsetY + y;
    if (py < 0 || py >= dst.height) continue;
    for (let x = 0; x < ref.w; x++) {
      const so = ((ref.y + y) * page.width + ref.x + x) * 4;
      if (page.data[so + 3] === 0) continue;
      if (clip !== undefined && clip[(ref.offsetY + y) * TILE_W + ref.offsetX + x] === 0) continue;
      const px = dx + ref.offsetX + x;
      if (px < 0 || px >= dst.width) continue;
      const o = (py * dst.width + px) * 4;
      dst.data[o] = page.data[so]!;
      dst.data[o + 1] = page.data[so + 1]!;
      dst.data[o + 2] = page.data[so + 2]!;
      dst.data[o + 3] = 255;
    }
  }
}

// --- Texture rendering --------------------------------------------------------

// One variant texture over the whole diamond: packed 0xAARRGGBB with alpha 0
// where the material does not cover.
type VariantTexture = Int32Array; // length TILE_W * TILE_H

function renderVariant(id: RenderMaterialId, ctx: MaterialCtx): VariantTexture {
  const gen = MATERIAL_GENS[id];
  const out = new Int32Array(TILE_W * TILE_H);
  for (let y = 0; y < TILE_H; y++) {
    const [x0, x1] = rowSpan(y);
    for (let x = x0; x <= x1; x++) {
      const [u, v] = latticeAt(x, y);
      const c = gen(u, v, ctx);
      if (c !== null) out[y * TILE_W + x] = c | 0x1000000; // alpha flag
    }
  }
  return out;
}

// --- Variant texture cache ----------------------------------------------------
//
// renderVariant is the whole cost of a build: one texture is a per-pixel run of
// the material generator (fBm octaves, Worley scans, anchor fields), and a
// build asks for shapes × biases × densities of them. Consecutive builds — the
// two panels on load, a grid or base-floor switch, a re-bake — request the same
// set over and over, because a texture is a pure function of exactly the ctx
// fields keyed below. Caching them turns repeat builds into cut-and-pack only.
//
// Bounded: entries are 32 KB Int32Arrays, and a seed re-roll multiplies the
// live key space, so at the cap the whole cache drops rather than evicting
// per-entry (builds always request a whole batch, so a full flush is coherent).
const variantCache = new Map<string, VariantTexture>();
const VARIANT_CACHE_MAX = 2048;

function cachedVariant(id: RenderMaterialId, ctx: MaterialCtx): VariantTexture {
  const key = `${id}|${ctx.ramp.map((c) => c.toString(16)).join("")}|${ctx.seed}|${ctx.structureSeed}|${ctx.bias}|${ctx.density}|${ctx.arid}|${ctx.wet}|${ctx.blocks}`;
  let tex = variantCache.get(key);
  if (tex === undefined) {
    tex = renderVariant(id, ctx);
    if (variantCache.size >= VARIANT_CACHE_MAX) variantCache.clear();
    variantCache.set(key, tex);
  }
  return tex;
}

// Levels centred on zero: 3 levels at step s give −s, 0, +s.
export function biasAt(level: number, cfg: AtlasConfig): number {
  if (cfg.biasLevels <= 1) return 0;
  return (level - (cfg.biasLevels - 1) / 2) * cfg.biasStep;
}

// --- Shelf packer -------------------------------------------------------------

type Shelf = { y: number; h: number; x: number };

class PagePacker {
  private shelves: Shelf[] = [];
  private used = 0;

  constructor(
    readonly size: number,
    readonly index: number,
  ) {}

  place(w: number, h: number): { x: number; y: number } | null {
    for (const s of this.shelves) {
      if (h <= s.h && s.x + w <= this.size) {
        const at = { x: s.x, y: s.y };
        s.x += w;
        this.used += w * h;
        return at;
      }
    }
    const top = this.shelves.length === 0 ? 0 : this.shelves[this.shelves.length - 1]!.y +
      this.shelves[this.shelves.length - 1]!.h;
    if (top + h > this.size || w > this.size) return null;
    this.shelves.push({ y: top, h, x: w });
    this.used += w * h;
    return { x: 0, y: top };
  }

  get usedPixels(): number {
    return this.used;
  }
}

// --- Build --------------------------------------------------------------------

type PendingSprite = {
  key: string;
  w: number;
  h: number;
  offsetX: number;
  offsetY: number;
  // Row-major RGBA of the cropped box.
  data: Uint8ClampedArray;
};

const spriteKey = (
  key: string,
  density: Density,
  code: number,
  shape: number,
  bias: number,
  clip: number,
): string =>
  // Unclipped entries keep their old key exactly, so the clip axis costs
  // nothing for the ~90% of sprites that never straddle a level.
  clip === CODE_FULL
    ? `${key}|${density}|${code}|${shape}|${bias}`
    : `${key}|${density}|${code}|${shape}|${bias}|c${clip}`;

// Cuts a variant texture with a mask and crops to the result's bounding box.
// Returns null when nothing survives (only possible for a very sparse mat under
// a single-corner mask, or for a clip that shares no area with the mask).
//
// `clip`, when given, is intersected with the mask before cutting — this is the
// GPU path's version of the level clip that `renderTerrain` applies per pixel at
// blit time. A GPU sprite is a quad, so the clip has to be *in* the texture;
// masks are closed under intersection, so baking it in costs nothing but the
// extra entry.
function cut(
  texture: VariantTexture,
  mask: MaskBitmap,
  clip?: Uint8Array,
): Omit<PendingSprite, "key"> | null {
  let minX = TILE_W;
  let minY = TILE_H;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < TILE_H; y++) {
    const [x0, x1] = rowSpan(y);
    for (let x = x0; x <= x1; x++) {
      const o = y * TILE_W + x;
      if (texture[o] === 0 || mask.data[o] === 0) continue;
      if (clip !== undefined && clip[o] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y + minY) * TILE_W + (x + minX);
      const px = texture[o]!;
      if (px === 0 || mask.data[o] === 0) continue;
      if (clip !== undefined && clip[o] === 0) continue;
      const d = (y * w + x) * 4;
      data[d] = (px >> 16) & 0xff;
      data[d + 1] = (px >> 8) & 0xff;
      data[d + 2] = px & 0xff;
      data[d + 3] = 255;
    }
  }
  return { w, h, offsetX: minX, offsetY: minY, data };
}

// `extraClips` is the GPU path's addition (milestone G): the *clipped* variants
// a particular field's straddling cells ask for, on top of the unclipped set
// every atlas carries. They are requested rather than enumerated because the
// full product is `code ⊆ clip ⊊ 15` — 50 non-empty pairs against 15 unclipped
// codes, so building them all would roughly triple the atlas. Measured on real
// 64×64 maps (4 seeds): a map touches 44 of the 65 possible pairs, but only a
// fraction of them *per material*, so requesting exactly what the compositor
// asked for costs +46–51% sprites rather than +200%. `buildFieldAtlas`
// (compose.ts) is the entry point that collects them.
//
// The CPU renderer does not need any of this — `renderTerrain` clips per pixel
// at blit time for free. This exists because a GPU sprite is a quad.
export function buildAtlas(
  materials: MaterialRequest[],
  overrides: Partial<AtlasConfig> = {},
  extraClips: readonly SpriteVariant[] = [],
): Atlas {
  const config: AtlasConfig = { ...DEFAULT_ATLAS_CONFIG, ...overrides };
  const t0 = Date.now();
  const masks = buildMaskSet(config.seed ^ 0x4d4b5347, config.partialShapes, config.blocks);

  const { shapeCount, biasCount } = atlasCounts(config);

  // Requested clips, grouped by the material-density whose textures they cut.
  const clipsFor = new Map<string, SpriteVariant[]>();
  for (const v of extraClips) {
    if (v.clip === CODE_FULL || v.code === CODE_EMPTY) continue;
    const k = `${v.key}|${v.density}`;
    const list = clipsFor.get(k);
    if (list === undefined) clipsFor.set(k, [v]);
    else list.push(v);
  }

  const pending: PendingSprite[] = [];
  const perMaterial: AtlasStats["perMaterial"] = [];

  for (const req of materials) {
    for (const density of req.densities) {
      // The generator runs only here — once per (shape, bias) — and only on a
      // cache miss (cachedVariant); everything below reuses these textures.
      const textures: VariantTexture[][] = [];
      for (let shape = 0; shape < config.fullShapes; shape++) {
        const row: VariantTexture[] = [];
        for (let bias = 0; bias < config.biasLevels; bias++) {
          const ctx: MaterialCtx = {
            ramp: req.ramp,
            seed: config.seed ^ ((shape + 1) * 0x9e3779b9),
            structureSeed: config.seed,
            bias: biasAt(bias, config),
            density: DENSITY_FILL[density],
            arid: req.arid,
            wet: req.wet,
            blocks: config.blocks,
          };
          row.push(cachedVariant(req.id, ctx));
        }
        textures.push(row);
      }

      let sprites = 0;
      let pixels = 0;
      for (let code = 1; code < MASK_CODES; code++) {
        for (let shape = 0; shape < shapeCount(code); shape++) {
          for (let bias = 0; bias < biasCount(code); bias++) {
            // Partial codes have fewer shapes than there are textures; reuse the
            // texture of the same index so a boundary cell's texture still
            // varies with its mask.
            const tex = textures[shape % config.fullShapes]![code === CODE_FULL ? bias : 0]!;
            const mask = masks[code]![shape % masks[code]!.length]!;
            const cutSprite = cut(tex, mask);
            if (cutSprite === null) continue;
            pending.push({ key: spriteKey(req.key, density, code, shape, bias, CODE_FULL), ...cutSprite });
            sprites++;
            pixels += cutSprite.w * cutSprite.h;
          }
        }
      }

      // The requested clipped variants, deduped — a field asks for the same
      // (code, clip, shape) in thousands of cells.
      const seen = new Set<string>();
      for (const v of clipsFor.get(`${req.key}|${density}`) ?? []) {
        const shape = v.shape % shapeCount(v.code);
        const bias = v.bias % biasCount(v.code);
        const key = spriteKey(req.key, density, v.code, shape, bias, v.clip);
        if (seen.has(key)) continue;
        seen.add(key);
        const tex = textures[shape % config.fullShapes]![v.code === CODE_FULL ? bias : 0]!;
        const mask = masks[v.code]![shape % masks[v.code]!.length]!;
        const cutSprite = cut(tex, mask, nominalMask(v.clip));
        if (cutSprite === null) continue;
        pending.push({ key, ...cutSprite });
        sprites++;
        pixels += cutSprite.w * cutSprite.h;
      }
      perMaterial.push({ key: req.key, id: req.id, density, sprites, pixels });
    }
  }

  // Tallest first: shelf packing wastes the difference between a shelf's height
  // and the height of what lands on it, so grouping similar heights is the whole
  // game.
  const order = pending.map((_, i) => i).sort((a, b) => pending[b]!.h - pending[a]!.h);

  const packers: PagePacker[] = [];
  const pages: PixelBuffer[] = [];
  const refs = new Map<string, SpriteRef>();
  const newPage = () => {
    const p = new PagePacker(config.pageSize, packers.length);
    packers.push(p);
    pages.push(makeBuffer(config.pageSize, config.pageSize));
    return p;
  };

  for (const i of order) {
    const s = pending[i]!;
    let placed: { x: number; y: number } | null = null;
    let pageIndex = -1;
    for (let p = 0; p < packers.length; p++) {
      placed = packers[p]!.place(s.w, s.h);
      if (placed !== null) {
        pageIndex = p;
        break;
      }
    }
    if (placed === null) {
      const p = newPage();
      pageIndex = packers.length - 1;
      placed = p.place(s.w, s.h);
      if (placed === null) {
        throw new Error(`atlas: sprite ${s.key} (${s.w}×${s.h}) does not fit a ${config.pageSize} page`);
      }
    }
    const page = pages[pageIndex]!;
    for (let y = 0; y < s.h; y++) {
      const dst = ((placed.y + y) * page.width + placed.x) * 4;
      page.data.set(s.data.subarray(y * s.w * 4, (y + 1) * s.w * 4), dst);
    }
    refs.set(s.key, {
      page: pageIndex,
      x: placed.x,
      y: placed.y,
      w: s.w,
      h: s.h,
      offsetX: s.offsetX,
      offsetY: s.offsetY,
    });
  }

  const spritePixels = pending.reduce((sum, s) => sum + s.w * s.h, 0);
  const stats: AtlasStats = {
    buildMs: Date.now() - t0,
    sprites: pending.length,
    pages: pages.length,
    packedBytes: pages.length * config.pageSize * config.pageSize * 4,
    uncroppedBytes: pending.length * TILE_W * TILE_H * 4,
    spritePixels,
    perMaterial,
  };

  return {
    config,
    materials,
    pages,
    masks,
    stats,
    shapeCount,
    biasCount,
    lookup(key, density, code, shape, bias, clip = CODE_FULL) {
      if (code === CODE_EMPTY) return null;
      const shapes = shapeCount(code);
      const biases = biasCount(code);
      if (shapes === 0) return null;
      return refs.get(spriteKey(key, density, code, shape % shapes, bias % biases, clip)) ?? null;
    },
  };
}

// --- Wiring to the resolver ---------------------------------------------------

// The atlas entries a resolved style needs. `resolve.ts` still emits substrates
// and mats separately (they are selected by different score functions); they
// merge here, which is the only place the distinction has to be unlearned.
//
// Mats get both density levels because coverage quantises to {none, sparse,
// full} per cell and one style can produce either; substrates get only `full`.
export function materialsFromStyle(style: StyleParams): MaterialRequest[] {
  const { arid, wet } = style.texture;
  const out: MaterialRequest[] = [];
  for (const s of style.surface.substrates) {
    out.push({ ...materialInstance(s.id, style.substrateRamps[s.id]!, arid, wet), densities: ["full"] });
  }
  for (const m of style.surface.mats) {
    out.push({
      ...materialInstance(m.id, style.matRamps[m.id]!, arid, wet),
      densities: [...DENSITIES],
    });
  }
  return out;
}

// The atlas for a whole field is the union of its tiles' instances. Requests
// with the same key are the same texture by construction (the key covers every
// generator input), so merging them is a set union with the density levels
// OR-ed together — a mat that is `sparse` in one tile and `full` in another
// needs both.
//
// Measured over nine climate segments: a real 48x48 map holds 11.6 material ids
// but 15.8 instances (worst 22), the extra ~36% being the climate tint on grass
// and the arid/wet levels on soil, clay and mud. That is the number the atlas
// budget has to be read against, not the id count.
export function mergeMaterials(lists: Iterable<readonly MaterialRequest[]>): MaterialRequest[] {
  const byKey = new Map<string, MaterialRequest>();
  for (const list of lists) {
    for (const req of list) {
      const existing = byKey.get(req.key);
      if (existing === undefined) {
        byKey.set(req.key, { ...req, densities: [...req.densities] });
        continue;
      }
      for (const d of req.densities) {
        if (!existing.densities.includes(d)) existing.densities.push(d);
      }
    }
  }
  // Density order has to be the canonical one: `buildAtlas` iterates it and the
  // compositor draws `sparse` under `full`.
  for (const req of byKey.values()) {
    req.densities.sort((a, b) => DENSITIES.indexOf(a) - DENSITIES.indexOf(b));
  }
  return [...byKey.values()];
}
