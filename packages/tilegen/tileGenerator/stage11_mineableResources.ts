// Stage 11 — Mineable resource placement [tile scale]
// Spec: BIOME_LOCAL_PIPELINE.md
//
// Places mineable resource deposits using per-resource base rates scaled by rock-type affinity.
// Each resource type gets an independent simplex noise map. When multiple resources
// qualify on the same tile, the rarest (lowest base rate) wins.
//
//   effectiveRate = mineableResourceRates[mineableResource] × rockType.mineableResourceAffinities[mineableResource]
//   threshold     = 0.75 − (effectiveRate × 3.0)
//   tile.mineableResource = rarest resource whose noise(x, y) > threshold
//
// Rock-type affinities are defined in tileMap/rockTypes.ts.

import type { Tile } from "../tile/tile";
import type { PipelineConfig } from "./types";
import { clamp, makeNoise2D } from "./utils";
import { getRockType } from "../tile/rockTypes";

const MINEABLE_RESOURCE_TILE_SCALE = 0.12;

// Convert a desired coverage fraction to a simplex-noise threshold.
// Simplex noise is approximately normal with stddev ~0.35.
function noiseThreshold(chance: number): number {
  return Math.max(-0.9, 0.75 - chance * 3.0);
}

export function stage11_mineableResources(tiles: Tile[][], config: PipelineConfig): void {
  const { seed, mineableResourceRates } = config;
  const entries = Object.entries(mineableResourceRates) as Array<[string, number]>;
  if (entries.length === 0) return;

  // Sort ascending by base rate so the rarest resource is checked first and wins conflicts.
  const sorted = [...entries].sort(([, a], [, b]) => a - b);

  const noiseByResource = new Map(
    sorted.map(([resourceId]) => [resourceId, makeNoise2D(seed + "_mineableResource_" + resourceId)]),
  );

  for (const col of tiles) {
    for (const tile of col) {
      if (tile.water) continue;

      const { mineableResourceAffinities } = getRockType(tile.rockType);

      for (const [resourceId, baseRate] of sorted) {
        const affinity = mineableResourceAffinities[resourceId] ?? 1.0;
        const effectiveRate = clamp(baseRate * affinity, 0, 1);
        if (effectiveRate <= 0) continue;

        const threshold = noiseThreshold(effectiveRate);
        const noise = noiseByResource.get(resourceId)!;

        if (
          noise(tile.index.x * MINEABLE_RESOURCE_TILE_SCALE, tile.index.y * MINEABLE_RESOURCE_TILE_SCALE) >
          threshold
        ) {
          tile.mineableResource = resourceId;
          break; // rarest resource already wins; stop checking cheaper ones
        }
      }
    }
  }
}
