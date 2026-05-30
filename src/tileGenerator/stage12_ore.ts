import { createNoise2D } from "simplex-noise";
import { createRand } from "../rand";
import type { Tile } from "../tileMap/tile";
import type { PipelineConfig } from "./types";
import { clamp } from "./utils";
import { getRockType } from "../tileMap/rockTypes";

const ORE_TILE_SCALE = 0.12;

// Convert a desired coverage fraction to a simplex-noise threshold.
// Simplex noise is approximately normal with stddev ~0.35.
function noiseThreshold(chance: number): number {
  return Math.max(-0.9, 0.75 - chance * 3.0);
}

export function stage12_ore(tiles: Tile[][], config: PipelineConfig): void {
  const { seed, oreRates } = config;
  const entries = Object.entries(oreRates) as Array<[string, number]>;
  if (entries.length === 0) return;

  // Sort ascending by base rate so the rarest ore is checked first and wins conflicts.
  const sorted = [...entries].sort(([, a], [, b]) => a - b);

  const noiseByOre = new Map(
    sorted.map(([oreId]) => [
      oreId,
      createNoise2D(createRand(seed + "_ore_" + oreId).next),
    ]),
  );

  for (const col of tiles) {
    for (const tile of col) {
      if (tile.water) continue;

      const { oreAffinities } = getRockType(tile.rockType);

      for (const [oreId, baseRate] of sorted) {
        const affinity = oreAffinities[oreId] ?? 1.0;
        const effectiveRate = clamp(baseRate * affinity, 0, 1);
        if (effectiveRate <= 0) continue;

        const threshold = noiseThreshold(effectiveRate);
        const noise = noiseByOre.get(oreId)!;

        if (noise(tile.index.x * ORE_TILE_SCALE, tile.index.y * ORE_TILE_SCALE) > threshold) {
          tile.ore = oreId;
          break; // rarest ore already wins; stop checking cheaper ores
        }
      }
    }
  }
}
