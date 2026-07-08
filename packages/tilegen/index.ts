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
export { dressTileMap } from "./tileDresser/pipeline.ts";
export { biomes } from "./tile/biomes.ts";
export type { RockTypeId, RockTypeDef } from "./tile/rockTypes.ts";
export { rockTypes, getRockType, ALL_ROCK_TYPE_IDS } from "./tile/rockTypes.ts";
export type { TileProperties } from "./tile/TileProperties.ts";
