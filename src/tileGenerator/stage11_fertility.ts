import type { Tile } from "../tileMap/tile";
import type { PipelineConfig } from "./types";
import { clamp, lerp } from "./utils";
import { getRockType } from "../tileMap/rockTypes";

export function stage11_fertility(tiles: Tile[][], _config: PipelineConfig): void {
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

      // Surface overrides: exposed rock and sand have little to no soil.
      if (tile.surfaceType === "rocky") fertility *= 0.25;
      else if (tile.surfaceType === "sandy") fertility *= 0.45;

      tile.fertility = clamp(fertility, 0, 1);
    }
  }
}
