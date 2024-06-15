import Quadtree from "@timohausmann/quadtree-js";

export const tileTree = new Quadtree(
  {
    x: 0,
    y: 0,
    width: 800,
    height: 600,
  },
  15,
  6
);

export function getIndexesInRadius(
  tree: Quadtree,
  radius: number,
  maxGranularity: number
): TileIndex[] {
  const { width, height } = tileMapSize;
  const indexes: TileIndex[] = [];
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      if (x * x + y * y <= radius * radius) {
        indexes.push([x + width / 2, y + height / 2]);
      }
    }
  }
  return indexes;
}
