export const tileSide = 64;
export const tileHeight = tileSide;
export const tileWidth = tileHeight * 2;
export const gridSize = { width: 200, height: 200 };
export const canvasSize = { width: 1024, height: 640 };

import Rand from "rand-seed";

export type CustomRand = ReturnType<typeof createRand>;

export function createRand(input: string) {
  const rand = new Rand(input);
  const intBetween = ((min: number, exclusiveMax: number) =>
    Math.round(rand.next() * (exclusiveMax - 1 - min) + min)).bind(rand);
  return {
    next: () => rand.next(),
    intBetween,
    arrayIndex: (arr: unknown[]) => intBetween(0, arr.length),
  };
}

export const defaultRandSeed = "1234";
