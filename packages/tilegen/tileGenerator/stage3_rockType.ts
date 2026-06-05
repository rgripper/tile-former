// Stage 3 — Rock type [patch scale]
// Spec: BIOME_LOCAL_PIPELINE.md
//
// Assigns a rock type to each patch. The segment's dominantRockType anchors
// the local geology; a single low-frequency noise map introduces minority patches
// (~16 % total coverage split across two minority types) for gameplay variety.
// Rock-type properties (permeability, fertilityBase, mineableResourceAffinities) live in
// tileMap/rockTypes.ts.

import type { PatchCell, PipelineConfig } from "./types";
import { makeNoise2D } from "./utils";
import { ALL_ROCK_TYPE_IDS } from "../tile/rockTypes";

// Low-frequency noise — geology changes slowly across a local world.
const ROCK_SCALE = 0.08;

// Simplex noise stddev ≈ 0.35; threshold of 0.50 gives ~8% per minority type.
const MINORITY_THRESHOLD = 0.5;

export function stage3_rockType(
  grid: PatchCell[][],
  config: PipelineConfig,
): void {
  const { seed, segmentBase } = config;
  const noise = makeNoise2D(seed + "_rock");

  const dominant = segmentBase.dominantRockType;
  const others = ALL_ROCK_TYPE_IDS.filter((id) => id !== dominant);

  for (const col of grid) {
    for (const cell of col) {
      const { x, y } = cell.index;
      const n = noise(x * ROCK_SCALE, y * ROCK_SCALE); // approx [-1, 1]

      if (n > MINORITY_THRESHOLD) {
        cell.rockType = others[0];
      } else if (n < -MINORITY_THRESHOLD) {
        cell.rockType = others[1];
      } else {
        cell.rockType = dominant;
      }
    }
  }
}
