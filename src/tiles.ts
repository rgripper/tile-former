import { drawDiamondPath } from "./drawing";

export type IsometricTile = {
  tileTypeId: number;
  center: Point;
  index: Point;
  topLeft: Point;
};

export type TileType = {
  id: number;
  name: string;
  color: string;
  center: Point;
  topLeft: Point;
};

export type SpritesheetFrame = {
  frame: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  sourceSize?: {
    w: number;
    h: number;
  };
  spriteSourceSize?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
};

export type Point = { x: number; y: number };

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

export const createTileTypes = (
  tileWidth: number,
  tileHeight: number
): TileType[] =>
  tileNamesAndColors.map(({ name, color }, i) => ({
    id: i,
    name,
    color,
    center: { x: 0.5 * tileWidth, y: (i + 0.5) * tileHeight },
    topLeft: { x: 0, y: i * tileHeight },
  }));

export type Atlas = {
  canvas: OffscreenCanvas;
  spriteItemData: Record<string, SpritesheetFrame>;
};

// Function to get the bitmap for a tile type
export function createTextureAtlas(
  tileTypes: TileType[],
  tileWidth: number,
  tileHeight: number
): Atlas {
  const offscreenCanvas = new OffscreenCanvas(
    tileWidth,
    tileTypes.length * tileHeight
  );
  const ctx = offscreenCanvas.getContext(
    "2d"
  ) as OffscreenCanvasRenderingContext2D;

  const spriteItemData: Record<string, SpritesheetFrame> = {};

  tileTypes.forEach((tileType, i) => {
    ctx.strokeStyle = "gray";
    ctx.lineWidth = 1;
    ctx.fillStyle = tileType.color;

    drawDiamondPath({
      ctx,
      centerX: tileType.center.x,
      centerY: tileType.center.y,
      height: tileHeight,
      width: tileWidth,
    });
    ctx.fill();
    ctx.stroke();

    spriteItemData[tileType.id] = {
      frame: {
        x: 0,
        y: i * tileHeight,
        w: tileWidth,
        h: tileHeight,
      },
      // sourceSize: {
      //   w: tileWidth,
      //   h: tileHeight,
      // },
      // spriteSourceSize: {
      //   x: 0,
      //   y: 0,
      //   w: tileWidth,
      //   h: tileHeight,
      // },
    };
  });

  return {
    canvas: offscreenCanvas,
    spriteItemData,
  };
}
