import type { Tile } from "../tile/tile";
import type { PipelineConfig } from "../tileGenerator/types";
import { stage1_surfacePatches } from "./stage1_surfacePatches";
import { stage2_treeSuitability } from "./stage2_treeSuitability";
import { stage3_bushSuitability } from "./stage3_bushSuitability";
import { stage4_vegPlacement } from "./stage4_vegPlacement";

export function dressTileMap(tiles: Tile[][], config: PipelineConfig): void {
  stage1_surfacePatches(tiles, config);
  stage2_treeSuitability(tiles, config);
  stage3_bushSuitability(tiles, config);
  stage4_vegPlacement(tiles, config);
}

// developing the idea here: https://claude.ai/chat/2b033004-7dd3-4566-8f0c-b54332f304d8