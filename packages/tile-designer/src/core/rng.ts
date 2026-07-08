// Deterministic, allocation-free RNG utilities. All generation must flow
// through these so bakes are reproducible from (input, seed) alone.

// mulberry32 — small, fast, good-enough distribution for visual noise.
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D integer hash → [0,1). Used for per-pixel/world-coordinate noise so that
// adjacent tiles sampling the same world coords get the same values (seams).
export function hash2D(x: number, y: number, seed: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (x | 0), 0x85ebca6b);
  h = Math.imul(h ^ (y | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// Tile seed from world tile coordinates + world seed.
export function tileSeed(tileX: number, tileY: number, worldSeed: number): number {
  return Math.floor(hash2D(tileX, tileY, worldSeed) * 0xffffffff);
}
