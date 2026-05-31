// Stage 11 — Ore placement [tile scale]
// Spec: BIOME_LOCAL_PIPELINE.md
//
// Places ore deposits using per-ore base rates scaled by rock-type affinity.
// Each ore type gets an independent simplex noise map. When multiple ores
// qualify on the same tile, the rarest (lowest base rate) wins.
//
//   effectiveRate = oreRates[ore] × rockType.oreAffinities[ore]
//   threshold     = 0.75 − (effectiveRate × 3.0)
//   tile.ore      = rarest ore whose noise(x, y) > threshold
//
// Rock-type affinities are defined in tileMap/rockTypes.ts.

import type { Tile } from "../tileMap/tile";
import type { PipelineConfig } from "./types";
import { clamp, makeNoise2D } from "./utils";
import { getRockType } from "../tileMap/rockTypes";

const ORE_TILE_SCALE = 0.12;

// Convert a desired coverage fraction to a simplex-noise threshold.
// Simplex noise is approximately normal with stddev ~0.35.
function noiseThreshold(chance: number): number {
  return Math.max(-0.9, 0.75 - chance * 3.0);
}

export function stage11_ore(tiles: Tile[][], config: PipelineConfig): void {
  const { seed, oreRates } = config;
  const entries = Object.entries(oreRates) as Array<[string, number]>;
  if (entries.length === 0) return;

  // Sort ascending by base rate so the rarest ore is checked first and wins conflicts.
  const sorted = [...entries].sort(([, a], [, b]) => a - b);

  const noiseByOre = new Map(
    sorted.map(([oreId]) => [oreId, makeNoise2D(seed + "_ore_" + oreId)]),
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
