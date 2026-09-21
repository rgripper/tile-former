import { Texture, Rectangle } from "pixi.js";
import type { Tile } from "@tile-former/tilegen";
import {
  buildFieldAtlas,
  makeField,
  resolveStyle,
  tileSurface,
  type Atlas,
  type DesignInput,
  type PixelBuffer,
  type SpriteRef,
  type TileField,
} from "@tile-former/tile-designer";

// The game's bridge to the v2 generation core (milestone G).
//
// v1 asked the core for one baked 64×32 texture per tile and cached 4096 of
// them in IndexedDB. v2 asks it for *one atlas* and a list of which sprites
// cover which dual cell — so there is nothing per-tile to bake, nothing to
// persist, and neighbouring tiles share textures instead of each owning a
// unique bake (which is what `floorTextureCache.ts` existed to work around, and
// what its own log entry named as the reason for the redesign).

// The core keys its noise on a numeric seed; the game's is a string.
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

// `tileMap` is indexed [x][y] to match `Tile.index`. `makeField` clamps
// out-of-range lookups to the edge, which is what makes the dual grid's fringe
// row and column behave at the map border.
//
// Resolution is memoised inside `makeField`, so this is one `resolveStyle` per
// tile for the whole map — measured at ~40 ms for 64×64, against the seconds
// the v1 path spent baking the same map's textures.
export function buildTileField(tileMap: Tile[][]): TileField {
  const width = tileMap.length;
  const height = tileMap[0]?.length ?? 0;
  return makeField(width, height, (c, r) => {
    const input = tileToDesignInput(tileMap[c]![r]!);
    return tileSurface(resolveStyle(input), input.altitude);
  });
}

// --- Atlas → Pixi -------------------------------------------------------------

// One `Texture` per atlas page, plus a cached sub-texture per sprite.
//
// `pageSize: 2048` is the game's trade, not the designer's: a whole-map atlas
// lands in a single page there (measured: 64×64 maps take 2656–2749 sprites in
// 1 page, 16.8 MB) where the designer's 1024 would need four. One page also
// means one texture bind for the entire floor.
export type FloorAtlas = {
  atlas: Atlas;
  textureFor(ref: SpriteRef): Texture;
  destroy(): void;
};

function pageToTexture(page: PixelBuffer): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = page.width;
  canvas.height = page.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(page.data), page.width, page.height), 0, 0);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = "nearest";
  return texture;
}

export function buildFloorAtlas(field: TileField, seed: number): FloorAtlas {
  const atlas = buildFieldAtlas(field, { seed }, { pageSize: 2048 });
  const pages = atlas.pages.map(pageToTexture);
  // A map draws tens of thousands of cell sprites from a few thousand distinct
  // atlas entries, so the sub-texture is cut once and shared.
  const subs = new Map<string, Texture>();
  return {
    atlas,
    textureFor(ref) {
      const key = `${ref.page}|${ref.x}|${ref.y}|${ref.w}|${ref.h}`;
      let texture = subs.get(key);
      if (texture === undefined) {
        texture = new Texture({
          source: pages[ref.page]!.source,
          frame: new Rectangle(ref.x, ref.y, ref.w, ref.h),
        });
        subs.set(key, texture);
      }
      return texture;
    },
    destroy() {
      for (const texture of subs.values()) texture.destroy();
      for (const page of pages) page.destroy(true);
      subs.clear();
    },
  };
}
