import { createRand } from "@/rand.ts";
import { gridSize } from "../config.ts";
import { Tile } from "./tile.ts";
import { createNoise2D, NoiseFunction2D } from "simplex-noise";
export const tileTypes = [{ id: 0, name: "Grass" } as const];

type ComponentNoises = [
  NoiseFunction2D,
  NoiseFunction2D,
  NoiseFunction2D,
  NoiseFunction2D
];

export function generateTileMap() {
  const noises = Iterator.range(0, 4)
    .map((x) => "abc" + x)
    .map((seed) => createRand(seed))
    .map((rand) => createNoise2D(rand.next))
    .map((noise) => (x: number, y: number) => (noise(x, y) + 1) / 2)
    .toArray() as ComponentNoises;

  return Iterator.range(0, gridSize.height)
    .map((y) =>
      Iterator.range(0, gridSize.width)
        .map((x) => generateTile({ x, y }, noises))
        .toArray()
    )
    .toArray();
}

type Point = { x: number; y: number };

// the sum of all components should be 1
function generateSoilComponents(point: Point, noises: ComponentNoises) {
  const sand = noises[0](point.x / 15, point.y / 15);
  const silt = noises[1](point.x / 20, point.y / 20);
  const clay = noises[2](point.x / 17, point.y / 17);
  const organic = noises[3](point.x / 20, point.y / 20);
  const total = sand + silt + clay + organic;
  console.log(sand, silt, clay, organic);
  return {
    sand: sand / total,
    silt: silt / total,
    clay: clay / total,
    organic: organic / total,
  };
}
function generateTile(index: Point, noises: ComponentNoises): Tile {
  return {
    index,
    soilComponents: generateSoilComponents(index, noises),
    typeId: tileTypes[0].id,
  };
}
