import type { TileProperties } from "./TileProperties";

export type Tile = TileProperties & {
  biomeId: number;
  index: { x: number; y: number };
};
