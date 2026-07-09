import { Texture } from "pixi.js";
import type { Tile } from "@tile-former/tilegen";
import {
  bakeTile,
  resolveStyle,
  TILE_H,
  TILE_W,
  type DesignInput,
  type PixelBuffer,
} from "@tile-former/tile-designer";

// The bake core keys all noise on world pixel coordinates + a numeric world
// seed; the game's seed is a string, so hash it once (FNV-1a) at init.
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function tileToDesignInput(tile: Tile): DesignInput {
  return {
    temperature: tile.temperature,
    effectiveMoisture: tile.effectiveMoisture,
    drainage: tile.drainage,
    groundLight: tile.groundLight,
    altitude: tile.altitude,
    fertility: tile.fertility,
    riparian: tile.riparian,
    forestDensity: tile.forestDensity,
    rockType: tile.rockType,
    water: tile.water,
    biomeId: tile.biomeId,
  };
}

// World pixel origin for a tile's bake: mirrors the iso screen mapping (at 2×
// resolution) so world-coordinate noise lines up seamlessly across neighbors.
export function tileWorldOrigin(tile: Tile): { ox: number; oy: number } {
  const col = tile.index.x;
  const row = tile.index.y;
  return { ox: ((col - row) * TILE_W) / 2, oy: ((col + row) * TILE_H) / 2 };
}

// Pure bake of one tile's 128×64 floor diamond — no canvas/GPU involved, so
// it's safe to call off the render path (e.g. from the cache warm-up pass).
export function bakeFloorBuffer(tile: Tile, worldSeed: number): PixelBuffer {
  const { ox, oy } = tileWorldOrigin(tile);
  return bakeTile(resolveStyle(tileToDesignInput(tile)), ox, oy, worldSeed);
}

export function bufferToTexture(width: number, height: number, data: Uint8ClampedArray): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);

  const texture = Texture.from(canvas);
  texture.source.scaleMode = "nearest";
  return texture;
}
