import { createRand } from "@/rand.ts";
import { gridSize } from "../config.ts";
import { createNoise2D, NoiseFunction2D } from "simplex-noise";
import { biomes } from "./biomes.ts";
import { TileProperties } from "./TileProperties.ts";
import { classifyTile } from "./classifyTile.ts";
import {
  createTileOverlayModifiers,
  OverlayNoises,
} from "./createTileOverlayModifiers.ts";
import {
  growTileClusters,
  pickRandomIndexesSparsely,
} from "./growTileClusters.ts";
import { Tile } from "./tile.ts";

export type Point = { x: number; y: number };

function generateBaseTileMap() {
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

  const applyModifiers = createTileOverlayModifiers({
    temperatureNoise: noises[1],
    moistureNoise: noises[2],
  });
  return Iterator.range(0, gridSize.width)
    .map((x) =>
      Iterator.range(0, gridSize.height)
        .map((y) => ({ x, y }))
        .map((index) => ({
          index,
          ...baseTileProperties,
          ...applyModifiers(index, baseTileProperties),
        }))
        .toArray()
    )
    .toArray();
}

export function generateTileMap() {
  const baseTileMap = generateBaseTileMap();

  const rand = createRand("hahaha");
  const noises = Iterator.range(0, 2)
    .map((x) => "def" + x)
    .map((seed) => createRand(seed))
    .map((rand) => createNoise2D(rand.next))
    .toArray() as OverlayNoises;

  const numberOfPoints = 5;
  const minimalDistance =
    (baseTileMap.length / baseTileMap.length +
      baseTileMap[0].length / numberOfPoints) /
    2;
  const startIndexes = pickRandomIndexesSparsely({
    count: numberOfPoints,
    next: () => {
      return {
        x: Math.floor(rand.next() * baseTileMap.length),
        y: Math.floor(rand.next() * baseTileMap[0].length),
      };
    },
    minimumDistance: minimalDistance,
  });

  return growTileClusters(
    baseTileMap,
    (index) => pickBiomeIndex(index, baseTileMap[index.x][index.y], noises[0]),
    () => rand.next(),
    startIndexes
  ) satisfies Tile[][];
}

function pickBiomeIndex(
  index: Point,
  tileProperties: TileProperties,
  biomeGuessNoise: NoiseFunction2D
): number {
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

  return biomeGuessPick?.biomeId || biomeGuesses[0].biomeId;
}
