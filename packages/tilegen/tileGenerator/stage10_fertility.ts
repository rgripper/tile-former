// Stage 10 — Fertility [tile scale]
// Spec: BIOME_LOCAL_PIPELINE.md
//
// Derives tile.fertility ∈ [0, 1] from rock type, climate, and moisture.
// Water tiles receive fertility = 0.
//
//   tempFactor     = exp(−((temperature − 17) / 20)²)  // bell curve peaking at 17 °C
//   moistureFactor = lerp(0.3, 1.0, min(1, effectiveMoisture × 2))
//   fertility      = rockFertilityBase × tempFactor × moistureFactor
//                    × 1.3  if riparian (sediment and nutrient deposition)

import type { Tile } from "../tileMap/tile";
import type { PipelineConfig } from "./types";
import { clamp, lerp } from "./utils";
import { getRockType } from "../tileMap/rockTypes";

export function stage10_fertility(tiles: Tile[][], _config: PipelineConfig): void {
  for (const col of tiles) {
    for (const tile of col) {
      if (tile.water) {
        tile.fertility = 0;
        continue;
      }

      const { fertilityBase } = getRockType(tile.rockType);

      // Bell curve peaking at ~17°C — too cold or too hot slows decomposition.
      const tNorm = (tile.temperature - 17) / 20;
      const tempFactor = Math.exp(-tNorm * tNorm);

      // More moisture → faster nutrient cycling, up to a saturation point.
      const moistureFactor = lerp(0.3, 1.0, Math.min(1, tile.effectiveMoisture * 2));

      let fertility = fertilityBase * tempFactor * moistureFactor;

      // Riparian zones receive regular sediment and nutrient deposition.
      if (tile.riparian) fertility *= 1.3;

      tile.fertility = clamp(fertility, 0, 1);
    }
  }
}
