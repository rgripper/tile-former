import { Container, Graphics, Sprite, Texture } from "pixi.js";
import type { Tile } from "@tile-former/tilegen";
import {
  CLIFF_LEFT_SHADE,
  CLIFF_RIGHT_SHADE,
  CLIFF_UNIT,
  RIM_COLOR,
  TILE_H,
  TILE_W,
  buildFeatureAtlas,
  CELL_DEPTH,
  FEATURE_DEPTH,
  TILE_DEPTH,
  cellBounds,
  cellDepth,
  composeCell,
  darken,
  featuresForTile,
  fieldFeatureInstances,
  tileOrigin,
  type FeatureAtlas,
  type FeatureSpriteRef,
  type TileField,
} from "@tile-former/tile-designer";
import type { FloorAtlas } from "./floorField.ts";

// The composed floor, cliffs and rims as a Pixi display list (milestone G).
//
// --- Why depth *rows* instead of one sorted container ---
//
// `terrain.ts` renders the same scene by pushing every item into one array with
// a fractional depth key and sorting it. A Pixi port could do that with
// `sortableChildren` and `zIndex`, but a 64×64 map is ~30k cell sprites plus
// 4k tiles, and that approach buys a sort over 35k children and leaves culling
// as a per-child test.
//
// The depths are all of the form (integer tile depth) + a small constant, so
// they bucket exactly. One `Container` per diagonal `d = col + row`, added to
// the parent in ascending `d`, reproduces the sort with no sorting at all — and
// makes culling 127 bounds checks instead of 35k. Within row `d`, in order:
//
//   1. cliff walls + rims of tiles at depth d              (TILE_DEPTH)
//   2. floor sprites of dual cells at c + r = d − 1         (CELL_DEPTH)
//   3. water overlay for tiles at depth d − 1               (between the two)
//   4. features + vegetation of tiles at depth d − 1        (FEATURE_DEPTH)
//
// Steps 3 and 4 belong to the *previous* diagonal because a tile's own diamond
// is covered by dual cells up to depth d+1 — the same reasoning terrain.ts's
// header gives for emitting features at tileDepth + 1.5.
//
// The offsets come from terrain.ts rather than being written out again here:
// the two renderers must agree on the interleave or the designer stops
// predicting the game, and a bucket index derived from the shared constants
// cannot drift from the sort key they also define.
//
// This is also the shape the Bevy port wants: a z-index per diagonal, not a
// global sort.

export type IsoTerrain = {
  container: Container;
  // Toggles whole diagonals on and off. Cheap enough to call on every viewport
  // move; the scene is static, so nothing else has to happen.
  cull(bounds: { x: number; y: number; width: number; height: number }): void;
  rows: number;
};

// Flat blue stand-in for water, which has no place in the material stack yet
// (PLAN.md, open questions — it is still the one gap A, D and T all logged).
// Drawn over the floor rather than instead of it, so the tile's substrate still
// shows at the shoreline where neighbouring cells spill into it.
const WATER_COLOR = 0x2e6db4;

function wallsAndRims(
  field: TileField,
  tileMap: Tile[][],
  col: number,
  row: number,
  ox: number,
  oy: number,
  onTileClick: (tile: Tile) => void,
): Graphics {
  const surface = field.at(col, row);
  const [x, y] = tileOrigin(col, row, surface.level);
  const left: [number, number] = [ox + x, oy + y + TILE_H / 2];
  const top: [number, number] = [ox + x + TILE_W / 2, oy + y];
  const right: [number, number] = [ox + x + TILE_W, oy + y + TILE_H / 2];
  const bottom: [number, number] = [ox + x + TILE_W / 2, oy + y + TILE_H];

  const g = new Graphics();
  const cliffH = surface.level * CLIFF_UNIT;
  if (cliffH > 0) {
    // The tile's own substrate stands in for the wall colour, exactly as
    // terrain.ts does it — v1 used the biome's flat `textureColor` here, which
    // is why a cliff never matched the ground on top of it.
    const wall = surface.substrate.ramp[1]!;
    g.poly([left, bottom, [bottom[0], bottom[1] + cliffH], [left[0], left[1] + cliffH]].flat());
    g.fill({ color: darken(wall, CLIFF_LEFT_SHADE) });
    g.poly([bottom, right, [right[0], right[1] + cliffH], [bottom[0], bottom[1] + cliffH]].flat());
    g.fill({ color: darken(wall, CLIFF_RIGHT_SHADE) });
  }

  const rim = { color: RIM_COLOR, alpha: 1, pixelLine: true as const };
  const neighbourLevel = (dc: number, dr: number) => field.at(col + dc, row + dr).level;
  const stroke = (a: [number, number], b: [number, number]) => {
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.stroke(rim);
  };
  if (surface.level !== neighbourLevel(-1, 0)) stroke(top, left);
  if (surface.level !== neighbourLevel(0, -1)) stroke(top, right);
  if (surface.level !== neighbourLevel(0, 1)) stroke(left, bottom);
  if (surface.level !== neighbourLevel(1, 0)) stroke(bottom, right);

  // The floor sprites cover the diamond, so the hit area is declared rather
  // than drawn — v1 kept a flat fill underneath purely to be clickable.
  g.eventMode = "static";
  g.hitArea = {
    contains(px: number, py: number) {
      const dx = Math.abs(px - (ox + x + TILE_W / 2)) / (TILE_W / 2);
      const dy = Math.abs(py - (oy + y + TILE_H / 2)) / (TILE_H / 2);
      return dx + dy <= 1;
    },
  };
  g.on("click", () => onTileClick(tileMap[col]![row]!));
  return g;
}

export function createIsoTerrain({
  field,
  tileMap,
  floor,
  seed,
  offsetX,
  offsetY,
  onTileClick,
  vegetationFor,
}: {
  field: TileField;
  tileMap: Tile[][];
  floor: FloorAtlas;
  seed: number;
  offsetX: number;
  offsetY: number;
  onTileClick: (tile: Tile) => void;
  // Vegetation stays the game's own sprite pipeline (PLAN.md: interactive flora
  // is explicitly out of the designer's scope); it just needs a depth slot.
  vegetationFor: (tile: Tile, level: number) => Container[];
}): IsoTerrain {
  const { atlas } = floor;
  const container = new Container();
  const rowCount = field.width + field.height;
  const rows: Container[] = [];
  for (let d = 0; d < rowCount; d++) {
    const c = new Container();
    rows.push(c);
    container.addChild(c);
  }

  // 1. Walls and rims, at their tile's own depth.
  for (let row = 0; row < field.height; row++) {
    for (let col = 0; col < field.width; col++) {
      rows[col + row + TILE_DEPTH]!.addChild(
        wallsAndRims(field, tileMap, col, row, offsetX, offsetY, onTileClick),
      );
    }
  }

  // 2. Floor sprites, one quad per composed cell sprite. Every lookup resolves
  //    because the atlas was built for this field (`buildFieldAtlas`), clipped
  //    variants included — a miss here would be a hole at a cliff.
  const { c0, r0, c1, r1 } = cellBounds(field);
  for (let c = c0; c <= c1; c++) {
    for (let r = r0; r <= r1; r++) {
      const depth = cellDepth(c, r) + CELL_DEPTH;
      if (depth < 0 || depth >= rowCount) continue;
      for (const s of composeCell(field, atlas, c, r, { seed })) {
        const ref = atlas.lookup(s.key, s.density, s.code, s.shape, s.bias, s.clip);
        if (ref === null) continue;
        const sprite = new Sprite(floor.textureFor(ref));
        sprite.x = offsetX + s.x + ref.offsetX;
        sprite.y = offsetY + s.y + ref.offsetY;
        rows[depth]!.addChild(sprite);
      }
    }
  }

  // 3 + 4. Water, scatter features and vegetation, one diagonal later than the
  //        tile they belong to (see the header).
  const featureAtlas = buildFeatureAtlas(fieldFeatureInstances(field), seed);
  const featureTexture = featureTextures(featureAtlas);
  for (let row = 0; row < field.height; row++) {
    for (let col = 0; col < field.width; col++) {
      // Features land at tileDepth + 1.5, i.e. after everything in row
      // tileDepth + 1 and before row tileDepth + 2 — so they bucket into the
      // floor() of that, which is the diagonal after their host tile's.
      const depth = Math.floor(col + row + FEATURE_DEPTH);
      if (depth >= rowCount) continue;
      const surface = field.at(col, row);
      const tile = tileMap[col]![row]!;
      const [x, y] = tileOrigin(col, row, surface.level);

      if (tile.water) {
        const g = new Graphics();
        g.poly([
          offsetX + x + TILE_W / 2, offsetY + y,
          offsetX + x + TILE_W, offsetY + y + TILE_H / 2,
          offsetX + x + TILE_W / 2, offsetY + y + TILE_H,
          offsetX + x, offsetY + y + TILE_H / 2,
        ]);
        g.fill({ color: WATER_COLOR });
        rows[depth]!.addChild(g);
      }

      for (const f of featuresForTile(surface, col, row, seed)) {
        const ref = featureAtlas.lookup(f.key, f.shape);
        if (ref === null) continue;
        const sprite = new Sprite(featureTexture(ref));
        sprite.x = offsetX + f.x + ref.offsetX;
        sprite.y = offsetY + f.y + ref.offsetY;
        rows[depth]!.addChild(sprite);
      }

      for (const veg of vegetationFor(tile, surface.level)) rows[depth]!.addChild(veg);
    }
  }

  return {
    container,
    rows: rowCount,
    cull(bounds) {
      for (let d = 0; d < rowCount; d++) {
        const r = rows[d]!;
        const b = r.getLocalBounds();
        r.renderable =
          b.maxX >= bounds.x &&
          b.minX <= bounds.x + bounds.width &&
          b.maxY >= bounds.y &&
          b.minY <= bounds.y + bounds.height;
      }
    },
  };
}

// Feature sprites are still their own small atlas — F deferred packing them
// into the main pages "to G", and at three kinds × 4 shapes of at most 32 KB
// that is still not worth the packer machinery. Twelve small textures, cut once
// per build and shared by every placement on the map.
function featureTextures(featureAtlas: FeatureAtlas): (ref: FeatureSpriteRef) => Texture {
  const cache = new Map<FeatureSpriteRef, Texture>();
  return (ref) => {
    let texture = cache.get(ref);
    if (texture === undefined) {
      const canvas = document.createElement("canvas");
      canvas.width = ref.w;
      canvas.height = ref.h;
      const ctx = canvas.getContext("2d")!;
      ctx.putImageData(new ImageData(new Uint8ClampedArray(ref.data), ref.w, ref.h), 0, 0);
      texture = Texture.from(canvas);
      texture.source.scaleMode = "nearest";
      cache.set(ref, texture);
    }
    return texture;
  };
}
