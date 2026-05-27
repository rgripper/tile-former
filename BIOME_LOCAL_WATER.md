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

After smoothing, a riparian pass marks land tiles adjacent to pond tiles as `riparian: true`. These tiles represent the transitional wet-margin zone — reeds, muddy banks, saturated soil — between open water and dry land.

**Width** is 1–2 tiles and varies continuously with local drainage:

- **Distance 1** (immediate neighbours) — always riparian.
- **Distance 2** — included only if `noise > tile.drainage × 1.5 − 1.0`, where noise is a low-frequency simplex value per tile (scale 0.18).

The threshold formula means:

| Tile drainage | Distance-2 inclusion |
| ------------- | -------------------- |
| 0.0 (boggy)   | Always (threshold −1.0, noise always exceeds) |
| 0.5 (medium)  | ~60 % of tiles |
| 1.0 (rocky)   | ~25 % of tiles |

The noise unevenness makes the fringe look organic rather than a perfect ring. Riparian tiles retain their biome assignment — a Taiga tile with `riparian: true` is still Taiga; the flag is purely additive for gameplay and rendering.

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

**Riparian** — runs after smoothing. `placeRiparian()` seeds a BFS from every water tile, propagates Chebyshev distance up to 2, and applies the drainage-gated threshold to distance-2 tiles. The simplex noise seed is `config.seed + "_riparian"`.
