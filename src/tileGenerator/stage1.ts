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
        biomeId: 0,
      };
    }
  }
  return grid;
}
