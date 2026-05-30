import { createNoise2D } from "simplex-noise";
import { createRand } from "../rand";
import type { PatchCell, PipelineConfig } from "./types";
import { ALL_ROCK_TYPE_IDS } from "../tileMap/rockTypes";

// Low-frequency noise — geology changes slowly across a local world.
const ROCK_SCALE = 0.08;

// Simplex noise stddev ≈ 0.35; threshold of 0.50 gives ~8% per minority type.
const MINORITY_THRESHOLD = 0.50;

export function stage3_rockType(grid: PatchCell[][], config: PipelineConfig): void {
  const { seed, segmentBase } = config;
  const noise = createNoise2D(createRand(seed + "_rock").next);

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
