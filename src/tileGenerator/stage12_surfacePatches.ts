import { createNoise2D } from "simplex-noise";
import { createRand } from "../rand";
import type { Tile } from "../tileMap/tile";
import type { PipelineConfig } from "./types";

// Rocky patches use larger blobs (~10-tile wavelength), sandy patches smaller (~7-tile wavelength).
const ROCKY_SCALE = 0.10;
const SANDY_SCALE = 0.14;

const ROCKY_FRACTION = 0.6;
const SANDY_FRACTION = 0.4;

function noiseThreshold(chance: number): number {
  return Math.max(-0.9, 0.75 - chance * 3.0);
}

export function stage12_surfacePatches(
  tiles: Tile[][],
  config: PipelineConfig,
): void {
  const { seed, surfacePatchChance, biomes } = config;

  const rockyNoise = createNoise2D(createRand(seed + "_rocky").next);
  const sandyNoise = createNoise2D(createRand(seed + "_sandy").next);

  const rockyThreshold = noiseThreshold(surfacePatchChance * ROCKY_FRACTION);
  const sandyThreshold = noiseThreshold(surfacePatchChance * SANDY_FRACTION);

  const aridBiomeIds = new Set(
    biomes.filter((b) => b.precipitationRange[1] <= 0.20).map((b) => b.id),
  );

  for (const col of tiles) {
    for (const tile of col) {
      if (tile.water) continue;
      if (aridBiomeIds.has(tile.biomeId)) continue;

      const tx = tile.index.x;
      const ty = tile.index.y;

      if (rockyNoise(tx * ROCKY_SCALE, ty * ROCKY_SCALE) > rockyThreshold) {
        tile.surfaceType = "rocky";
      } else if (sandyNoise(tx * SANDY_SCALE, ty * SANDY_SCALE) > sandyThreshold) {
        tile.surfaceType = "sandy";
      }
    }
  }
}
