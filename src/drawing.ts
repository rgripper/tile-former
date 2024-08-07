import { Point, IsometricTile, TileType } from "./tiles";

// Function to render the entire grid

export function drawGrid({
  ctx,
  textureAtlas,
  atlasTileSize,
  gridSize,
  canvasSize,
  grid,
  isoTileSize,
  tileTypes,
}: {
  ctx: CanvasRenderingContext2D;
  textureAtlas: OffscreenCanvas;
  atlasTileSize: Point;
  gridSize: { width: number; height: number };
  canvasSize: { width: number; height: number };
  grid: IsometricTile[][];
  isoTileSize: Point;
  tileTypes: TileType[];
}) {
  //ctx.clearRect(0, 0, grid.length, grid[0].length);

  const maxTilesInSide = Math.max(gridSize.height, gridSize.width);

  const gridTopLeft = {
    x: grid[0][grid[0].length - 1].topLeft.x,
    y: grid[0][0].topLeft.y,
  };

  const gridBoxSize = {
    width: maxTilesInSide * isoTileSize.x,
    height: maxTilesInSide * isoTileSize.y,
  };

  const gridOffset = {
    x: canvasSize.width / 2 - gridBoxSize.width / 2 - gridTopLeft.x,
    y: canvasSize.height / 2 - gridBoxSize.height / 2 - gridTopLeft.y,
  };

  for (let x = 0; x < gridSize.width; x++) {
    for (let y = 0; y < gridSize.height; y++) {
      const tile = grid[x][y];
      const tileType = tileTypes[tile.tileTypeId];

      const offsetCenter = {
        x: tile.center.x + gridOffset.x,
        y: tile.center.y + gridOffset.y,
      };

      const offsetTopLeft = {
        x: tile.topLeft.x + gridOffset.x,
        y: tile.topLeft.y + gridOffset.y,
      };

      ctx.drawImage(
        textureAtlas,
        tileType.topLeft.x,
        tileType.topLeft.y,
        atlasTileSize.x,
        atlasTileSize.y,
        offsetTopLeft.x,
        offsetTopLeft.y,
        isoTileSize.x,
        isoTileSize.y
      );

      ctx.beginPath();
      ctx.moveTo(offsetCenter.x, offsetCenter.y - isoTileSize.y / 2);
      ctx.lineTo(offsetCenter.x + isoTileSize.x / 2, offsetCenter.y);
      ctx.lineTo(offsetCenter.x, offsetCenter.y + isoTileSize.y / 2);
      ctx.lineTo(offsetCenter.x - isoTileSize.x / 2, offsetCenter.y);
      ctx.closePath();
      ctx.strokeStyle = "blue";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillText(
        `x:${x} y:${y}`,
        offsetTopLeft.x + isoTileSize.x / 3,
        offsetTopLeft.y + isoTileSize.y / 1.8
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
export function drawDiamondPath({
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
