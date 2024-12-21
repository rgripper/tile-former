export type TileType = {
  id: number;
  name: string;
};

export type Tile = {
  typeId: number;
  index: { x: number; y: number };
};
