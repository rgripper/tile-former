type Biome = {
  name: string;
  temperatureRange: [number, number];
  moistureRange: [number, number];
  lightRange: [number, number];
};

type Plant = {
  name: string;
  temperatureRange: readonly [number, number];
  moistureRange: readonly [number, number];
  lightRange: readonly [number, number];
};

const biomes: Biome[] = [
  {
    name: "Tropical Rainforest",
    temperatureRange: [22, 30],
    moistureRange: [3, 4],
    lightRange: [3, 4],
  },
  {
    name: "Savanna",
    temperatureRange: [20, 35],
    moistureRange: [2, 3],
    lightRange: [3, 4],
  },
  {
    name: "Desert",
    temperatureRange: [25, 45],
    moistureRange: [1, 2],
    lightRange: [3, 4],
  },
  {
    name: "Temperate Forest",
    temperatureRange: [5, 25],
    moistureRange: [2, 4],
    lightRange: [2, 4],
  },
  {
    name: "Tundra",
    temperatureRange: [-10, 10],
    moistureRange: [2, 3],
    lightRange: [1, 3],
  },
  {
    name: "Taiga (Boreal Forest)",
    temperatureRange: [-10, 15],
    moistureRange: [2, 3],
    lightRange: [1, 3],
  },
];

export function classifyPlantBiome(
  plant: Plant,
  biomes: Biome[]
): { biome: string; confidence: number }[] {
  let scores: { biome: string; confidence: number }[] = [];

  for (const biome of biomes) {
    let score = 0;

    // Temperature overlap
    const tempOverlap = Math.max(
      0,
      Math.min(plant.temperatureRange[1], biome.temperatureRange[1]) -
        Math.max(plant.temperatureRange[0], biome.temperatureRange[0])
    );
    score += tempOverlap;

    // Moisture overlap
    const moistureOverlap = Math.max(
      0,
      Math.min(plant.moistureRange[1], biome.moistureRange[1]) -
        Math.max(plant.moistureRange[0], biome.moistureRange[0])
    );
    score += moistureOverlap * 2; // Moisture is weighted higher for biome classification

    // Light overlap
    const lightOverlap = Math.max(
      0,
      Math.min(plant.lightRange[1], biome.lightRange[1]) -
        Math.max(plant.lightRange[0], biome.lightRange[0])
    );
    score += lightOverlap;

    if (score > 0) {
      scores.push({ biome: biome.name, confidence: score });
    }
  }

  // Normalize scores to percentage
  const maxScore = Math.max(...scores.map((s) => s.confidence), 1);
  scores = scores.map((s) => ({
    biome: s.biome,
    confidence: s.confidence / maxScore,
  }));

  // Sort by confidence
  return scores.sort((a, b) => b.confidence - a.confidence);
}
