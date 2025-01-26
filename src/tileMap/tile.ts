import { Biome } from "./Biome";
import { TileProperties } from "./TileProperties";

export type Tile = TileProperties & {
  biome: Biome;
  index: { x: number; y: number };
};
