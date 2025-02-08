import { Biome } from "./Biome.ts";

export const biomes: Biome[] = (
  [
    {
      name: "Tropical Rainforest",
      temperatureRange: [20, 30],
      moistureRange: [3, 4],
      lightRange: [2, 4],
      altitudeRange: [1, 2],
      seasonalityRange: [1, 2],
      textureColor: "#228B22", // ForestGreen
    },
    {
      name: "Tropical Dry Forest",
      temperatureRange: [20, 30],
      moistureRange: [2, 3],
      lightRange: [2, 3],
      altitudeRange: [1, 2],
      seasonalityRange: [2, 3],
      textureColor: "#A0522D", // Sienna
    },
    {
      name: "Savanna",
      temperatureRange: [20, 30],
      moistureRange: [1.5, 2.5],
      lightRange: [2, 4],
      altitudeRange: [1, 2],
      seasonalityRange: [2, 3],
      textureColor: "#FFD700", // Gold
    },
    {
      name: "Desert",
      temperatureRange: [15, 35],
      moistureRange: [1, 1.5],
      lightRange: [3, 4],
      altitudeRange: [1, 2],
      seasonalityRange: [1, 3],
      textureColor: "#EDC9AF", // DesertSand
    },
    {
      name: "Temperate Forest",
      temperatureRange: [5, 20],
      moistureRange: [2.5, 4],
      lightRange: [2, 3],
      altitudeRange: [1, 3],
      seasonalityRange: [2, 4],
      textureColor: "#6B8E23", // OliveDrab
    },
    {
      name: "Grassland",
      temperatureRange: [5, 25],
      moistureRange: [1.5, 2.5],
      lightRange: [2, 4],
      altitudeRange: [1, 3],
      seasonalityRange: [3, 4],
      textureColor: "#7CFC00", // LawnGreen
    },
    {
      name: "Mediterranean",
      temperatureRange: [15, 25],
      moistureRange: [1.5, 2.5],
      lightRange: [3, 4],
      altitudeRange: [1, 2],
      seasonalityRange: [3, 4],
      textureColor: "#FF6347", // Tomato
    },
    {
      name: "Taiga (Boreal Forest)",
      temperatureRange: [-5, 5],
      moistureRange: [2, 3],
      lightRange: [1, 2],
      altitudeRange: [2, 4],
      seasonalityRange: [3, 4],
      textureColor: "#4682B4", // SteelBlue
    },
    {
      name: "Tundra",
      temperatureRange: [-10, 5],
      moistureRange: [1.5, 2.5],
      lightRange: [2, 4],
      altitudeRange: [3, 4],
      seasonalityRange: [3, 4],
      textureColor: "#B0E0E6", // PowderBlue
    },
    {
      name: "Alpine",
      temperatureRange: [-5, 10],
      moistureRange: [2, 3],
      lightRange: [2, 4],
      altitudeRange: [3, 4],
      seasonalityRange: [3, 4],
      textureColor: "#ADD8E6", // LightBlue
    },
  ] satisfies Omit<Biome, "id">[]
).map((biome, index) => ({
  ...biome,
  moistureRange: scaleRange(biome.moistureRange as [number, number]),
  lightRange: scaleRange(biome.lightRange as [number, number]),
  altitudeRange: scaleRange(biome.altitudeRange as [number, number]),
  seasonalityRange: scaleRange(biome.seasonalityRange as [number, number]),
  id: index + 1,
}));

export function scaleRange(
  range: [number, number],
  min: number = 1,
  max: number = 4
): [number, number] {
  return range.map((x) => (x - min) / (max - min)) as [number, number];
}
