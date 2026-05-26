import type { Biome } from "../tileMap/Biome";
import { biomes as defaultBiomes } from "../tileMap/biomes";

export type SegmentBase = {
  altitude: number;       // [0, 1]
  temperature: number;    // °C
  precipitation: number;  // [0, 1]
  light: number;          // [0, 1]
  seasonality: number;    // [0, 1] — fixed for the entire local world, set by global map
};

export type SegmentNeighbors = {
  north?: SegmentBase;
  south?: SegmentBase;
  east?: SegmentBase;
  west?: SegmentBase;
};

// Patch-scale cell (~50 m × 50 m, covers tilesPerPatch × tilesPerPatch tiles).
export type PatchCell = {
  index: { x: number; y: number };
  altitude: number;
  temperature: number;
  precipitation: number;
  drainage: number;
  light: number;
  biomeId: number; // biome.id (1-based), set in Stage 5
};

export type PipelineConfig = {
  width: number;          // tile grid width
  height: number;         // tile grid height
  tilesPerPatch: number;  // tiles per patch side (patch grid = ceil(w/t) × ceil(h/t))
  seed: string;
  segmentBase: SegmentBase;
  neighbors?: SegmentNeighbors;
  localNoiseScale: number;
  borderBlendWidth: number; // blend band width in patches
  biomes: Biome[];
  surfacePatchChance: number; // [0, 1] base probability for rocky/sandy patch tiles
  pondDensity: number;        // [0, 1] controls pond count and size (0 = none, 1 = maximum)
};

export const defaultSegmentBase: SegmentBase = {
  altitude: 0.15,
  temperature: 12,
  precipitation: 0.45,
  light: 0.55,
  seasonality: 0.25,
};

export const defaultPipelineConfig: PipelineConfig = {
  width: 64,
  height: 64,
  tilesPerPatch: 4,
  seed: "pipeline1",
  segmentBase: defaultSegmentBase,
  localNoiseScale: 0.15,
  borderBlendWidth: 3,
  biomes: defaultBiomes,
  surfacePatchChance: 0.07,
  pondDensity: 0.5,
};
