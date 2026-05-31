// Stage 2 — Local noise layers [patch scale]
// Spec: BIOME_LOCAL_PIPELINE.md
//
// Samples three simplex noise maps at patch centres and adds local variation
// on top of the segment base values:
//   altitude:      base ± 0.15
//   temperature:   base ± 3 °C, then adjusted by altitude lapse rate (−30 °C/unit)
//   precipitation: base ± 0.08
// Seasonality is not perturbed — it is constant across the whole local world.

import type { PatchCell, PipelineConfig } from "./types";
import { clamp, makeNoise2D } from "./utils";

export function stage2_noiseAxes(grid: PatchCell[][], config: PipelineConfig): void {
  const { seed, localNoiseScale: scale, segmentBase } = config;

  const altNoise = makeNoise2D(seed + "_alt");
  const tmpNoise = makeNoise2D(seed + "_tmp");
  const prcNoise = makeNoise2D(seed + "_prc");

  for (const col of grid) {
    for (const cell of col) {
      const { x, y } = cell.index;

      cell.altitude = clamp(
        segmentBase.altitude + altNoise(x * scale, y * scale) * 0.15,
        0,
        1,
      );

      // Temperature: base + local variation ± 3°C − altitude lapse rate.
      // Lapse rate: ~6°C per 1000 m elevation ≈ 30°C per unit altitude.
      const altLapse = (cell.altitude - segmentBase.altitude) * 30;
      cell.temperature =
        segmentBase.temperature +
        tmpNoise(x * scale, y * scale) * 3 -
        altLapse;

      cell.precipitation = clamp(
        segmentBase.precipitation + prcNoise(x * scale, y * scale) * 0.08,
        0,
        1,
      );
    }
  }
}
