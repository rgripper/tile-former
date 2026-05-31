export type { Biome } from "./tileMap/Biome.ts";
export type { Tile } from "./tileMap/tile.ts";
export type {
  SegmentBase,
  SegmentNeighbors,
  PipelineConfig,
} from "./tileGenerator/types.ts";
export {
  defaultSegmentBase,
  defaultPipelineConfig,
} from "./tileGenerator/types.ts";
export { generateTileMap } from "./tileGenerator/pipeline.ts";
export { biomes } from "./tileMap/biomes.ts";
