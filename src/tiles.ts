// Tile definition
export type Tile = {
  tileTypeId: number;
  x: number;
  y: number;
  center: { x: number; y: number };
};

type TileType = {
  id: number;
  name: string;
  color: string;
  textureCenter: { x: number; y: number };
};

type Point = { x: number; y: number };

export function isometric({ x, y }: Point, width: number): Point {
  // Isometric transformation constants
  const isometricXScale = 0.5;
  const isometricYScale = 0.5;

  // Isometric transformation formula
  const isometricX = width / 2 + (x * isometricXScale - y * isometricXScale);
  const isometricY = 0.5 + (x + y) * isometricYScale;

  return { x: isometricX, y: isometricY };
}

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

export const createTileTypes = (tileWidth: number, tileHeight: number) =>
  tileNamesAndColors.map(({ name, color }, i) => ({
    id: i,
    name,
    color,
    textureCenter: { x: tileWidth / 2, y: (i + 0.5) * tileHeight },
  }));

// Function to get the bitmap for a tile type
export function createTextureAtlas(
  tileTypes: TileType[],
  tileWidth: number,
  tileHeight: number
): OffscreenCanvas {
  const offscreenCanvas = new OffscreenCanvas(
    tileWidth,
    tileTypes.length * tileHeight
  );
  const ctx = offscreenCanvas.getContext(
    "2d"
  ) as OffscreenCanvasRenderingContext2D;

  tileTypes.forEach((tileType) => {
    // ctx.fillStyle = tileType.color;
    // ctx.fillRect(
    //   tileType.textureCenter.x,
    //   tileType.textureCenter.y,
    //   tileSize,
    //   tileSize
    // );
    // ctx.fillStyle = "transparent";
    // ctx.fillRect(
    //   tileType.textureCenter.x - tileWidth / 2,
    //   tileType.textureCenter.y - tileHeight / 2,
    //   tileWidth,
    //   tileHeight
    // );

    ctx.strokeStyle = "gray";
    ctx.lineWidth = 1;
    ctx.fillStyle = tileType.color;

    drawDiamondPath({
      ctx,
      centerX: tileType.textureCenter.x,
      centerY: tileType.textureCenter.y,
      height: tileHeight,
      width: tileWidth,
    });
    ctx.fill();
    ctx.stroke();
  });

  return offscreenCanvas;
}

// Function to render the entire grid
export function drawGrid({
  ctx,
  textureAtlas,
  gridSize,
  grid,
  tileHeight,
  tileWidth,
  tileTypes,
}: {
  ctx: CanvasRenderingContext2D;
  textureAtlas: OffscreenCanvas;
  gridSize: { width: number; height: number };
  grid: Tile[][];
  tileHeight: number;
  tileWidth: number;
  tileTypes: TileType[];
}) {
  //ctx.clearRect(0, 0, grid.length, grid[0].length);

  for (let x = 0; x < gridSize.width; x++) {
    for (let y = 0; y < gridSize.height; y++) {
      const tile = grid[x][y];
      const tileType = tileTypes[tile.tileTypeId];

      ctx.drawImage(
        textureAtlas,
        tileType.textureCenter.x - tileWidth / 2,
        tileType.textureCenter.y - tileHeight / 2,
        tileWidth,
        tileHeight,
        tile.center.x - tileWidth / 2,
        tile.center.y - tileHeight / 2,
        tileWidth,
        tileHeight
      );
      ctx.fillText(
        `x:${x} y:${y}`,
        tile.center.x - tileWidth / 4,
        tile.center.y
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

function drawDiamondPath({
  ctx,
  centerX,
  centerY,
  height,
  width,
}: {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  centerX: number;
  centerY: number;
  height: number;
  width: number;
}) {
  ctx.beginPath();
  ctx.moveTo(centerX - width / 2, centerY); // Top left corner
  ctx.lineTo(centerX, centerY + height / 2); // Bottom center
  ctx.lineTo(centerX + width / 2, centerY); // Top right corner
  ctx.lineTo(centerX, centerY - height / 2); // Top center
  ctx.closePath();

  // You can choose to fill or stroke the path here
  // ctx.fillStyle = "#ff0000"; // Set fill color (optional)
  // ctx.fill();
}

export function drawBorders(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tileCenter: { x: number; y: number }
) {
  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  drawDiamondPath({
    ctx,
    centerX: tileCenter.x,
    centerY: tileCenter.y,
    height,
    width,
  });
  ctx.stroke();
}
