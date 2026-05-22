import { createRand } from "@/rand.ts";
import { gridSize } from "../config.ts";
import { createNoise2D } from "simplex-noise";
import { biomes } from "./biomes.ts";
import { TileProperties } from "./TileProperties.ts";
import { classifyTile } from "./classifyTile.ts";
import { createTileOverlayModifiers } from "./createTileOverlayModifiers.ts";
import { resolveTiles, pickRandomIndexesSparsely } from "./growTileClusters.ts";
import { Tile } from "./tile.ts";

export type Point = { x: number; y: number };

export type MapGenParams = {
  base: TileProperties;
  swing: TileProperties;
};

export const defaultMapGenParams: MapGenParams = {
  base: {
    temperature: 20,
    moisture: 2.5 / 4,
    light: 2.2 / 4,
    altitude: 1 / 4,
    seasonality: 1 / 4,
  },
  swing: {
    temperature: 2,
    moisture: 0.05,
    light: 0,
    altitude: 0,
    seasonality: 0,
  },
};

function generateBaseTileMap(params: MapGenParams) {
  const makeNoise = (seed: string) => createNoise2D(createRand(seed).next);
  const noises = {
    temperature: makeNoise("abc1"),
    moisture: makeNoise("abc2"),
    light: makeNoise("abc3"),
    altitude: makeNoise("abc4"),
    seasonality: makeNoise("abc5"),
  };

  const applyModifiers = createTileOverlayModifiers(noises, params.swing);
  return Iterator.range(0, gridSize.width)
    .map((x) =>
      Iterator.range(0, gridSize.height)
        .map((y) => ({ x, y }))
        .map((index) => ({
          index,
          ...params.base,
          ...applyModifiers(index, params.base),
        }))
        .toArray(),
    )
    .toArray();
}

export function generateTileMap(params: MapGenParams = defaultMapGenParams) {
  const baseTileMap = generateBaseTileMap(params);

  const rand = createRand("hahaha22");

  const numberOfPoints = 20;
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

  const numberOfGuesses = 3;
  resolveTiles(
    baseTileMap as unknown as { biomeId: undefined }[][],
    (index) =>
      classifyTile(biomes, baseTileMap[index.x][index.y], numberOfGuesses),
    () => rand.next(),
    startIndexes,
  );

  return baseTileMap as unknown as Tile[][];
}
