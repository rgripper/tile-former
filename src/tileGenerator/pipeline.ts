export type { SegmentBase, SegmentNeighbors, PipelineConfig } from "./types";
export { defaultSegmentBase, defaultPipelineConfig } from "./types";

import type { PipelineConfig } from "./types";
import type { Tile } from "../tileMap/tile";
import { stage1_initGrid } from "./stage1";
import { stage2_noiseAxes } from "./stage2";
import { stage3_rockType } from "./stage3_rockType";
import { stage4_gradientAxes } from "./stage4_gradientAxes";
import { stage5_blendBorders } from "./stage5_blendBorders";
import { stage6_selectBiomes } from "./stage6_selectBiomes";
import { stage7_caSmoothing } from "./stage7_caSmoothing";
import { stage8_expandTiles } from "./stage8_expandTiles";
import { stage9_drainageCluster } from "./stage9_drainageCluster";
import { stage10_surfacePatches } from "./stage10_surfacePatches";
import { stage11_fertility } from "./stage11_fertility";
import { stage12_ore } from "./stage12_ore";

export function generateTileMap(config: PipelineConfig): Tile[][] {
  const grid = stage1_initGrid(config);
  stage2_noiseAxes(grid, config);
  stage3_rockType(grid, config);
  stage4_gradientAxes(grid);
  stage5_blendBorders(grid, config);
  stage6_selectBiomes(grid);
  stage7_caSmoothing(grid, config.biomes);
  const tiles = stage8_expandTiles(grid, config);
  stage9_drainageCluster(tiles, config);
  stage10_surfacePatches(tiles, config);
  stage11_fertility(tiles, config);
  stage12_ore(tiles, config);
  return tiles;
}
