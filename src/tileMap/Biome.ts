export interface Biome {
  name: string;
  id: number;
  textureColor: string;
  temperatureRange: [number, number];
  moistureRange: [number, number];
  lightRange: [number, number];
  altitudeRange: [number, number];
  seasonalityRange: [number, number];
}
