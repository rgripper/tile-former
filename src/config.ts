export const tileSide = 64;
export const tileHeight = tileSide;
export const tileWidth = tileHeight * 2;
export const gridSize = { width: 200, height: 200 };
export const canvasSize = { width: 1024, height: 640 };

import Rand from "rand-seed";

const _rand = new Rand("1234");

export const rand = Object.assign(_rand, {
  intBetween: (min: number, exclusiveMax: number) =>
    Math.round(_rand.next() * (exclusiveMax - 1 - min) + min),
  nextPositiveInt: () => Math.round(_rand.next()),
});
