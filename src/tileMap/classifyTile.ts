import { Biome } from "./Biome";
import { TileProperties } from "./TileProperties";
interface BiomeGuess {
  biome: Biome;
  confidence: number; // Confidence level as a percentage
}

export function classifyTile(
  biomes: Biome[],
  tile: TileProperties,
  topN: number
): BiomeGuess[] {
  // Helper function to calculate confidence for one parameter
  function calculateConfidence(value: number, range: [number, number]): number {
    const [min, max] = range;
    if (value < min || value > max) return 0; // Out of range
    return (value - min) / (max - min);
  }

  // Compute confidence levels for each biome
  const biomeConfidences = biomes.map((biome) => {
    const tempConfidence = calculateConfidence(
      tile.temperature,
      biome.temperatureRange
    );
    const moistureConfidence = calculateConfidence(
      tile.moisture,
      biome.moistureRange
    );
    const lightConfidence = calculateConfidence(tile.light, biome.lightRange);
    const altitudeConfidence = calculateConfidence(
      tile.altitude,
      biome.altitudeRange
    );
    const seasonalityConfidence = calculateConfidence(
      tile.seasonality,
      biome.seasonalityRange
    );

    // Average the confidence levels to get an overall confidence
    const overallConfidence =
      (tempConfidence +
        moistureConfidence +
        lightConfidence +
        altitudeConfidence +
        seasonalityConfidence) /
      5;

    return { biome, confidence: overallConfidence };
  });

  // Sort by confidence in descending order and pick the top N results
  return biomeConfidences
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, topN);
}
