import type { Tile } from "../tileMap/tile";
import type { RockTypeId } from "../tileMap/rockTypes";
import type { PipelineConfig } from "./types";

// Sediment-forming rocks weather into granular/sandy surface material.
const SANDY_ROCK_TYPES = new Set<RockTypeId>(["sedimentary", "limestone"]);

// Fraction of the surfacePatchChance budget allocated to each type.
const ROCKY_FRACTION = 0.6;
const SANDY_FRACTION = 0.4;

export function stage12_surfacePatches(
  tiles: Tile[][],
  config: PipelineConfig,
): void {
  const { surfacePatchChance, biomes } = config;

  // Rocky: exposed bedrock score = low fertility (thin soil) + drainage contribution.
  // Threshold at chance=0.5 → 0.65, calibrated so cold/dry granite qualifies,
  // warm/moist basalt does not.
  const rockyThreshold = 0.80 - surfacePatchChance * ROCKY_FRACTION * 0.5;

  // Sandy: sedimentary/limestone + well-drained + not waterlogged.
  // surfacePatchChance widens both bounds to include gentler slopes and wetter tiles.
  const sandyDrainageFloor = 0.45 - surfacePatchChance * SANDY_FRACTION * 0.25;
  const sandyMoistureCeiling = 0.25 + surfacePatchChance * SANDY_FRACTION * 0.60;

  const aridBiomeIds = new Set(
    biomes.filter((b) => b.precipitationRange[1] <= 0.20).map((b) => b.id),
  );

  for (const col of tiles) {
    for (const tile of col) {
      if (tile.water) continue;
      if (aridBiomeIds.has(tile.biomeId)) continue;

      // Sandy-forming rocks are checked first: sedimentary/limestone that is
      // well-drained and not waterlogged weathers into granular surface material.
      // (Checking after rocky would misclassify these tiles — their low fertility
      // from dry/cold conditions pushes the rocky score above threshold too.)
      if (
        SANDY_ROCK_TYPES.has(tile.rockType) &&
        tile.drainage > sandyDrainageFloor &&
        tile.effectiveMoisture < sandyMoistureCeiling
      ) {
        tile.surfaceType = "sandy";
        continue;
      }

      // Rocky: hard/impermeable rock with thin or absent soil cover.
      const rockyScore = (1 - tile.fertility) * 0.7 + tile.drainage * 0.3;
      if (rockyScore > rockyThreshold) {
        tile.surfaceType = "rocky";
      }
    }
  }
}
