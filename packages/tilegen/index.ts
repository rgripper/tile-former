export type { Biome } from "./tile/Biome.ts";
export type { Tile } from "./tile/tile.ts";
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
export { biomes } from "./tile/biomes.ts";
