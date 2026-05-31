// Stage 1 — Base anchoring [patch scale]
// Spec: BIOME_LOCAL_PIPELINE.md
//
// Initialises every patch cell to the parent segment's stable base values.
// These values set the mean of all local distributions — noise layers add
// variation around them but the mean is fixed, so the local world stays
// ecologically coherent with its parent segment. A Taiga segment will not
// accidentally generate a Desert patch at its centre.

import type { PatchCell, PipelineConfig } from "./types";

export function stage1_initGrid(config: PipelineConfig): PatchCell[][] {
  const { width, height, tilesPerPatch, segmentBase } = config;
  const pw = Math.ceil(width / tilesPerPatch);
  const ph = Math.ceil(height / tilesPerPatch);

  const grid: PatchCell[][] = [];
  for (let x = 0; x < pw; x++) {
    grid[x] = [];
    for (let y = 0; y < ph; y++) {
      grid[x][y] = {
        index: { x, y },
        altitude: segmentBase.altitude,
        temperature: segmentBase.temperature,
        precipitation: segmentBase.precipitation,
        drainage: 0.5,
        light: segmentBase.light,
        rockType: segmentBase.dominantRockType,
        biomeId: 0,
      };
    }
  }
  return grid;
}
