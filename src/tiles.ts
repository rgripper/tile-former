// Tile definition
export type Tile = {
  tileTypeId: number;
  x: number;
  y: number;
};

type TileType = {
  id: number;
  name: string;
  color: string;
  textureSection: { x: number; y: number };
};

const tileNamesAndColors = [
  { name: "taiga forest", color: "#808080" }, // Dark gray
  { name: "taiga wetland", color: "#C0C0C0" }, // Light gray
  { name: "taiga moss", color: "#A9A9A9" }, // Medium gray
  { name: "temperate forest", color: "#BDB76B" }, // Light brown
  { name: "temperate wetland", color: "#F2E8CF" }, // Light beige
  { name: "tropical forest", color: "#C792EA" }, // Light pink
  { name: "tropical flooded forest", color: "#D3D3D3" }, // Light gray
  { name: "grassland", color: "#90EE90" }, // Light green
  { name: "shrubland", color: "#404040" }, // Dark gray
  //
  { name: "riparian zone", color: "#FFFFFF" }, // White
  { name: "stream", color: "#C0C0C0" }, // Light gray
  { name: "lake", color: "#00B7CC" }, // Light blue
  { name: "river", color: "#477AC1" }, // Medium blue
  //
  { name: "rocky", color: "#A9A9A9" }, // Medium gray
  //
  { name: "sand", color: "#E0C099" }, // Light yellow
  { name: "sand dune", color: "#D2B48C" }, // Tan
  { name: "dry salt flat", color: "#F2E8CF" }, // Light beige
] as const;

export const createTileTypes = (size: number) =>
  tileNamesAndColors.map(({ name, color }, i) => ({
    id: i,
    name,
    color,
    textureSection: { x: 0, y: i * size },
  }));

// Function to get the bitmap for a tile type
export function createTextureAtlas(
  tileTypes: TileType[],
  tileSize: number
): OffscreenCanvas {
  const offscreenCanvas = new OffscreenCanvas(
    tileSize,
    tileTypes.length * tileSize
  );
  const ctx = offscreenCanvas.getContext(
    "2d"
  ) as OffscreenCanvasRenderingContext2D;

  tileTypes.forEach((tileType, i) => {
    ctx.fillStyle = tileType.color;
    ctx.fillRect(
      tileType.textureSection.x,
      tileType.textureSection.y,
      tileSize,
      tileSize
    );

    ctx.strokeStyle = "gray";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      tileType.textureSection.x,
      tileType.textureSection.y,
      tileSize,
      tileSize
    );
  });

  return offscreenCanvas;
}

// Function to render the entire grid
export function drawGrid({
  ctx,
  textureAtlas,
  gridSize,
  grid,
  tileSize,
  tileTypes,
}: {
  ctx: CanvasRenderingContext2D;
  textureAtlas: OffscreenCanvas;
  gridSize: { width: number; height: number };
  grid: Tile[][];
  tileSize: number;
  tileTypes: TileType[];
}) {
  //ctx.clearRect(0, 0, grid.length, grid[0].length);

  for (let x = 0; x < gridSize.width; x++) {
    for (let y = 0; y < gridSize.height; y++) {
      const tile = grid[x][y];
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
  tileSize: number,
  selectedTileIndex: { x: number; y: number } | undefined
) {
  if (selectedTileIndex) {
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      selectedTileIndex.x * tileSize,
      selectedTileIndex.y * tileSize,
      tileSize,
      tileSize
    );
  }
}
