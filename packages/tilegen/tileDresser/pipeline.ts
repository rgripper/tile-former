import type { Tile } from "../tile/tile";
import type { PipelineConfig } from "../tileGenerator/types";
import { stage1_surfacePatches } from "./stage1_surfacePatches";

export function dressTileMap(tiles: Tile[][], config: PipelineConfig): void {
  stage1_surfacePatches(tiles, config);
}

// developing the idea here: https://claude.ai/chat/2b033004-7dd3-4566-8f0c-b54332f304d8