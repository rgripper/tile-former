import type { RockTypeId } from "@tile-former/tilegen";

// Native bake resolution: 2× the 64×32 screen diamond.
export const TILE_W = 128;
export const TILE_H = 64;

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
  water: boolean;
  surface: SurfaceSpec;
  substrateRamps: Partial<Record<SubstrateId, Ramp>>;
  matRamps: Partial<Record<MatId, Ramp>>;
  // Animated-scatter densities [0,1] — consumed from M4 on; resolved here so
  // the designer can display them from M1.
  scatter: { fern: number; reed: number; flower: number };
};
