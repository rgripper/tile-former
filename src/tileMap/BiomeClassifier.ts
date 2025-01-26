import { Biome } from "./Biome";
import { TileProperties } from "./TileProperties";

export class BiomeClassifier {
  private biomes: Biome[];

  constructor(biomes: Biome[]) {
    this.biomes = biomes;
  }

  // Fuzzy matching function to determine how well a value fits a range
  private calculateFitScore(value: number, range: [number, number]): number {
    const [min, max] = range;

    // If value is within the range, return 1
    if (value >= min && value <= max) return 1;

    // Calculate partial match for values slightly outside the range
    const buffer = 0.5; // Allow 0.5 units of flexibility
    if (value < min - buffer || value > max + buffer) return 0;

    // Linear interpolation for partial matches
    if (value < min) {
      return 1 - (min - value) / buffer;
    }
    return 1 - (value - max) / buffer;
  }

  // Classify a tile with fuzzy matching
  classifyTile(tile: TileProperties): { biome: string; confidence: number } {
    const scores = this.biomes.map((biome) => {
      const confidenceScores = [
        this.calculateFitScore(tile.temperature, biome.temperatureRange),
        this.calculateFitScore(tile.moisture, biome.moistureRange),
        this.calculateFitScore(tile.light, biome.lightRange),
        this.calculateFitScore(tile.altitude, biome.altitudeRange),
        this.calculateFitScore(tile.seasonality, biome.seasonalityRange),
      ];

      // Calculate overall confidence as the geometric mean of individual scores
      const confidence = Math.pow(
        confidenceScores.reduce((a, b) => a * b, 1),
        1 / confidenceScores.length
      );

      return { biome: biome.name, confidence };
    });

    // Sort by confidence in descending order and return the top match
    return scores.sort((a, b) => b.confidence - a.confidence)[0];
  }
}
