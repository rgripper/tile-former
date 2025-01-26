import { createRand } from "@/rand.ts";
import { gridSize } from "../config.ts";
import { Tile } from "./tile.ts";
import { createNoise2D, NoiseFunction2D } from "simplex-noise";
import { biomes } from "./biomes.ts";
import { BiomeClassifier } from "./BiomeClassifier.ts";
import { TileProperties } from "./TileProperties.ts";
import { classifyTile } from "./classifyTile.ts";

export const tileTypes = [
  // we use luminosity-adjusted colors
  { id: 0, name: "Grass", color: "#4CAF50" },
  { id: 1, name: "Sand", color: "#f2d2a9" },
  { id: 2, name: "Rock", color: "#BDBDBD" },
];

type Point = { x: number; y: number };

type OverlayNoises = [NoiseFunction2D, NoiseFunction2D, NoiseFunction2D];

export function generateTileMap() {
  const baseTileProperties = {
    temperature: 20,
    moisture: 2.5 / 4,
    light: 2.2 / 4,
    altitude: 1 / 4,
    seasonality: 1 / 4,
  };
  const noises = Iterator.range(0, 3)
    .map((x) => "abc" + x)
    .map((seed) => createRand(seed))
    .map((rand) => createNoise2D(rand.next))
    .toArray() as OverlayNoises;

  return Iterator.range(0, gridSize.width)
    .map((x) =>
      Iterator.range(0, gridSize.height)
        .map((y) => generateTile({ x, y }, baseTileProperties, noises))
        .toArray()
    )
    .toArray();
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

// the sum of all components should be 1
function generateTileOverlay(
  point: Point,
  [temperatureNoise, moistureNoise]: [NoiseFunction2D, NoiseFunction2D]
): TileOverlay {
  return {
    temperatureModifier: (t) =>
      t + t * temperatureNoise(point.x, point.y) * 0.01,
    moistureModifier: (t) => clamp(t + 0.02 * moistureNoise(point.x, point.y)),
  };
}

type TileOverlay = {
  temperatureModifier: (value: number) => number;
  moistureModifier: (value: number) => number;
};

function generateTile(
  index: Point,
  baseTileProperties: TileProperties,
  [biomeGuessNoise, ...otherNoises]: OverlayNoises
): Tile {
  const tileOverlay = generateTileOverlay(index, otherNoises);
  const tileProperties = {
    ...baseTileProperties,
    temperature: tileOverlay.temperatureModifier(
      baseTileProperties.temperature
    ),
    moisture: tileOverlay.moistureModifier(baseTileProperties.moisture),
  };

  const biomeGuesses = classifyTile(biomes, tileProperties, 3);
  const totalConfidence = biomeGuesses.reduce(
    (sum, guess) => sum + guess.confidence,
    0
  );
  const randomValue =
    ((biomeGuessNoise(index.x, index.y) + 1) / 2) * totalConfidence;

  let accumulatedConfidence = 0;
  const biomeGuessPick = biomeGuesses.find((guess) => {
    accumulatedConfidence += guess.confidence;
    return accumulatedConfidence >= randomValue;
  });

  return {
    ...tileProperties,
    index,
    biomeGuesses,
    biome: biomeGuessPick?.biome || biomeGuesses[0].biome,
  };
}
