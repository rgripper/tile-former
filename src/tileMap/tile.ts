export type TileType = {
  id: number;
  name: string;
};

export type SoilComponents = {
  sand: number; // 0-1
  silt: number; // 0-1
  clay: number; // 0-1
  organic: number; // 0-1
};

export type Tile = {
  typeId: number;
  index: { x: number; y: number };
  soilComponents: SoilComponents;
};

export type SoilComponent = keyof SoilComponents;
