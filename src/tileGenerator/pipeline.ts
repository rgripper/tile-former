export type { SegmentBase, SegmentNeighbors, PipelineConfig } from "./types";
export { defaultSegmentBase, defaultPipelineConfig } from "./types";

import type { PipelineConfig } from "./types";
import type { Tile } from "../tileMap/tile";
import { stage1_initGrid } from "./stage1";
import { stage2_noiseAxes } from "./stage2";
import { stage3_gradientAxes } from "./stage3";
import { stage4_blendBorders } from "./stage4";
import { stage5_selectBiomes } from "./stage5";
import { stage6_caSmoothing } from "./stage6";
import { stage7_expandTiles } from "./stage7";
import { stage8_waterFeatures } from "./stage8";

export function generateTileMap(config: PipelineConfig): Tile[][] {
  const grid = stage1_initGrid(config);
  stage2_noiseAxes(grid, config);
  stage3_gradientAxes(grid);
  stage4_blendBorders(grid, config);
  stage5_selectBiomes(grid);
  stage6_caSmoothing(grid, config.biomes);
  const tiles = stage7_expandTiles(grid, config);
  stage8_waterFeatures(tiles, grid, config);
  return tiles;
}
