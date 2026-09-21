import { Application, Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { Tile, biomes } from "@tile-former/tilegen";
import { CLIFF_UNIT, MAX_FLOORS, TILE_H, TILE_W, darken } from "@tile-former/tile-designer";
import { defaultRandSeed, gridSize } from "./config.ts";
import { buildFloorAtlas, buildTileField, hashSeed } from "./floorField.ts";
import { createIsoTerrain } from "./isoTerrain.ts";

const oakImageUrls = Object.values(
  import.meta.glob<string>("./assets/oak/*.png", { eager: true, import: "default" }),
);
const pineImageUrls = Object.values(
  import.meta.glob<string>("./assets/pine/*.png", { eager: true, import: "default" }),
);
const bushImageUrls = Object.values(
  import.meta.glob<string>("./assets/bush/*.png", { eager: true, import: "default" }),
);

// The screen diamond and the generation core's bake are 1:1 from the v2
// redesign on, so the geometry constants come from the core rather than being
// declared twice — this pair was the "mirrored from isoRenderer.ts, unified at
// G" note in compose.ts and types.ts.
const ISO_W = TILE_W;
const ISO_H = TILE_H;

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

  const [oakTextureMap, pineTextureMap, bushTextureMap] = await Promise.all([
    Assets.load<Texture>(oakImageUrls),
    Assets.load<Texture>(pineImageUrls),
    Assets.load<Texture>(bushImageUrls),
  ]);
  const oakTextures = Object.values(oakTextureMap);
  const pineTextures = Object.values(pineTextureMap);
  const bushTextures = Object.values(bushTextureMap);

  const offsetX = gridSize.height * (ISO_W / 2);
  const offsetY = MAX_FLOORS * CLIFF_UNIT;
  const vegetationFor = makeVegetationFor(oakTextures, pineTextures, bushTextures, offsetX, offsetY);

  if (debugOverlay === "none") {
    // The v2 path: one atlas for the whole map, composed dual cells on top of
    // it. No per-tile bake and nothing to persist — a 64×64 map resolves to
    // 16–17 material instances and a single 2048 atlas page.
    const worldSeed = hashSeed(seed);
    const field = buildTileField(tileMap);
    const floor = buildFloorAtlas(field, worldSeed);
    const terrain = createIsoTerrain({
      field,
      tileMap,
      floor,
      seed: worldSeed,
      offsetX,
      offsetY,
      onTileClick,
      vegetationFor,
    });
    viewport.addChild(terrain.container);

    // Culling is per diagonal, not per sprite (isoTerrain.ts) — ~128 bounds
    // tests for a 64×64 map, so running it on every viewport change is free.
    const recull = () => terrain.cull(viewport.getVisibleBounds());
    recull();
    viewport.on("moved", recull);
    viewport.on("zoomed", recull);
  } else {
    viewport.addChild(createDebugTiles(tileMap, onTileClick, debugOverlay, offsetX, offsetY));
  }

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
    const diamond = [
      isoX + ISO_W / 2, topY,
      isoX + ISO_W,     topY + ISO_H / 2,
      isoX + ISO_W / 2, topY + ISO_H,
      isoX,             topY + ISO_H / 2,
    ];
    highlightGraphics.poly(diamond);
    highlightGraphics.fill({ color: 0xffffff, alpha: 0.35 });
    highlightGraphics.poly(diamond);
    highlightGraphics.stroke({ color: 0xffffff, alpha: 0.9, width: 1.5 });
  }

  return { app, viewport, highlightTile };
}

// --- Vegetation ------------------------------------------------------------------
//
// Interactive flora stays the game's own sprite pipeline — PLAN.md scopes trees
// and bushes out of the designer explicitly. All the terrain renderer needs is
// the display objects and a depth slot to put them in.

// Trees and bushes are drawn from 128×128 source art with generous transparent
// padding; scale them down to roughly match the footprint of the old stubs.
const TREE_SCALE = 0.3;
const BUSH_SCALE = 0.18;

function vegSprite(texture: Texture, sx: number, sy: number, light: number, scale: number): Sprite {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5, 1);
  sprite.x = sx;
  sprite.y = sy;
  sprite.scale.set(scale);
  const tv = Math.round((0.45 + 0.55 * light) * 255);
  sprite.tint = (tv << 16) | (tv << 8) | tv;
  return sprite;
}

function shadow(sx: number, sy: number, rx: number, ry: number, alpha: number): Graphics {
  const g = new Graphics();
  g.ellipse(sx, sy, rx, ry);
  g.fill({ color: 0x000000, alpha });
  return g;
}

function makeVegetationFor(
  oakTextures: Texture[],
  pineTextures: Texture[],
  bushTextures: Texture[],
  offsetX: number,
  offsetY: number,
) {
  return (tile: Tile, level: number): Container[] => {
    const out: Container[] = [];
    const cliffH = level * CLIFF_UNIT;
    // Continuous tile-unit coords → screen, on the same floor as the tile.
    for (const t of tile.trees) {
      const sx = (t.x - t.y + 1) * (ISO_W / 2) + offsetX;
      const sy = (t.x + t.y) * (ISO_H / 2) + offsetY - cliffH;
      // Deterministic per-tree type: ~30% oak, 70% pine, with a deterministic
      // pick among the 10 art variants of whichever species is chosen.
      const hash = Math.floor(t.x * 127 + t.y * 311);
      const textures = hash % 10 < 3 ? oakTextures : pineTextures;
      const tex = textures[Math.floor(hash / 10) % textures.length]!;
      out.push(shadow(sx + 3, sy, 11, 5, 0.32));
      out.push(vegSprite(tex, sx, sy, tile.groundLight, TREE_SCALE));
    }
    for (const b of tile.bushes) {
      const sx = (b.x - b.y + 1) * (ISO_W / 2) + offsetX;
      const sy = (b.x + b.y) * (ISO_H / 2) + offsetY - cliffH;
      const hash = Math.floor(b.x * 197 + b.y * 421);
      const tex = bushTextures[hash % bushTextures.length]!;
      out.push(shadow(sx + 2, sy, 7, 3, 0.28));
      out.push(vegSprite(tex, sx, sy, tile.groundLight, BUSH_SCALE));
    }
    return out;
  };
}

// --- Debug overlays ---------------------------------------------------------------
//
// Flat per-tile colour, no textures: these exist to read a scalar field off the
// map (cliff shadow today), and a composed floor would only obscure it. This is
// the one place `Biome.textureColor` is still the right answer.

function hexStringToNumber(color: string): number {
  return parseInt(color.replace("#", ""), 16);
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
  let base = hexStringToNumber(biome?.textureColor ?? "#888888");
  if (tile.riparian) base = blendColor(base, 0x4a90b8, 0.3);
  return base;
}

function createDebugTiles(
  tileMap: Tile[][],
  onTileClick: (tile: Tile) => void,
  debugOverlay: IsoDebugOverlay,
  offsetX: number,
  offsetY: number,
): Container {
  const container = new Container();
  const tiles: Tile[] = tileMap.flat();
  tiles.sort((a, b) => a.index.y + a.index.x - (b.index.y + b.index.x));

  for (const tile of tiles) {
    const col = tile.index.x;
    const row = tile.index.y;
    const cliffH = Math.round(tile.altitude * MAX_FLOORS) * CLIFF_UNIT;
    const isoX = (col - row) * (ISO_W / 2) + offsetX;
    const topY = (col + row) * (ISO_H / 2) + offsetY - cliffH;

    const topColor = getTileTopColor(tile, debugOverlay);
    const g = new Graphics();
    if (cliffH > 0) {
      g.poly([
        isoX,             topY + ISO_H / 2,
        isoX + ISO_W / 2, topY + ISO_H,
        isoX + ISO_W / 2, topY + ISO_H + cliffH,
        isoX,             topY + ISO_H / 2 + cliffH,
      ]);
      g.fill({ color: darken(topColor, 0.6) });
      g.poly([
        isoX + ISO_W / 2, topY + ISO_H,
        isoX + ISO_W,     topY + ISO_H / 2,
        isoX + ISO_W,     topY + ISO_H / 2 + cliffH,
        isoX + ISO_W / 2, topY + ISO_H + cliffH,
      ]);
      g.fill({ color: darken(topColor, 0.42) });
    }
    g.poly([
      isoX + ISO_W / 2, topY,
      isoX + ISO_W,     topY + ISO_H / 2,
      isoX + ISO_W / 2, topY + ISO_H,
      isoX,             topY + ISO_H / 2,
    ]);
    g.fill({ color: topColor });

    g.interactive = true;
    g.on("click", () => onTileClick(tile));
    container.addChild(g);
  }
  return container;
}
