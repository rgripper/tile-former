import { gridSize } from "./config.ts";
import { CustomRand } from "./rand.ts";
import { Tile } from "./tile.ts";

export const tileTypes = [{ id: 0, name: "Grass" } as const];

export function generateTileMap(rand: {
  next: () => number;
  intBetween: (min: number, exclusiveMax: number) => number;
  arrayIndex: (arr: unknown[]) => number;
}) {
  return Iterator.range(0, gridSize.height)
    .map((y) =>
      Iterator.range(0, gridSize.width)
        .map((x) => generateTile({ x, y, rand }))
        .toArray()
    )
    .toArray();
}
// the sum of all components should be 1
function generateSoilComponents(rand: CustomRand) {
  const sand = rand.next();
  const silt = rand.next();
  const clay = rand.next();
  const organic = rand.next();
  const total = sand + silt + clay + organic;

  return {
    sand: sand / total,
    silt: silt / total,
    clay: clay / total,
    organic: organic / total,
  };
}
function generateTile({
  x,
  y,
  rand,
}: {
  x: number;
  y: number;
  rand: CustomRand;
}): Tile {
  return {
    index: { x, y },
    soilComponents: generateSoilComponents(rand),
    typeId: tileTypes[0].id,
  };
}
