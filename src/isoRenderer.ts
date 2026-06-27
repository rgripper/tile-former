import { Application, Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { Tile, biomes } from "@tile-former/tilegen";
import { gridSize } from "./config.ts";
import treeImageUrl from "./assets/tree.png";
import tree2ImageUrl from "./assets/tree2.png";
import bushImageUrl from "./assets/bush.png";

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

  const [treeTexture, tree2Texture, bushTexture] = await Promise.all([
    Assets.load<Texture>(treeImageUrl),
    Assets.load<Texture>(tree2ImageUrl),
    Assets.load<Texture>(bushImageUrl),
  ]);

  const isoContainer = createIsoTiles(tileMap, onTileClick, debugOverlay, treeTexture, tree2Texture, bushTexture);
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

function vegSprite(texture: Texture, sx: number, sy: number, light: number): Sprite {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5, 1);
  sprite.x = sx;
  sprite.y = sy;
  const tv = Math.round((0.45 + 0.55 * light) * 255);
  sprite.tint = (tv << 16) | (tv << 8) | tv;
  return sprite;
}

function createIsoTiles(
  tileMap: Tile[][],
  onTileClick: (tile: Tile) => void,
  debugOverlay: IsoDebugOverlay,
  treeTexture: Texture,
  tree2Texture: Texture,
  bushTexture: Texture,
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

    // Vegetation — skip in debug overlays so suitability maps stay readable
    if (debugOverlay === "none") {
      // Continuous tile-unit coords → screen: (px-py)*(ISO_W/2), (px+py)*(ISO_H/2)
      // Both use the same cliffH as the tile they sit on.
      for (const t of tile.trees) {
        const sx = (t.x - t.y + 1) * (ISO_W / 2) + offsetX;
        const sy = (t.x + t.y) * (ISO_H / 2) + offsetY - cliffH;
        // Deterministic per-tree type: ~30% deciduous, 70% pine
        const tex = (Math.floor(t.x * 127 + t.y * 311) % 10) < 3 ? tree2Texture : treeTexture;
        g.ellipse(sx + 3, sy, 11, 5);
        g.fill({ color: 0x000000, alpha: 0.32 });
        g.addChild(vegSprite(tex, sx, sy, tile.groundLight));
      }
      for (const b of tile.bushes) {
        const sx = (b.x - b.y + 1) * (ISO_W / 2) + offsetX;
        const sy = (b.x + b.y) * (ISO_H / 2) + offsetY - cliffH;
        g.ellipse(sx + 2, sy, 7, 3);
        g.fill({ color: 0x000000, alpha: 0.28 });
        g.addChild(vegSprite(bushTexture, sx, sy, tile.groundLight));
      }
    }

    g.interactive = true;
    g.on("click", () => onTileClick(tile));
    container.addChild(g);
  }

  return container;
}
