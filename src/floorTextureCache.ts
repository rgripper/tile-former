import { Texture } from "pixi.js";
import type { Tile } from "@tile-former/tilegen";
import { TILE_H, TILE_W, type DesignInput } from "@tile-former/tile-designer";
import { bakeFloorBuffer, bufferToTexture, tileToDesignInput, tileWorldOrigin } from "./floorTextures.ts";

// Persists baked floor textures across page loads, keyed by a hash of the
// tile's *quantized* visual properties (+ world position + seed) rather than
// its exact float properties — see tile-designer/PLAN.md, "Baking &
// determinism". Bump CACHE_VERSION whenever the bake pipeline changes shape,
// so stale entries from an old pixel layout are never read back.
const CACHE_VERSION = 1;
const DB_NAME = "tile-former-floor-cache";
const STORE_NAME = "textures";

type CachedBuffer = { width: number; height: number; data: Uint8ClampedArray };

function quantizeKey(input: DesignInput): string {
  const q = (v: number, buckets: number) => Math.round(v * buckets);
  return [
    `t${Math.round(input.temperature)}`,
    `m${q(input.effectiveMoisture, 8)}`,
    `d${q(input.drainage, 8)}`,
    `l${q(input.groundLight, 6)}`,
    `a${q(input.altitude, 8)}`,
    `f${q(input.fertility, 8)}`,
    `r${q(input.riparian, 8)}`,
    `fd${q(input.forestDensity, 8)}`,
    `rk${input.rockType}`,
    `w${input.water ? 1 : 0}`,
    `b${input.biomeId ?? "x"}`,
  ].join("_");
}

function cacheKey(tile: Tile, worldSeed: number): string {
  const { ox, oy } = tileWorldOrigin(tile);
  return `v${CACHE_VERSION}|${ox},${oy}|s${worldSeed}|${quantizeKey(tileToDesignInput(tile))}`;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Bakes (or loads from IndexedDB) every tile's floor texture up front, before
// the render loop runs, so per-frame tile creation is a synchronous map
// lookup. Returns textures keyed by "col,row".
export async function warmFloorTextureCache(
  tiles: Tile[],
  worldSeed: number,
): Promise<Map<string, Texture>> {
  const textures = new Map<string, Texture>();

  let db: IDBDatabase | null;
  try {
    db = await openDb();
  } catch {
    db = null; // IndexedDB unavailable (disabled/private mode) — bake without persistence.
  }

  const entries = tiles.map((tile) => ({
    tile,
    tileKey: `${tile.index.x},${tile.index.y}`,
    dbKey: cacheKey(tile, worldSeed),
  }));

  const misses: typeof entries = [];

  if (db) {
    const readTx = db.transaction(STORE_NAME, "readonly");
    const store = readTx.objectStore(STORE_NAME);
    const records = await Promise.all(
      entries.map((e) => reqToPromise(store.get(e.dbKey) as IDBRequest<CachedBuffer | undefined>)),
    );
    records.forEach((record, i) => {
      const entry = entries[i]!;
      if (record) {
        textures.set(entry.tileKey, bufferToTexture(record.width, record.height, record.data));
      } else {
        misses.push(entry);
      }
    });
  } else {
    misses.push(...entries);
  }

  if (misses.length > 0) {
    const baked = misses.map((entry) => ({
      entry,
      buffer: bakeFloorBuffer(entry.tile, worldSeed),
    }));
    for (const { entry, buffer } of baked) {
      textures.set(entry.tileKey, bufferToTexture(TILE_W, TILE_H, buffer.data));
    }
    if (db) {
      const writeTx = db.transaction(STORE_NAME, "readwrite");
      const store = writeTx.objectStore(STORE_NAME);
      for (const { entry, buffer } of baked) {
        const record: CachedBuffer = { width: TILE_W, height: TILE_H, data: buffer.data };
        store.put(record, entry.dbKey);
      }
    }
  }

  return textures;
}
