// Tile definition
export type Tile = {
  tileTypeId: number;
  x: number;
  y: number;
};

type TileType = {
  id: number;
  name: string;
  textureSection: { x: number; y: number };
};

// Tile type list with functions to generate bitmaps
export const tileNames = [
  "taiga forest",
  "taiga wetland",
  "taiga moss",
  "temperate forest",
  "temperate wetland",
  "tropical forest",
  "tropical flooded forest",
  "grassland",
  "shrubland",
  //
  "riparian zone",
  "stream", // no penalty to crossing, special abilities
  "lake", // no flow
  "river",
  //
  "rocky", // quarries? mines? special between different biomes?
  //
  "sand",
  "sand dune", // same as sand but with (more) movement penalties
  "dry salt flat",
] as const; // Mark tiles as readonly constant tuple

export const createTileTypes = (size: number) =>
  tileNames.map((name, i) => ({
    id: i,
    name,
    textureSection: { x: 0, y: i * size },
  }));

const colors = [
  "#F08080",
  "#ADD8E6",
  "#D2B48C",
  "#9ACD32",
  "#FFD700",
  "#FF00FF",
  "#800080",
  "#00FFFF",
  "#000000",
  "#FFFFFF",
];
// Function to get the bitmap for a tile type
export function createTextureAtlas(
  tileTypes: TileType[],
  tileSize: number
): ImageBitmap {
  const offscreenCanvas = new OffscreenCanvas(
    tileSize,
    tileTypes.length * tileSize
  );
  const ctx = offscreenCanvas.getContext(
    "2d"
  ) as OffscreenCanvasRenderingContext2D;

  tileTypes.forEach((tileType, i) => {
    ctx.fillStyle = colors[i];
    ctx.fillRect(
      tileType.textureSection.x,
      tileType.textureSection.y,
      tileSize,
      tileSize
    );
  });

  return offscreenCanvas.transferToImageBitmap();
}

// Function to render the entire grid
export function drawGrid({
  ctx,
  textureAtlas,
  grid,
  tileSize,
  tileTypes,
}: {
  ctx: CanvasRenderingContext2D;
  textureAtlas: ImageBitmap;
  grid: Tile[][];
  tileSize: number;
  tileTypes: TileType[];
}) {
  //ctx.clearRect(0, 0, grid.length, grid[0].length);
  const numCols = grid[0].length;
  const numRows = grid.length;
  for (let y = 0; y < numRows; y++) {
    for (let x = 0; x < numCols; x++) {
      const tile = grid[y][x];
      const tileType = tileTypes[tile.tileTypeId];
      ctx.drawImage(
        textureAtlas,
        tileType.textureSection.x,
        tileType.textureSection.y,
        tileSize,
        tileSize,
        x * tileSize,
        y * tileSize,
        tileSize,
        tileSize
      );

      // ctx.strokeStyle = "lightgray";
      // ctx.lineWidth = 1;
      // ctx.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }
  }

  // if (selectedTileIndex) {
  //   ctx.strokeStyle = "red";
  //   ctx.lineWidth = 1;
  //   ctx.fillStyle = "blue";

  //   ctx.strokeRect(
  //     selectedTileIndex.x * tileSize,
  //     selectedTileIndex.y * tileSize,
  //     tileSize,
  //     tileSize
  //   );
  // }

  //ctx.save();
}

export function drawBorders(
  ctx: CanvasRenderingContext2D,
  gridSize: { width: number; height: number },
  tileSize: number,
  selectedTileIndex: { x: number; y: number } | undefined
) {
  for (let y = 0; y < gridSize.height; y++) {
    for (let x = 0; x < gridSize.width; x++) {
      ctx.strokeStyle = "lightgray";
      ctx.lineWidth = 2;
      ctx.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }
  }

  if (selectedTileIndex) {
    ctx.strokeStyle = "red";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      selectedTileIndex.x * tileSize,
      selectedTileIndex.y * tileSize,
      tileSize,
      tileSize
    );
  }
}
