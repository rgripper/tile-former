import { Application, Container, Graphics } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { Tile, biomes } from "@tile-former/tilegen";
import { gridSize } from "./config.ts";

const ISO_W = 64;   // screen width of top diamond face
const ISO_H = 32;   // screen height of top diamond face (2:1 ratio)
const CLIFF_UNIT = 12; // pixels per altitude floor level
const MAX_FLOORS = 10;

export type IsoDebugOverlay = "none" | "cliffShadow";

export async function initIsoApp({
  tileMap,
  container,
  onTileClick,
  debugOverlay = "none",
}: {
  tileMap: Tile[][];
  container: HTMLElement;
  onTileClick: (tile: Tile) => void;
  debugOverlay?: IsoDebugOverlay;
}) {
  const app = new Application();
  await app.init({
    resizeTo: container,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  const worldWidth = (gridSize.width + gridSize.height) * (ISO_W / 2);
  const worldHeight = (gridSize.width + gridSize.height) * (ISO_H / 2) + MAX_FLOORS * CLIFF_UNIT;

  const viewport = new Viewport({
    worldWidth,
    worldHeight,
    noTicker: true,
    ticker: app.ticker,
    events: app.renderer.events,
  });

  viewport.drag().pinch().wheel().decelerate();
  viewport.setZoom(0.6);

  app.stage.addChild(viewport);

  const isoContainer = createIsoTiles(tileMap, onTileClick, debugOverlay);
  viewport.addChild(isoContainer);

  const offsetX = gridSize.height * (ISO_W / 2);
  const offsetY = MAX_FLOORS * CLIFF_UNIT;

  const highlightGraphics = new Graphics();
  viewport.addChild(highlightGraphics);

  function highlightTile(tile: Tile | null) {
    highlightGraphics.clear();
    if (!tile) return;
    const col = tile.index.x;
    const row = tile.index.y;
    const floor = Math.round(tile.altitude * MAX_FLOORS);
    const cliffH = floor * CLIFF_UNIT;
    const isoX = (col - row) * (ISO_W / 2) + offsetX;
    const isoY = (col + row) * (ISO_H / 2) + offsetY;
    const topY = isoY - cliffH;
    highlightGraphics.poly([
      isoX + ISO_W / 2, topY,
      isoX + ISO_W,     topY + ISO_H / 2,
      isoX + ISO_W / 2, topY + ISO_H,
      isoX,             topY + ISO_H / 2,
    ]);
    highlightGraphics.fill({ color: 0xffffff, alpha: 0.35 });
    highlightGraphics.poly([
      isoX + ISO_W / 2, topY,
      isoX + ISO_W,     topY + ISO_H / 2,
      isoX + ISO_W / 2, topY + ISO_H,
      isoX,             topY + ISO_H / 2,
    ]);
    highlightGraphics.stroke({ color: 0xffffff, alpha: 0.9, width: 1.5 });
  }

  return { app, viewport, highlightTile };
}

function hexStringToNumber(color: string): number {
  return parseInt(color.replace("#", ""), 16);
}

function colorToNumber(color: string | number): number {
  return typeof color === "number" ? color : hexStringToNumber(color);
}

function darken(color: number, factor: number): number {
  const r = Math.floor(((color >> 16) & 0xff) * factor);
  const g = Math.floor(((color >> 8) & 0xff) * factor);
  const b = Math.floor((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

function blendColor(c1: number, c2: number, t: number): number {
  const r = Math.floor(((c1 >> 16) & 0xff) * (1 - t) + ((c2 >> 16) & 0xff) * t);
  const g = Math.floor(((c1 >> 8) & 0xff) * (1 - t) + ((c2 >> 8) & 0xff) * t);
  const b = Math.floor((c1 & 0xff) * (1 - t) + (c2 & 0xff) * t);
  return (r << 16) | (g << 8) | b;
}

function getTileTopColor(tile: Tile, debugOverlay: IsoDebugOverlay): number {
  if (debugOverlay === "cliffShadow") {
    // Pure shadow visualization: white (no shadow) → dark indigo (full shadow).
    // Ignores biome so the gradient is unambiguous.
    return blendColor(0xe8e8ff, 0x0a0a3f, tile.cliffShadow);
  }
  if (tile.water) return 0x2e6db4;
  const biome = biomes.find((b) => b.id === tile.biomeId);
  let base = colorToNumber(biome?.textureColor ?? "#888888");
  if (tile.surfaceType === "rocky") base = blendColor(base, 0x888888, 0.45);
  else if (tile.surfaceType === "sandy") base = blendColor(base, 0xd4a86a, 0.45);
  if (tile.riparian) base = blendColor(base, 0x4a90b8, 0.3);
  return base;
}

function createIsoTiles(
  tileMap: Tile[][],
  onTileClick: (tile: Tile) => void,
  debugOverlay: IsoDebugOverlay,
): Container {
  const container = new Container();

  // Origin offset: leftmost column at x=0, all tiles within positive coords
  const offsetX = gridSize.height * (ISO_W / 2);
  const offsetY = MAX_FLOORS * CLIFF_UNIT;

  // Flatten and sort back-to-front by (row + col) for correct painter's order
  const tiles: Tile[] = tileMap.flat();
  tiles.sort((a, b) => a.index.y + a.index.x - (b.index.y + b.index.x));

  for (const tile of tiles) {
    const col = tile.index.x;
    const row = tile.index.y;
    const floor = Math.round(tile.altitude * MAX_FLOORS);
    const cliffH = floor * CLIFF_UNIT;

    // Base isometric position (ground level)
    const isoX = (col - row) * (ISO_W / 2) + offsetX;
    const isoY = (col + row) * (ISO_H / 2) + offsetY;

    // Top face is raised by cliff height
    const topY = isoY - cliffH;

    const topColor = getTileTopColor(tile, debugOverlay);
    const leftColor = darken(topColor, 0.6);
    const rightColor = darken(topColor, 0.42);

    const g = new Graphics();

    // Left cliff face
    if (cliffH > 0) {
      g.poly([
        isoX,             topY + ISO_H / 2,
        isoX + ISO_W / 2, topY + ISO_H,
        isoX + ISO_W / 2, topY + ISO_H + cliffH,
        isoX,             topY + ISO_H / 2 + cliffH,
      ]);
      g.fill({ color: leftColor });

      // Right cliff face
      g.poly([
        isoX + ISO_W / 2, topY + ISO_H,
        isoX + ISO_W,     topY + ISO_H / 2,
        isoX + ISO_W,     topY + ISO_H / 2 + cliffH,
        isoX + ISO_W / 2, topY + ISO_H + cliffH,
      ]);
      g.fill({ color: rightColor });

    }

    // Top diamond face
    g.poly([
      isoX + ISO_W / 2, topY,
      isoX + ISO_W,     topY + ISO_H / 2,
      isoX + ISO_W / 2, topY + ISO_H,
      isoX,             topY + ISO_H / 2,
    ]);
    g.fill({ color: topColor });

    // Draw a border on each diamond edge where the adjacent tile is at a different level.
    // Neighbors: upper-left=(col-1,row), upper-right=(col,row-1),
    //            lower-left=(col,row+1), lower-right=(col+1,row)
    const nFloor = (c: number, r: number) =>
      Math.round((tileMap[c]?.[r]?.altitude ?? 0) * MAX_FLOORS);
    const rim = { color: 0x444444, alpha: 1, pixelLine: true };
    if (floor !== nFloor(col - 1, row)) {
      g.moveTo(isoX + ISO_W / 2, topY);
      g.lineTo(isoX,             topY + ISO_H / 2);
      g.stroke(rim);
    }
    if (floor !== nFloor(col, row - 1)) {
      g.moveTo(isoX + ISO_W / 2, topY);
      g.lineTo(isoX + ISO_W,     topY + ISO_H / 2);
      g.stroke(rim);
    }
    if (floor !== nFloor(col, row + 1)) {
      g.moveTo(isoX,             topY + ISO_H / 2);
      g.lineTo(isoX + ISO_W / 2, topY + ISO_H);
      g.stroke(rim);
    }
    if (floor !== nFloor(col + 1, row)) {
      g.moveTo(isoX + ISO_W / 2, topY + ISO_H);
      g.lineTo(isoX + ISO_W,     topY + ISO_H / 2);
      g.stroke(rim);
    }

    g.interactive = true;
    g.on("click", () => onTileClick(tile));
    container.addChild(g);
  }

  return container;
}
