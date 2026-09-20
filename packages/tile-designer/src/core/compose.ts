// The dual-grid compositor: a field of resolved tiles in, the list of atlas
// sprites that draws it out.
//
// This is the file the whole redesign points at. v1 asked "what colour is this
// pixel of this tile"; v2 asks "which pre-baked sprites cover this dual cell",
// and every material boundary lands in a cell's *interior* rather than on its
// edge, so nothing reads as a grid of diamonds (PLAN.md, "The inversion").
//
// --- What a dual cell is ---
//
// The dual lattice is the tile lattice shifted straight down by TILE_H/2, so
// dual cell (c, r) is congruent to a tile diamond and its four corners are the
// *centres* of tiles (c, r), (c+1, r), (c, r+1), (c+1, r+1) — the corner
// numbering and the mask set are in masks.ts, and this file builds codes from
// the same `CORNER_TILE_OFFSETS` table that file measures against. One extra row
// and column of cells covers the map fringe; `makeField` clamps out-of-range
// lookups to the nearest tile so those cells inherit the edge and no phantom
// boundary or cliff appears at the map border.
//
// --- Three stacking rules, not one ---
//
// PLAN.md states the stacking rule as "for each material present around the
// corner, compute the binary mask 'which of these 4 tiles is this material or
// higher'". That is exactly right for substrates and wrong for the other two
// cases, because it assumes each tile carries exactly one opaque material.
//
//  1. **Substrates nest.** A tile has exactly one, they are opaque, and they
//     must leave no gap. So a substrate's code is "this corner's substrate ranks
//     at or above mine", which makes the codes strictly nested: the
//     lowest-ranked substrate present gets every corner and therefore draws the
//     full cell, and each one above it overlaps the ones below. Nothing can peek
//     through, by construction rather than by the masks being exact.
//
//  2. **Mats add.** A tile carries a *set* of mats, and they are translucent by
//     design — every generator leaves holes for the ground. Nesting them would
//     be actively wrong: it would let a mat draw over a corner that has a
//     different, higher-priority mat, and the substrate under *that* corner
//     would show through the wrong material's holes. So a mat's code is simply
//     "this corner has me", and the boundary between two mats is the
//     higher-priority one's spilled mask edge, since it is painted later.
//
//  3. **Density levels partition.** `sparse` and `full` are two entries in the
//     stack rather than one entry with a per-cell density (types.ts, "Quantised
//     coverage"), but a corner contributes to exactly one of them — the `sparse`
//     code does *not* include the `full` corners. Nesting them instead would
//     leave the sparse layer drawing underneath full's holes, and since both are
//     the same material at the same ramp the result is a uniformly-full region
//     rendering ~6 points denser than the `full` texture alone: the density
//     levels stop meaning what they measure. Partitioning still rounds the
//     sparse→full step, because both masks overhang their nominal quadrants and
//     the later one wins the overlap.
//
// --- Altitude is a bitwise AND ---
//
// The 16 codes are the 16 corner subsets, so they are closed under intersection.
// A cell whose corners span several floor levels renders once per level, with
// every code in that pass ANDed against "corners at this level" and the whole
// pass offset by the level's cliff height. Altitude therefore costs no new
// textures and no new machinery (PLAN.md, "Altitude: the outermost mask").
//
// Measured over nine climate segments (39,762 dual cells): **17.2% of cells
// straddle two levels and none straddled three** — so the extra-pass cost is
// +17% of cells, and the plan's "almost always 2" is a measurement rather than
// an expectation.
//
// --- Coordinates ---
//
// Everything here is in *native bake* pixels — the 64×32 diamond, now 1:1
// with the renderer's on-screen 64×32 and matching `tileWorldOrigin` in the
// game. No scaling anywhere in the chain.

import {
  CLIFF_UNIT,
  DENSITIES,
  MATERIAL_PRIORITY,
  SCATTER_IDS,
  TILE_H,
  TILE_W,
  floorLevel,
  type Density,
  type RenderMaterialId,
  type StyleParams,
} from "./types.ts";
import { hash2D } from "./rng.ts";
import { fbm } from "./noise.ts";
import { CORNER_TILE_OFFSETS } from "./masks.ts";
import { FEATURE_SHAPES, hasHost } from "./features/index.ts";
import { materialInstance, type MaterialInstance } from "./materials/index.ts";
import { mergeMaterials, type Atlas, type MaterialRequest } from "./atlas.ts";
import { quantiseCoverage } from "./resolve.ts";
import { featureInstance, quantiseScatter, type FeatureInstance } from "./features/index.ts";

// --- The field ----------------------------------------------------------------

// One tile as the compositor sees it: which materials it carries, at what
// quantised density, on which floor. Everything continuous has already been
// decided by resolve.ts.
//
// `scatter` is milestone F's addition: the discrete decoration features the
// tile hosts (pebbles/twigs/leaves), host-gated and coverage-quantised. They
// are NOT part of the dual-cell material stack — they are placed per tile and
// drawn after that tile's floor (see terrain.ts) — but they ride along here so
// one pass over a field decides everything about its surface.
export type TileSurface = {
  substrate: MaterialInstance;
  mats: ReadonlyArray<{ instance: MaterialInstance; density: Density }>;
  scatter: ReadonlyArray<{ inst: FeatureInstance; density: Density }>;
  level: number;
};

export type TileField = {
  width: number;
  height: number;
  at(col: number, row: number): TileSurface;
};

// StyleParams → the tile's dual-grid surface. The substrate blend collapses to
// its winner here: a tile draws one substrate, and the *mix* is expressed across
// neighbouring tiles instead of inside one. That is not a loss — 44.7% of dual
// cells on a real map already have more than one substrate among their corners,
// so the blend reappears as rounded interpenetrating patches at the scale where
// the dual grid can shape it, rather than as a dither inside a diamond.
export function tileSurface(style: StyleParams, altitude: number): TileSurface {
  const { arid, wet } = style.texture;
  const winner = style.surface.substrates[0]!;
  const mats: Array<{ instance: MaterialInstance; density: Density }> = [];
  for (const m of style.surface.mats) {
    const density = quantiseCoverage(m.coverage);
    if (density === "none") continue;
    mats.push({ instance: materialInstance(m.id, style.matRamps[m.id]!, arid, wet), density });
  }
  // Milestone F: static scatter becomes atlas sprites, placed per tile and
  // gated on host compatibility — a pebble needs stony ground, a leaf needs
  // somewhere leafy to have fallen from.
  const scatter = SCATTER_IDS.flatMap((id) => {
    const density = quantiseScatter(style.staticScatter[id]);
    if (density === null || !hasHost(id, winner.id, style.surface.mats)) return [];
    return [{ inst: featureInstance(id, style.scatterRamps[id]), density }];
  });
  return {
    substrate: materialInstance(winner.id, style.substrateRamps[winner.id]!, arid, wet),
    mats,
    scatter,
    level: floorLevel(altitude),
  };
}

// Clamps out-of-range lookups to the edge, which is what makes the fringe row
// and column of dual cells behave: their off-map corners repeat the nearest real
// tile, so they render as plain continuations instead of inventing a boundary.
export function makeField(
  width: number,
  height: number,
  at: (col: number, row: number) => TileSurface,
): TileField {
  const cache = new Map<number, TileSurface>();
  return {
    width,
    height,
    at(col, row) {
      const c = col < 0 ? 0 : col >= width ? width - 1 : col;
      const r = row < 0 ? 0 : row >= height ? height - 1 : row;
      const k = r * width + c;
      let surface = cache.get(k);
      if (surface === undefined) {
        surface = at(c, r);
        cache.set(k, surface);
      }
      return surface;
    },
  };
}

// The atlas request list for a whole field: the union of its tiles' instances,
// with `sparse`/`full` requested only where some tile actually uses them.
export function fieldMaterials(field: TileField): MaterialRequest[] {
  const lists: MaterialRequest[][] = [];
  for (let r = 0; r < field.height; r++) {
    for (let c = 0; c < field.width; c++) {
      const t = field.at(c, r);
      const list: MaterialRequest[] = [{ ...t.substrate, densities: ["full"] }];
      for (const m of t.mats) list.push({ ...m.instance, densities: [m.density] });
      lists.push(list);
    }
  }
  return mergeMaterials(lists);
}

// --- Instance ordering ---------------------------------------------------------

// A total order over material *instances*, refining MATERIAL_STACK. Two
// instances of one id (the same grass under two biome ramps) must be ordered the
// same way in every cell of the map or the substrate nesting stops nesting, so
// the tiebreak is the instance key — deterministic, and needing no registry.
export function compareInstances(a: MaterialInstance, b: MaterialInstance): number {
  const d = MATERIAL_PRIORITY[a.id] - MATERIAL_PRIORITY[b.id];
  if (d !== 0) return d;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

// FNV-1a over the instance key, so two materials in one cell do not draw the
// same shape index. Memoised: a field composes the same handful of keys tens of
// thousands of times.
const saltCache = new Map<string, number>();
function keySalt(key: string): number {
  let salt = saltCache.get(key);
  if (salt === undefined) {
    let h = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    salt = h >>> 0;
    saltCache.set(key, salt);
  }
  return salt;
}

// --- Variant selection ---------------------------------------------------------

// Dual cells per wavelength of the tone-bias field. PLAN.md, "Decided": the bias
// index comes from a low-frequency field over tile coordinates so neighbouring
// cells mostly share a tone and it drifts over a few tiles, rather than every
// cell picking independently — which would put a visible tonal step on every
// cell edge, the exact thing the bias axis exists to avoid.
const BIAS_CELLS = 4;
// fBm concentrates around 0.5, so without a stretch the outer bias levels would
// almost never be reached and the axis would cost atlas space for nothing.
const BIAS_CONTRAST = 2.2;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function biasIndex(c: number, r: number, seed: number, levels: number): number {
  if (levels <= 1) return 0;
  const n = clamp01((fbm(c, r, seed ^ 0x27d4eb2f, 1 / BIAS_CELLS) - 0.5) * BIAS_CONTRAST + 0.5);
  return Math.min(levels - 1, Math.floor(n * levels));
}

export function shapeIndex(c: number, r: number, seed: number, key: string, count: number): number {
  if (count <= 1) return 0;
  return Math.min(count - 1, Math.floor(hash2D(c, r, seed ^ keySalt(key)) * count));
}

// --- Composition ---------------------------------------------------------------

// One sprite to draw: an atlas entry plus where it goes. `x`/`y` are the
// top-left of the sprite's nominal TILE_W×TILE_H cell rect in native world
// pixels, with the floor level's cliff height already subtracted; the renderer
// adds the atlas ref's own crop offset on top.
export type CellSprite = {
  key: string;
  id: RenderMaterialId;
  density: Density;
  code: number;
  shape: number;
  bias: number;
  level: number;
  x: number;
  y: number;
};

export type ComposeOptions = { seed: number };

// Top-left of dual cell (c, r)'s cell rect, in native world pixels.
export function cellOrigin(c: number, r: number, level = 0): [x: number, y: number] {
  return [
    ((c - r) * TILE_W) / 2,
    ((c + r) * TILE_H) / 2 + TILE_H / 2 - level * CLIFF_UNIT,
  ];
}

// Painter's-algorithm depth. Same rule as the tile grid, since the dual lattice
// is the tile lattice translated.
export const cellDepth = (c: number, r: number): number => c + r;

// Extent of the dual grid over a `width × height` tile field: one extra row and
// column, indices running from −1.
export function cellBounds(field: TileField): { c0: number; r0: number; c1: number; r1: number } {
  return { c0: -1, r0: -1, c1: field.width - 1, r1: field.height - 1 };
}

export function composeCell(
  field: TileField,
  atlas: Atlas,
  c: number,
  r: number,
  opts: ComposeOptions,
): CellSprite[] {
  const corners = CORNER_TILE_OFFSETS.map(([du, dv]) => field.at(c + du, r + dv));
  const out: CellSprite[] = [];

  const emit = (inst: MaterialInstance, density: Density, code: number, level: number) => {
    if (code === 0) return;
    const [x, y] = cellOrigin(c, r, level);
    out.push({
      key: inst.key,
      id: inst.id,
      density,
      code,
      shape: shapeIndex(c, r, opts.seed, inst.key, atlas.shapeCount(code)),
      bias: biasIndex(c, r, opts.seed, atlas.biasCount(code)),
      level,
      x,
      y,
    });
  };

  const levels = [...new Set(corners.map((t) => t.level))].sort((a, b) => a - b);
  for (const level of levels) {
    let levelMask = 0;
    for (let q = 0; q < 4; q++) if (corners[q]!.level === level) levelMask |= 1 << q;

    // 1. Substrates, nested. Sorted ascending, so the first one drawn is the
    //    lowest-ranked and gets the whole level footprint.
    const subs: MaterialInstance[] = [];
    for (let q = 0; q < 4; q++) {
      if ((levelMask >> q) & 1) {
        const s = corners[q]!.substrate;
        if (!subs.some((o) => o.key === s.key)) subs.push(s);
      }
    }
    subs.sort(compareInstances);
    for (const s of subs) {
      let code = 0;
      for (let q = 0; q < 4; q++) {
        if ((levelMask >> q) & 1 && compareInstances(corners[q]!.substrate, s) >= 0) code |= 1 << q;
      }
      emit(s, "full", code, level);
    }

    // 2. Mats, additive, each density level partitioning the corners that carry
    //    it. Collected first so the whole cell's mats can be drawn in one
    //    ascending pass rather than corner by corner.
    const mats = new Map<string, MaterialInstance>();
    for (let q = 0; q < 4; q++) {
      if (!((levelMask >> q) & 1)) continue;
      for (const m of corners[q]!.mats) mats.set(m.instance.key, m.instance);
    }
    for (const inst of [...mats.values()].sort(compareInstances)) {
      for (const density of DENSITIES) {
        let code = 0;
        for (let q = 0; q < 4; q++) {
          if (!((levelMask >> q) & 1)) continue;
          const m = corners[q]!.mats.find((e) => e.instance.key === inst.key);
          if (m !== undefined && m.density === density) code |= 1 << q;
        }
        emit(inst, density, code, level);
      }
    }
  }

  return out;
}

// Every sprite of a field, in draw order: back to front by depth, and within a
// cell by level then by stack position. Cliff faces belong between two levels of
// the same cell and are the renderer's job (an existing `Graphics` in
// isoRenderer.ts), not the atlas's.
export function composeField(field: TileField, atlas: Atlas, opts: ComposeOptions): CellSprite[] {
  const { c0, r0, c1, r1 } = cellBounds(field);
  const cells: Array<[number, number]> = [];
  for (let c = c0; c <= c1; c++) {
    for (let r = r0; r <= r1; r++) cells.push([c, r]);
  }
  cells.sort((a, b) => cellDepth(a[0], a[1]) - cellDepth(b[0], b[1]) || a[0] - b[0]);
  const out: CellSprite[] = [];
  for (const [c, r] of cells) out.push(...composeCell(field, atlas, c, r, opts));
  return out;
}

// --- Feature placement (milestone F) --------------------------------------------

// Top-left of tile (col, row)'s TILE_W×TILE_H cell rect at a given floor level,
// in native world pixels — the dual grid's `cellOrigin` shifted back up by the
// half-tile offset that defines it. Mirrors terrain.ts's copy (that one stays
// the canonical definition; this is the compositor-side placement origin for
// milestone F features, which belong to their host tile, not a dual cell).
export function tileOrigin(col: number, row: number, level = 0): [x: number, y: number] {
  const [x, y] = cellOrigin(col, row, level);
  return [x, y - TILE_H / 2];
}

// One placed feature: which sprite variant, where. `x`/`y` are the tile's own
// bounding-box origin at its floor level (tileOrigin, not cellOrigin — features
// belong to their host tile, not to a dual cell), in native world pixels.
export type FeaturePlacement = {
  key: string;
  id: string;
  shape: number;
  density: Density;
  x: number;
  y: number;
};

// Placement probability multiplier per density level — the compositor-side
// counterpart of DENSITY_FILL. Sparse means "a few", full means "scattered".
const FEATURE_PROB: Record<Density, number> = { sparse: 0.35, full: 1 };

// Every feature of tile (col, row), deterministically from (seed, col, row).
// Each (kind, density) pair gets its own hash gate so sparse tiles pick a
// subset of what a full tile would show rather than a different random set.
// Shape is hashed per feature so neighbours don't repeat the same variant.
export function featuresForTile(
  surface: TileSurface,
  col: number,
  row: number,
  seed: number,
): FeaturePlacement[] {
  const out: FeaturePlacement[] = [];
  for (const s of surface.scatter) {
    const h = hash2D(col, row, seed ^ Math.floor(s.inst.key.length * 2654435761) ^ keySalt(s.inst.key));
    if (h >= FEATURE_PROB[s.density]) continue;
    const shape = shapeIndex(col * 3 + 1, row * 2 + 2, seed, s.inst.key + ":f", FEATURE_SHAPES);
    const [x, y] = tileOrigin(col, row, surface.level);
    out.push({ key: s.inst.key, id: s.inst.id, shape, density: s.density, x, y });
  }
  return out;
}

// Union of the feature instances a whole field needs — the feature-atlas
// counterpart of `fieldMaterials`. Keyed by instance, so two ramps for one
// scatter kind (biome overrides) build separately.
export function fieldFeatureInstances(field: TileField): FeatureInstance[] {
  const byKey = new Map<string, FeatureInstance>();
  for (let r = 0; r < field.height; r++) {
    for (let c = 0; c < field.width; c++) {
      for (const s of field.at(c, r).scatter) byKey.set(s.inst.key, s.inst);
    }
  }
  return [...byKey.values()];
}
