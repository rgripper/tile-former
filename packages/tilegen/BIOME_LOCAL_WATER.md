# Local World — Water Features

See [BIOME_LOCAL.md](BIOME_LOCAL.md) for index.

---

Water features are **tile flags**, not biomes. Biome assignment is never overwritten. A pond tile is still a Taiga tile (or Grassland, etc.) with `water: true` on top. This keeps the biome cascade, CA, and all axis logic untouched.

```typescript
water:     boolean
waterType: 'pond' | undefined
```

Features are placed **opportunistically** from tile-scale elevation and drainage data already computed in Stage 7 — no flow graphs, no source tracking.

---

## Ponds

Placement condition (per tile):

1. Tile is a **local elevation minimum** — lower than all 8 neighbors.
2. The patch containing the tile has `drainage < drainageThreshold` (scaled by `pondDensity`).

From each qualifying minimum, flood-fill outward: absorb neighboring tiles while their elevation is within `POND_DEPTH_TOLERANCE` above the minimum. Stop when the fill hits the cap or runs out of qualifying tiles.

| Constraint             | Value at `pondDensity = 1` | Value at `pondDensity = 0.5` (default) |
| ---------------------- | -------------------------- | -------------------------------------- |
| Min area               | 4 tiles                    | 4 tiles                                |
| Max area               | 50 tiles                   | 25 tiles                               |
| Min separation         | 10 tiles (edge to edge)    | 20 tiles                               |
| Drainage threshold     | 0.30                       | 0.15                                   |
| `POND_DEPTH_TOLERANCE` | 0.03 (both)                | 0.03 (both)                            |

Setting `pondDensity = 0` skips pond placement entirely. Ponds below min area are discarded. If two fills would overlap within the separation distance, the larger one wins.

---

## Pass order

Stage 8 runs after Stage 7 (tile modifier pass) because it needs tile-scale elevation and drainage. It reads only; it does not modify axis values or biome assignments.

---

## Riparian fringe

After smoothing, a riparian pass assigns each land tile a `riparian` value in `[0, 1]` representing proximity to water. These tiles represent the transitional wet-margin zone — reeds, muddy banks, saturated soil — between open water and dry land.

```typescript
riparian: number  // [0, 1] — 1 = adjacent to water, 0 = dry land
```

**Width** is 1–2 tiles; the value depends on distance and local drainage:

- **Distance 1** (immediate neighbours) — `riparian = 1.0` always.
- **Distance 2** — `riparian = clamp((noise − threshold) / 2, 0, 1)`, where
  - `threshold = tile.drainage × 1.5 − 1.0` (ranges from −1.0 to +0.5)
  - `noise` is a low-frequency simplex value per tile (scale 0.18)

The threshold formula produces naturally wider, wetter fringes on boggy ground and narrower, weaker fringes on well-drained or rocky ground:

| Tile drainage | Dist-2 riparian value |
| ------------- | --------------------- |
| 0.0 (boggy)   | `(noise + 1) / 2` → ~0.5 average, always > 0 |
| 0.5 (medium)  | `(noise + 0.25) / 2` → ~0.31 average |
| 1.0 (rocky)   | `(noise − 0.5) / 2` → ~0.125 average, often 0 |

The noise unevenness makes the fringe look organic rather than a perfect ring. Riparian tiles retain their biome assignment — a Taiga tile with `riparian > 0` is still Taiga; the value is purely additive for gameplay and rendering (e.g. fertility scales as `× (1 + 0.3 × riparian)`).

---

## Pond shape smoothing

After all ponds are placed, two CA iterations clean up jagged shapes:

| Rule | Condition | Effect |
| ---- | --------- | ------ |
| Fill internal specs | Land tile with **≥ 6** of 8 Moore neighbours water | Becomes water (`waterType: "pond"`) |
| Erode isolated spikes | Water tile with **≤ 2** of 8 Moore neighbours water | Becomes land |

Each iteration reads a snapshot of the current state and applies all changes simultaneously (synchronous update), so no tile influences its own rule within the same pass. Two iterations are enough to close single-tile land holes inside ponds and remove thin one-tile spikes at the edges without meaningfully expanding pond area.

---

## Implementation Notes

Implemented in `stage8_waterFeatures()` → `placePonds()` → `smoothPonds()` in `src/tileGenerator/stage8.ts`.

**Ponds** — fully match spec. Flood-fill uses von Neumann (4-neighbor) expansion. Separation check scans in cardinal directions up to `effectiveMinSep` tiles from every fill tile. All three density knobs (drainage threshold, max area, min separation) are derived from the single `pondDensity` config parameter.

**Smoothing** — runs after pond placement on the full tile grid. `smoothPonds()` uses the Moore 8-neighbourhood with the thresholds above, repeated twice.

**Riparian** — runs after smoothing. `placeRiparian()` seeds a BFS from every water tile, propagates Chebyshev distance up to 2, assigns `riparian = 1.0` at distance 1, and computes a continuous `[0, 1]` value at distance 2 via `clamp((noise − threshold) / 2, 0, 1)`. The simplex noise seed is `config.seed + "_riparian"`.
