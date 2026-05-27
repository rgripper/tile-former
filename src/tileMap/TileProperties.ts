export type TileProperties = {
  temperature: number;
  precipitation: number;
  drainage: number;
  light: number;
  altitude: number;
  seasonality: number;
  effectiveMoisture: number;
  continentality: number;
  water: boolean;
  waterType: "pond" | undefined;
  surfaceType: "rocky" | "sandy" | undefined;
  riparian: boolean;
};
