import { Application, Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { Tile, biomes } from "@tile-former/tilegen";
import { defaultRandSeed, gridSize } from "./config.ts";
import { hashSeed } from "./floorTextures.ts";
import { warmFloorTextureCache } from "./floorTextureCache.ts";

const oakImageUrls = Object.values(
  import.meta.glob<string>("./assets/oak/*.png", { eager: true, import: "default" }),
);
const pineImageUrls = Object.values(
  import.meta.glob<string>("./assets/pine/*.png", { eager: true, import: "default" }),
);
const bushImageUrls = Object.values(
  import.meta.glob<string>("./assets/bush/*.png", { eager: true, import: "default" }),
);

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
  seed = defaultRandSeed,
}: {
  tileMap: Tile[][];
  container: HTMLElement;
  onTileClick: (tile: Tile) => void;
  debugOverlay?: IsoDebugOverlay;
  seed?: string;
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

  const [oakTextureMap, pineTextureMap, bushTextureMap, floorTextures] = await Promise.all([
    Assets.load<Texture>(oakImageUrls),
    Assets.load<Texture>(pineImageUrls),
    Assets.load<Texture>(bushImageUrls),
    warmFloorTextureCache(tileMap.flat(), hashSeed(seed)),
  ]);
  const oakTextures = Object.values(oakTextureMap);
  const pineTextures = Object.values(pineTextureMap);
  const bushTextures = Object.values(bushTextureMap);

  const isoContainer = createIsoTiles(tileMap, onTileClick, debugOverlay, oakTextures, pineTextures, bushTextures, floorTextures);
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

// Trees and bushes are drawn from 128×128 source art with generous transparent
// padding; scale them down to roughly match the footprint of the old hand-sized stubs.
const TREE_SCALE = 0.3;
const BUSH_SCALE = 0.18;

function vegSprite(texture: Texture, sx: number, sy: number, light: number, scale = 1): Sprite {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5, 1);
  sprite.x = sx;
  sprite.y = sy;
  sprite.scale.set(scale);
  const tv = Math.round((0.45 + 0.55 * light) * 255);
  sprite.tint = (tv << 16) | (tv << 8) | tv;
  return sprite;
}

function createIsoTiles(
  tileMap: Tile[][],
  onTileClick: (tile: Tile) => void,
  debugOverlay: IsoDebugOverlay,
  oakTextures: Texture[],
  pineTextures: Texture[],
  bushTextures: Texture[],
  floorTextures: Map<string, Texture>,
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

    // Top diamond face: baked floor texture (128×64 shown at 64×32), or the
    // flat biome color in debug overlays. The flat fill stays underneath the
    // sprite as the click hit-area.
    g.poly([
      isoX + ISO_W / 2, topY,
      isoX + ISO_W,     topY + ISO_H / 2,
      isoX + ISO_W / 2, topY + ISO_H,
      isoX,             topY + ISO_H / 2,
    ]);
    g.fill({ color: topColor });

    if (debugOverlay === "none") {
      const floorSprite = new Sprite(floorTextures.get(`${col},${row}`)!);
      floorSprite.x = isoX;
      floorSprite.y = topY;
      floorSprite.width = ISO_W;
      floorSprite.height = ISO_H;
      g.addChild(floorSprite);
    }

    // Draw a border on each diamond edge where the adjacent tile is at a different
    // level. On a child Graphics so the rims render above the floor sprite.
    const rims = new Graphics();
    g.addChild(rims);
    // Neighbors: upper-left=(col-1,row), upper-right=(col,row-1),
    //            lower-left=(col,row+1), lower-right=(col+1,row)
    const nFloor = (c: number, r: number) =>
      Math.round((tileMap[c]?.[r]?.altitude ?? 0) * MAX_FLOORS);
    const rim = { color: 0x444444, alpha: 1, pixelLine: true };
    if (floor !== nFloor(col - 1, row)) {
      rims.moveTo(isoX + ISO_W / 2, topY);
      rims.lineTo(isoX,             topY + ISO_H / 2);
      rims.stroke(rim);
    }
    if (floor !== nFloor(col, row - 1)) {
      rims.moveTo(isoX + ISO_W / 2, topY);
      rims.lineTo(isoX + ISO_W,     topY + ISO_H / 2);
      rims.stroke(rim);
    }
    if (floor !== nFloor(col, row + 1)) {
      rims.moveTo(isoX,             topY + ISO_H / 2);
      rims.lineTo(isoX + ISO_W / 2, topY + ISO_H);
      rims.stroke(rim);
    }
    if (floor !== nFloor(col + 1, row)) {
      rims.moveTo(isoX + ISO_W / 2, topY + ISO_H);
      rims.lineTo(isoX + ISO_W,     topY + ISO_H / 2);
      rims.stroke(rim);
    }

    // Vegetation — skip in debug overlays so suitability maps stay readable
    if (debugOverlay === "none") {
      // Continuous tile-unit coords → screen: (px-py)*(ISO_W/2), (px+py)*(ISO_H/2)
      // Both use the same cliffH as the tile they sit on.
      for (const t of tile.trees) {
        const sx = (t.x - t.y + 1) * (ISO_W / 2) + offsetX;
        const sy = (t.x + t.y) * (ISO_H / 2) + offsetY - cliffH;
        // Deterministic per-tree type: ~30% oak, 70% pine, with a deterministic
        // pick among the 10 art variants of whichever species is chosen.
        const hash = Math.floor(t.x * 127 + t.y * 311);
        const textures = (hash % 10) < 3 ? oakTextures : pineTextures;
        const tex = textures[Math.floor(hash / 10) % textures.length];
        g.ellipse(sx + 3, sy, 11, 5);
        g.fill({ color: 0x000000, alpha: 0.32 });
        g.addChild(vegSprite(tex, sx, sy, tile.groundLight, TREE_SCALE));
      }
      for (const b of tile.bushes) {
        const sx = (b.x - b.y + 1) * (ISO_W / 2) + offsetX;
        const sy = (b.x + b.y) * (ISO_H / 2) + offsetY - cliffH;
        // Deterministic per-bush variant pick among the 10 art variants.
        const hash = Math.floor(b.x * 197 + b.y * 421);
        const tex = bushTextures[hash % bushTextures.length];
        g.ellipse(sx + 2, sy, 7, 3);
        g.fill({ color: 0x000000, alpha: 0.28 });
        g.addChild(vegSprite(tex, sx, sy, tile.groundLight, BUSH_SCALE));
      }
    }

    g.interactive = true;
    g.on("click", () => onTileClick(tile));
    container.addChild(g);
  }

  return container;
}
