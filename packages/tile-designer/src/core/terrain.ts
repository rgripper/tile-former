// Milestone T: renders a whole TileField to one PixelBuffer, combining the
// dual-grid floor composition (compose.ts) with the per-tile cliff faces and
// altitude rims that compose.ts's own comments name as "the renderer's job,
// not the atlas's" (see compose.ts, "Altitude is a bitwise AND"). This is the
// designer's first surface where biome mixing and altitude steps can be judged
// together instead of one zoomed tile at a time (PLAN.md, milestone T).
//
// --- Two coordinate grids, one canvas ---
//
// Cliff faces and rims are a *tile* concept (a wall stands where one tile's
// own floor level differs from a neighbour's); the composed floor sprites are
// a *dual-cell* concept, offset from the tile grid by TILE_H/2 (masks.ts).
// `tileOrigin` is that relationship read backwards from `compose.ts`'s
// `cellOrigin`: a tile's own bounding-box origin is the dual cell at the same
// (col, row) shifted back up by half a tile.
//
// --- Depth order across the two grids ---
//
// Painting back-to-front by `col + row` is what compose.ts already uses for
// dual cells (`cellDepth`) and what the live game uses for tiles
// (`isoRenderer.ts`, sorted by `index.y + index.x`). The two can't share that
// key unmodified: dual cell (c, r) sits, on screen, between tile (c, r) and
// tile (c+1, r+1) — its apparent depth is the tile grid's `c + r`, shifted by
// half a cell in each axis, i.e. `c + r + 1`. Using `cellDepth + 1` for dual
// cells and the bare `col + row` for tiles interleaves the two correctly:
// a tile's cliff face is drawn behind the dual cells straddling its far edge
// and in front of the ones straddling its near edge, which is what lets an
// elevated tile's wall correctly occlude the floor sprites behind it.
//
// This is a prototype of an interleaving problem milestone G has to solve for
// real inside Pixi's container ordering; this file is where it was worked out.

import type { Atlas } from "./atlas.ts";
import { blitSprite } from "./atlas.ts";
import { blitFeature, buildFeatureAtlas, type FeatureAtlas } from "./features/index.ts";
import { cellBounds, cellDepth, cellOrigin, composeCell, featuresForTile, fieldFeatureInstances, type ComposeOptions, type TileField, type TileSurface } from "./compose.ts";
import { CODE_FULL, CORNER_TILE_OFFSETS, nominalMask } from "./masks.ts";
import { fbm } from "./noise.ts";
import { drawLine, fillPolygon, makeBuffer, type PixelBuffer } from "./pixels.ts";
import { CLIFF_UNIT, MAX_FLOORS, TILE_H, TILE_W } from "./types.ts";

// --- Tile geometry -------------------------------------------------------------

// Top-left of tile (col, row)'s TILE_W×TILE_H cell rect at a given floor level,
// in native world pixels — the dual grid's `cellOrigin` shifted back up by the
// half-tile offset that defines it (masks.ts, "Dual-grid geometry").
export function tileOrigin(col: number, row: number, level = 0): [x: number, y: number] {
  const [x, y] = cellOrigin(col, row, level);
  return [x, y - TILE_H / 2];
}

// --- Cliff faces + rims ----------------------------------------------------------

// Matches isoRenderer.ts's darken(): a flat multiplicative shade, since the
// cliff face is a single flat quad standing in for the tile's substrate, not a
// textured surface.
export function darken(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  const b = Math.round((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

// Exported for tests: exact-color assertions on cliff/rim pixels are more
// robust than eyeballing a rendered PNG, and the constants are cheap to expose.
export const CLIFF_LEFT_SHADE = 0.6;
export const CLIFF_RIGHT_SHADE = 0.42;
export const RIM_COLOR = 0x2a2a2a;

// Draws one tile's cliff walls (if elevated) and rim strokes on any edge whose
// neighbour sits at a different floor level. Geometry and neighbour mapping
// mirror isoRenderer.ts's `createIsoTiles` exactly, just in TILE_W/H's 2×
// native-bake scale instead of the screen's ISO_W/H.
function drawTileWalls(
  buf: PixelBuffer,
  field: TileField,
  col: number,
  row: number,
  surface: TileSurface,
  ox: number,
  oy: number,
): void {
  const [x, y] = tileOrigin(col, row, surface.level);
  const cliffH = surface.level * CLIFF_UNIT;

  const top: [number, number] = [ox + x + TILE_W / 2, oy + y];
  const right: [number, number] = [ox + x + TILE_W, oy + y + TILE_H / 2];
  const bottom: [number, number] = [ox + x + TILE_W / 2, oy + y + TILE_H];
  const left: [number, number] = [ox + x, oy + y + TILE_H / 2];

  if (cliffH > 0) {
    // The tile's own substrate stands in for a flat wall colour — the closest
    // thing v2 has to v1's single flat tile colour, and the whole point of
    // `tileSurface` collapsing a blended substrate to one winner (compose.ts).
    const wall = surface.substrate.ramp[1];
    const leftColor = darken(wall, CLIFF_LEFT_SHADE);
    const rightColor = darken(wall, CLIFF_RIGHT_SHADE);
    fillPolygon(
      buf,
      [left, bottom, [bottom[0], bottom[1] + cliffH], [left[0], left[1] + cliffH]],
      leftColor,
    );
    fillPolygon(
      buf,
      [bottom, right, [right[0], right[1] + cliffH], [bottom[0], bottom[1] + cliffH]],
      rightColor,
    );
  }

  const neighborLevel = (dc: number, dr: number) => field.at(col + dc, row + dr).level;
  if (surface.level !== neighborLevel(-1, 0)) drawLine(buf, ...top, ...left, RIM_COLOR);
  if (surface.level !== neighborLevel(0, -1)) drawLine(buf, ...top, ...right, RIM_COLOR);
  if (surface.level !== neighborLevel(0, 1)) drawLine(buf, ...left, ...bottom, RIM_COLOR);
  if (surface.level !== neighborLevel(1, 0)) drawLine(buf, ...bottom, ...right, RIM_COLOR);
}

// --- Canvas extent -----------------------------------------------------------

// The true pixel bounding box of everything `renderTerrain` can draw: the dual
// grid's one-tile fringe (cellBounds) at every level from 0 to `maxLevel`, plus
// the tile grid proper at the same level range. Computed by brute force over
// the (small) field rather than by a closed-form formula — the two grids'
// offsets from each other make a hand-derived bound easy to get subtly wrong,
// and silently clipping the edge of a preview is a worse failure than a few
// wasted transparent pixels.
function terrainExtent(
  field: TileField,
  maxLevel: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  const { c0, r0, c1, r1 } = cellBounds(field);
  for (let c = c0; c <= c1; c++) {
    for (let r = r0; r <= r1; r++) {
      for (const level of [0, maxLevel]) {
        const [x, y] = cellOrigin(c, r, level);
        grow(x, y);
        grow(x + TILE_W, y + TILE_H);
      }
    }
  }
  for (let c = 0; c < field.width; c++) {
    for (let r = 0; r < field.height; r++) {
      for (const level of [0, maxLevel]) {
        const [x, y] = tileOrigin(c, r, level);
        grow(x, y);
        grow(x + TILE_W, y + TILE_H);
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

function fieldMaxLevel(field: TileField): number {
  let max = 0;
  for (let r = 0; r < field.height; r++) {
    for (let c = 0; c < field.width; c++) max = Math.max(max, field.at(c, r).level);
  }
  return max;
}

// --- Render --------------------------------------------------------------------

export type TerrainRender = {
  buffer: PixelBuffer;
  // Offset from field-local (native bake pixel) coordinates to buffer pixels —
  // callers positioning anything else on top (a selection cursor, say) need
  // this to agree with what got drawn.
  originX: number;
  originY: number;
};

// Renders every tile's cliff walls + rims and every dual cell's composed floor
// sprites into one buffer, in a single back-to-front depth-sorted pass (see the
// file header for why the two grids' depth keys differ by one).
//
// Milestone F adds the feature overhang layer. Its depth slot is NOT the host
// tile's own: a tile's diamond is covered by the four dual cells whose corners
// meet at its centre, all of which sit at tileDepth+1 or deeper in this sort.
// Drawing a feature at its tile's depth would have every one of its pixels
// painted over by those floor sprites. Features are therefore emitted at
// tileDepth + 1.5 — strictly above every floor sprite (the deepest cell that
// can touch the tile sits at tileDepth+2... but any cell overlapping the
// tile's rect has depth ≤ tileDepth+1, so +1.5 clears them all) and below
// nothing else, because scatter is the topmost floor layer by definition:
// pebbles and leaves lie ON the ground, whatever ground it is.
export function renderTerrain(
  field: TileField,
  atlas: Atlas,
  opts: ComposeOptions,
  features?: FeatureAtlas,
): TerrainRender {
  const maxLevel = fieldMaxLevel(field);
  const { minX, minY, maxX, maxY } = terrainExtent(field, maxLevel);
  const originX = -minX;
  const originY = -minY;
  const buffer = makeBuffer(Math.ceil(maxX - minX), Math.ceil(maxY - minY));
  const featureAtlas = features ?? buildFeatureAtlas(fieldFeatureInstances(field), opts.seed);

  type Item = { depth: number; draw: () => void };
  const items: Item[] = [];

  for (let row = 0; row < field.height; row++) {
    for (let col = 0; col < field.width; col++) {
      const surface = field.at(col, row);
      items.push({
        depth: col + row,
        draw: () => drawTileWalls(buffer, field, col, row, surface, originX, originY),
      });
      // Features at their own depth slot, above all floor (comment above).
      const placements = featuresForTile(surface, col, row, opts.seed);
      if (placements.length > 0) {
        items.push({
          depth: col + row + 1.5,
          draw: () => {
            for (const f of placements) {
              const ref = featureAtlas.lookup(f.key, f.shape);
              if (ref !== null) blitFeature(buffer, ref, originX + f.x, originY + f.y);
            }
          },
        });
      }
    }
  }

  const { c0, r0, c1, r1 } = cellBounds(field);
  for (let c = c0; c <= c1; c++) {
    for (let r = r0; r <= r1; r++) {
      const sprites = composeCell(field, atlas, c, r, opts);
      if (sprites.length === 0) continue;
      items.push({
        depth: cellDepth(c, r) + 1,
        draw: () => {
          for (const sprite of sprites) {
            const ref = atlas.lookup(sprite.key, sprite.density, sprite.code, sprite.shape, sprite.bias);
            if (ref === null) continue;
            // `clip` is CODE_FULL for every sprite outside a level straddle, so
            // the common path stays a plain blit (compose.ts, "Spill runs
            // downhill").
            const clip = sprite.clip === CODE_FULL ? undefined : nominalMask(sprite.clip);
            blitSprite(buffer, atlas, ref, originX + sprite.x, originY + sprite.y, clip);
          }
        },
      });
    }
  }

  items.sort((a, b) => a.depth - b.depth);
  for (const item of items) item.draw();

  return { buffer, originX, originY };
}

// --- Synthetic altitude scenario -----------------------------------------------

// A plausible floor-level field for exercising the preview: low-frequency
// coherent plateaus around a base level, never single-tile noise. Levels are
// chosen directly as integers (not derived from a continuous altitude that
// happens to round the way we want) so the caller gets exact control over which
// floor levels appear — `floorLevel(level / MAX_FLOORS)` round-trips exactly
// for any integer `level` in [0, MAX_FLOORS], so feeding that ratio back in as
// a tile's `altitude` reproduces this exact level through the real pipeline.
//
// `span` and `frequency` are exposed (rather than fixed) because the right
// scale depends on the grid size being previewed — see terrainLevelField's own
// default, which ties frequency to grid size so a preview always shows a
// handful of plateaus rather than one flat field or all noise.
export function terrainLevel(
  col: number,
  row: number,
  seed: number,
  base: number,
  span: number,
  frequency: number,
): number {
  const n = fbm(col, row, seed ^ 0x9c7f9e13, frequency) - 0.5; // ~[-0.5, 0.5)
  const level = base + Math.round(n * 2 * span);
  return Math.max(0, Math.min(MAX_FLOORS, level));
}

// Frequency tuned so a grid this wide shows a handful of plateaus rather than
// one flat field (too low) or per-tile noise (too high) — see terrain.test.ts's
// straddle-rate measurement, calibrated against milestone D's real-map figure
// of 17.2% of dual cells straddling two levels.
export function defaultLevelFrequency(gridSize: number): number {
  return 1.4 / gridSize;
}

// Fraction of interior dual cells (excluding the one-tile map fringe, which
// isn't a real cell) whose four corners span more than one floor level — the
// same measurement compose.ts's "Altitude is a bitwise AND" log reports for
// real maps (17.2%). Exported so both the terrain preview panel and its tests
// can check a synthetic scenario against that figure instead of eyeballing it.
export function straddleFraction(field: TileField): number {
  let straddling = 0;
  let total = 0;
  for (let r = 0; r < field.height - 1; r++) {
    for (let c = 0; c < field.width - 1; c++) {
      const levels = new Set(CORNER_TILE_OFFSETS.map(([du, dv]) => field.at(c + du, r + dv).level));
      total++;
      if (levels.size > 1) straddling++;
    }
  }
  return total === 0 ? 0 : straddling / total;
}
