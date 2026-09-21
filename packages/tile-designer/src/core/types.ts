import type { RockTypeId } from "@tile-former/tilegen";

// Native bake resolution: 1:1 with the 64×32 screen diamond.
//
// This was 128×64 (a 2× bake) until it was measured to carry no authored
// detail. Every material generator and the mask builder quantise through
// `blocks` (lattice.ts), and at the default `blocks = 32` one authoring block
// spans e_u/32 = (2,1) px and e_v/32 = (−2,1) px in a 128×64 diamond — area
// exactly 4 native px, which is one screen pixel once the renderer halves it.
// The 2× bake was therefore storing a 64×32 image in 128×64 pixels: 4× the
// bytes for zero information, and a GPU downsample that *softened* the block
// edges this whole design exists to keep hard.
//
// Measured on the whole-world atlas (all 35 biomes, 29 material instances):
// sprite bytes fall 48.5 MB → 11.9 MB, 4 pages → 1. The freed budget goes to
// shape variants, which is what actually fights the repeated-pattern read —
// 64×32 at 32 shapes (32.8 MB) costs less than 128×64 at 8 (48.5 MB).
//
// Zooming past 1:1 in game is an integer camera scale (1 texel → N screen px),
// not a higher-resolution atlas.
export const TILE_W = 64;
export const TILE_H = 32;

// --- Surface taxonomy (replaces tilegen's legacy surfaceType hack) ---

export const SUBSTRATE_IDS = [
  "bareRock",
  "scree",
  "sand",
  "soil",
  "clay",
  "mud",
  "peat",
  "frozenGround",
  "snow",
  // Open water. Not scored like the others — `resolve.ts` asserts it straight
  // from tilegen's boolean — but a substrate in every other sense: a tile has
  // exactly one, it is opaque, and it must leave no gap. Being one is what
  // earns the shoreline the dual grid's rounding instead of the flat diamond
  // overlay it had until milestone W.
  "water",
] as const;
export type SubstrateId = (typeof SUBSTRATE_IDS)[number];

export const MAT_IDS = [
  "grass",
  "dryGrass",
  "moss",
  "lichen",
  "leafLitter",
  "needleLitter",
  "sedge",
  "cushion",
] as const;
export type MatId = (typeof MAT_IDS)[number];

// Static scatter kinds. These are materials for palette purposes (they draw
// from ramps like everything else) but are placed as discrete stamps rather
// than as coverage layers.
export const SCATTER_IDS = ["pebble", "twig", "leaf"] as const;
export type ScatterId = (typeof SCATTER_IDS)[number];

// Everything that owns a ramp. The substrate/mat/scatter split matters to
// `resolve.ts` (they are selected by different score functions) but not to the
// palette or, from the dual-grid redesign on, to the renderer — see PLAN.md,
// "One unified material stack".
export const MATERIAL_IDS = [...SUBSTRATE_IDS, ...MAT_IDS, ...SCATTER_IDS] as const;
export type MaterialId = (typeof MATERIAL_IDS)[number];

// The subset that the atlas draws as texture: scatter is placed as discrete
// stamps from milestone F, not as a masked coverage layer.
export type RenderMaterialId = SubstrateId | MatId;

// --- The unified material stack (v2) ---
//
// The substrate/mat distinction is a *selection* concept: `resolve.ts` scores
// the two families with different functions and emits them separately. It has
// no meaning at render time — from the dual-grid redesign on, both are just
// entries in one priority-ordered list (PLAN.md, "One unified material stack").
//
// Order is ASCENDING priority, which is also the draw order: a dual cell draws
// each material present around it in this order, so a later material's sprite
// overlaps an earlier one. Two consequences the mask design depends on:
//
//  - The *lowest*-priority material present at a cell necessarily has all four
//    corners "itself or higher", so it draws the full cell and nothing can peek
//    through underneath (see masks.ts, the overhang-only rule).
//  - The visible boundary between two materials is always the *higher*-priority
//    one's mask edge, since it is painted last.
//
// The ordering itself is a physical read of what lies on what: bedrock and its
// debris at the bottom, then finer and wetter ground, then frozen cover, then
// the living mats (crust → carpet → turf → cushions), then shed litter, then
// loose scatter. `snow` sits above `frozenGround` and every mat sits above every
// substrate for the same reason: they are deposited *onto* what precedes them.
export const MATERIAL_STACK = [
  // substrates
  "bareRock",
  "scree",
  "sand",
  "clay",
  "soil",
  "mud",
  "peat",
  "frozenGround",
  "snow",
  // Top of the substrate block: water lies over whatever the lakebed is, so
  // every other substrate around a shore cell draws underneath it. It is not
  // pushed above the mats even though water physically covers vegetation —
  // compose.ts draws all substrates before any mat regardless of stack index,
  // so a position up there would claim a precedence it never gets. Mats
  // therefore spill their few px of overhang onto the water, which is the
  // right read anyway: bank growth leans out over the edge.
  "water",
  // mats
  "lichen",
  "moss",
  "dryGrass",
  "grass",
  "sedge",
  "cushion",
  "needleLitter",
  "leafLitter",
  // scatter (placed as discrete stamps from milestone F, but they still need a
  // slot in the order so depth sorting has one rule rather than two)
  "pebble",
  "twig",
  "leaf",
] as const satisfies readonly MaterialId[];

export const MATERIAL_PRIORITY: Record<MaterialId, number> = Object.fromEntries(
  MATERIAL_STACK.map((id, i) => [id, i]),
) as Record<MaterialId, number>;

// Ascending-priority sort, so a caller can hand the renderer a draw order
// without knowing the stack.
export function byPriority<T extends { id: MaterialId }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => MATERIAL_PRIORITY[a.id] - MATERIAL_PRIORITY[b.id]);
}

// --- Quantised coverage ---
//
// A mat's continuous `coverage` fraction collapses to three levels (PLAN.md,
// "One unified material stack, quantised coverage"). `none` needs no sprite, so
// the atlas only ever builds the two densities.
//
// The two levels are *separate entries in the priority stack*, not one entry
// carrying a per-cell density: `sparse` draws first and `full` draws over it,
// each with its own corner code, so the sparse→full step gets rounded by the
// dual grid like any other material boundary. Picking one density per cell
// instead puts that step on cell edges and paints flat diamonds across the
// field — exactly the read the dual grid exists to prevent.
export const DENSITIES = ["sparse", "full"] as const;
export type Density = (typeof DENSITIES)[number];
export type Coverage = "none" | Density;

// --- Altitude ---
//
// Mirrors isoRenderer.ts, which quantises altitude the same way. CLIFF_UNIT is
// in *native bake* pixels, now 1:1 with the renderer's 12 screen px.
// Milestone G unifies the two copies.
export const MAX_FLOORS = 10;
export const CLIFF_UNIT = 12;

export function floorLevel(altitude: number): number {
  return Math.round(altitude * MAX_FLOORS);
}

// Blended substrate base (top-2 by score, weights sum to 1) plus 0..n mat
// coverage layers, ordered by coverage descending.
export type SurfaceSpec = {
  substrates: Array<{ id: SubstrateId; weight: number }>;
  mats: Array<{ id: MatId; coverage: number }>;
};

// --- Designer input: the visual subset of tilegen's TileProperties ---
// Kept flat and minimal so the game can build one from a Tile trivially and
// so quantization for the bake cache key has an obvious surface.

export type DesignInput = {
  temperature: number; // °C
  effectiveMoisture: number; // [0,1]
  drainage: number; // [0,1]
  groundLight: number; // [0,1]
  altitude: number; // [0,1]
  fertility: number; // [0,1]
  riparian: number; // [0,1]
  forestDensity: number; // [0,1]
  rockType: RockTypeId;
  water: boolean;
  // Selects per-biome palette overrides; null = global palette only.
  biomeId: number | null;
};

// A 4-step pixel-art color ramp, dark → highlight, as 0xRRGGBB numbers.
export type Ramp = [number, number, number, number];

// Everything the bake stages need, fully resolved — no further property
// lookups happen past this point.
export type StyleParams = {
  surface: SurfaceSpec;
  substrateRamps: Partial<Record<SubstrateId, Ramp>>;
  matRamps: Partial<Record<MatId, Ramp>>;
  // Texturing scalars for the substrate stage: arid drives crack patterns
  // (dry clay, cracked earth), wet drives sheen highlights (mud, riparian).
  texture: { arid: number; wet: number };
  // Static scatter baked into the floor (M3): densities [0,1] and the ramps
  // their stamps draw from (palette-resolved so biome overrides apply).
  staticScatter: { pebble: number; twig: number; leaf: number };
  scatterRamps: { pebble: Ramp; twig: Ramp; leaf: Ramp };
  // Animated-scatter densities [0,1] — consumed from M4 on; resolved here so
  // the designer can display them from M1.
  scatter: { fern: number; reed: number; flower: number };
};
