# Local World — Water Features

See [BIOME_LOCAL.md](BIOME_LOCAL.md) for index.

---

Water features are **tile flags**, not biomes. Biome assignment is never overwritten. A pond tile is still a Taiga tile (or Grassland, etc.) with `water: true` on top. This keeps the biome cascade, CA, and all axis logic untouched.

```typescript
water:     boolean
waterType: 'pond' | 'river'
```

Both feature types are placed **opportunistically** from tile-scale elevation and drainage data already computed in Stage 7 — no flow graphs, no source tracking.

---

## Ponds

Placement condition (per tile):

1. Tile is a **local elevation minimum** — lower than all 8 neighbors.
2. The patch containing the tile has `drainage < 0.30`.

From each qualifying minimum, flood-fill outward: absorb neighboring tiles while their elevation is within `POND_DEPTH_TOLERANCE` above the minimum. Stop when the fill hits the cap or runs out of qualifying tiles.

| Constraint       | Value          |
| ---------------- | -------------- |
| Min area         | 4 tiles        |
| Max area         | 50 tiles       |
| Min separation   | 10 tiles (edge to edge) |
| `POND_DEPTH_TOLERANCE` | 0.03 (normalized elevation units) |

Ponds below min area are discarded. If two fills would overlap within the separation distance, the larger one wins.

---

## Rivers

Placement condition (per patch pair):

A river segment is placed through a patch when the **elevation gradient to a downhill neighbor patch** exceeds `RIVER_GRADIENT_THRESHOLD`. Adjacent qualifying patches form a river chain.

Within each qualifying patch, the river occupies **1 tile wide** along the steepest-descent path through the patch's tile-scale elevation data.

Termination — a river chain ends when:
- It reaches a pond tile (feeds into it).
- It reaches the map edge.
- The gradient to the next patch falls below threshold.
- The chain exceeds `RIVER_MAX_PATCHES`.

| Constant                  | Value |
| ------------------------- | ----- |
| `RIVER_GRADIENT_THRESHOLD`| 0.08  |
| `RIVER_MAX_PATCHES`       | 40    |

Rivers are always passable. Width is always 1 tile — no branching, no confluences.

---

## Pass order

Stage 8 runs after Stage 7 (tile modifier pass) because it needs tile-scale elevation and drainage. It reads only; it does not modify axis values or biome assignments.

Pond placement runs before river placement so rivers can terminate correctly at pond edges.

---

## Implementation Notes

Implemented in `stage8_waterFeatures()`, `placePonds()`, and `placeRivers()` in `src/tileGenerator/pipeline.ts`. Pass order matches spec: ponds first, then rivers.

**Ponds** — fully match spec. Flood-fill uses von Neumann (4-neighbor) expansion. Separation check scans in cardinal directions up to `POND_MIN_SEPARATION` tiles from every fill tile.

**Rivers — intentionally simple placement**
- Each qualifying patch contributes exactly 1 river tile: the lowest-altitude tile within the patch's tile footprint. This is intentional — rivers mark where water naturally collects, not a continuous geometric path. Adjacent river tiles are not guaranteed to be 4-connected; that is acceptable for the current use case (tile flags for gameplay effects). A path-tracing step can be added later if a continuous line is needed for rendering.

**River termination at pond**
- Checks `waterType === "pond"` on the center tile of the candidate next patch. May miss cases where the pond does not overlap the patch center tile.
