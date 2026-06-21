import type { PipelineConfig } from "./types";
import type { Tile } from "../tile/tile";
import { stage1_initGrid } from "./stage1";
import { stage2_noiseAxes } from "./stage2";
import { stage3_rockType } from "./stage3_rockType";
import { stage4_gradientAxes } from "./stage4_gradientAxes";
import { stage5_blendBorders } from "./stage5_blendBorders";
import { stage6_selectBiomes } from "./stage6_selectBiomes";
import { stage7_caSmoothing } from "./stage7_caSmoothing";
import { stage8_expandTiles } from "./stage8_expandTiles";
import { stage9_drainageCluster } from "./stage9_drainageCluster";
import { stage10_fertility } from "./stage10_fertility";
import { stage11_mineableResources } from "./stage11_mineableResources";
import { stage12_groundLight } from "./stage12_groundLight";

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
  stage10_fertility(tiles, config);
  stage11_mineableResources(tiles, config);
  stage12_groundLight(tiles);
  return tiles;
}
