export type TileType = {
  id: number;
  name: string;
};

export type SoilComponents = {
  sand: number; // 0-1
  clay: number; // 0-1
  other: number; // 0-1
};

export type Tile = {
  typeId: number;
  index: { x: number; y: number };
  soilComponents: SoilComponents;
  fertility: number; // 0-1
};

export type SoilComponent = keyof SoilComponents;
