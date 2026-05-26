import { createNoise2D } from "simplex-noise";
import { createRand } from "../rand";
import type { Tile } from "../tileMap/tile";
import type { PipelineConfig } from "./types";
import type { Biome } from "../tileMap/Biome";
import { clamp } from "./utils";

// Rocky patches use larger blobs (~10-tile wavelength), sandy patches smaller (~7-tile wavelength).
const ROCKY_SCALE = 0.10;
const SANDY_SCALE = 0.14;

// Rocky gets 60% of surfacePatchChance, sandy gets 40%.
const ROCKY_FRACTION = 0.6;
const SANDY_FRACTION = 0.4;

// Convert a desired coverage fraction to a simplex-noise threshold.
// Simplex noise is approximately normal with stddev ~0.35; this formula
// gives a reasonable mapping for chance values in [0.01, 0.25].
function noiseThreshold(chance: number): number {
  return Math.max(-0.9, 0.75 - chance * 3.0);
}

// Biomes where precipitation is already so low that the whole biome is
// naturally bare (deserts, polar deserts, alpine deserts, etc.).
// These are excluded from surface patches because they're already like that.
function isAridBiome(biome: Biome): boolean {
  return biome.precipitationRange[1] <= 0.20;
}

export function stage9_surfacePatches(
  tiles: Tile[][],
  config: PipelineConfig,
): void {
  const { seed, surfacePatchChance, biomes } = config;

  const rockyNoise = createNoise2D(createRand(seed + "_rocky").next);
  const sandyNoise = createNoise2D(createRand(seed + "_sandy").next);

  const rockyThreshold = noiseThreshold(surfacePatchChance * ROCKY_FRACTION);
  const sandyThreshold = noiseThreshold(surfacePatchChance * SANDY_FRACTION);

  // Build a fast biome lookup by id.
  const biomeById = new Map<number, Biome>(biomes.map((b) => [b.id, b]));

  for (const col of tiles) {
    for (const tile of col) {
      if (tile.water) continue;

      const biome = biomeById.get(tile.biomeId);
      if (!biome || isAridBiome(biome)) continue;

      const tx = tile.index.x;
      const ty = tile.index.y;

      if (rockyNoise(tx * ROCKY_SCALE, ty * ROCKY_SCALE) > rockyThreshold) {
        tile.surfaceType = "rocky";
        // Exposed rock sheds water immediately — push drainage toward 0.85.
        tile.drainage = clamp(Math.max(tile.drainage, 0.70) * 1.15, 0, 1);
        tile.effectiveMoisture = tile.precipitation * (1 - tile.drainage);
      } else if (sandyNoise(tx * SANDY_SCALE, ty * SANDY_SCALE) > sandyThreshold) {
        tile.surfaceType = "sandy";
        // Sand drains quickly but less extremely than bare rock — push toward 0.75.
        tile.drainage = clamp(Math.max(tile.drainage, 0.55) * 1.10, 0, 1);
        tile.effectiveMoisture = tile.precipitation * (1 - tile.drainage);
      }
    }
  }
}
