# Local World — Biome Selection

See [BIOME_LOCAL.md](BIOME_LOCAL.md) for index.

---

## Biome Selection: Hierarchical Noise

Noise selects the biome; the biome generates the parameters. This eliminates the classifier entirely — parameters are always in-range by construction, so score aggregation and zero-floor failure modes do not exist.

### Altitude pre-check

Before temperature or moisture analysis, check altitude. If **altitude > 0.40**, route the patch to the **montane branch** of the cascade regardless of temperature. The montane cascade uses the same three-level structure (Levels 1–3 below) but targets high-altitude biomes (Alpine, Cloud Forest). Patches with altitude ≤ 0.40 use the lowland branch.

### Level 1 — Temperature zone (coarse noise)

A low-frequency noise field samples the temperature zone for each patch. Its mean is anchored to the parent segment's base temperature, so the dominant zone is almost always the parent's — coarse noise only causes zone shifts at high amplitude, which naturally concentrates at segment borders.

| Zone      | Lower bound (°C) |
| --------- | ---------------- |
| Arctic    | < −5             |
| Cold      | −5               |
| Temperate | 5                |
| Warm      | 18               |
| Hot       | 35               |

Thresholds are derived from `temperatureRange` midpoints in `biomes.ts` (e.g. −5 °C is the Taiga/Boreal Bog midpoint, separating them from Tundra's midpoint of −8; 18 °C falls between the highest temperate midpoint (Mediterranean: 17) and the lowest warm midpoint (Desert: 25); 35 °C falls between the highest warm midpoint (Savanna: 26.5) and Hot Desert's midpoint of 45).

At segment borders (Stage 4 blend zone), the coarse noise transitions toward the neighboring segment's zone. The output is:

- a **dominant zone**
- a **blend weight** toward a second zone (non-zero only in the border zone)

### Level 2 — Moisture regime (fine noise)

Within each temperature zone, a second noise field separates moisture regimes. The **same four buckets apply in every zone and in both branches** (montane and lowland), making the axis uniform across the whole cascade:

| Regime    | Precipitation lower bound | Derived from                                          |
| --------- | ------------------------- | ----------------------------------------------------- |
| Arid      | 0.00                      | —                                                     |
| Semi-arid | 0.15                      | Desert / Cold Desert `precipitationRange` upper bound |
| Mesic     | 0.35                      | Alpine `precipitationRange` lower bound               |
| Wet       | 0.60                      | Tropical Swamp `precipitationRange` lower bound       |

The output is a **moisture regime** (or a blend weight between two adjacent regimes when fine noise lands near a boundary).

### Level 3 — Drainage tiebreaker

Where two biomes share the same temperature zone and moisture regime, drainage distinguishes the remaining variants. Only four moisture buckets require a split; all others contain a single biome or stub:

| Branch  | Temperature | Moisture  | Drainage threshold | Low → High drainage                  |
| ------- | ----------- | --------- | ------------------ | ------------------------------------ |
| Lowland | Cold        | Mesic     | 0.15               | Boreal Bog → Taiga                   |
| Lowland | Temperate   | Semi-arid | 0.50               | Mediterranean → Grassland            |
| Lowland | Temperate   | Wet       | 0.25               | Temperate Wetland → Temperate Forest |
| Lowland | Warm        | Wet       | 0.20               | Tropical Swamp → Tropical Rainforest |

Thresholds are derived from `drainageRange` upper bounds in `biomes.ts` (e.g. 0.15 = Boreal Bog upper; 0.25 = Temperate Wetland upper; 0.20 = Tropical Swamp upper). The Temperate/Semi-arid threshold (0.50) is the midpoint of the overlap zone between Mediterranean [0.30, 0.65] and Grassland [0.35, 0.70].

### Parameter generation

Each variant defines a parameter distribution `{ mean, stddev }` per axis. Tile parameters are sampled from this distribution, then local modifiers are applied:

- elevation gradient → adjusts drainage (steeper slope → better drainage)
- slope aspect (north/south-facing) → adjusts light

Derived values (`effectiveMoisture`, `continentality`) are computed last, after modifiers.

### Ecotones

Two ecotone types emerge without special handling:

- **Inter-family** (segment borders) — the Level 1 blend weight interpolates between two families' parameter distributions before variant selection. A tile in the blend zone draws from a weighted mix of both families.
- **Intra-family** (within local world) — fine noise landing near a variant boundary produces a blend between two adjacent variants' distributions. A Taiga tile near the drainage threshold naturally drifts toward Boreal Bog character.

---

## Temperature Zone Adjacency

Level 1 coarse noise at a segment border may only blend toward a zone that is directly adjacent in the temperature order. This prevents ecologically impossible transitions (e.g. Cold blending into Hot without Temperate in between).

The order and adjacency map are exported from `src/tileMap/biomeVariants.ts`:

```
TEMP_ZONE_ORDER:     arctic → cold → temperate → warm → hot
TEMP_ZONE_ADJACENCY: each zone may blend only with itself and its immediate neighbours
```

At a segment edge the blend logic reads the dominant zone from both segments, verifies the pair appears in `TEMP_ZONE_ADJACENCY`, and interpolates only if they are adjacent. If two non-adjacent segments share an edge (only possible if the global map generated them that way), the blend is skipped and a hard cut is used instead.

---

## Constants

All thresholds are resolved in `src/tileMap/biomeVariants.ts` and exported as named constants (`TEMP_*_LB`, `PRECIP_*_LB`, `ALTITUDE_MONTANE_THRESHOLD`).

`Biome.paramDist` (`BiomeParamDist`) is computed from each biome's ranges via `withDist()` in `biomes.ts`: `mean = (lo + hi) / 2`, `stddev = (hi - lo) / 6` (3σ containment within range). Override per-biome in `rawBiomes` when ecological character warrants a tighter or asymmetric distribution.

---

## Implementation Notes

**Cascade** — fully implemented in `selectBiomeId()` in `src/tileGenerator/pipeline.ts`. The cascade reads altitude, temperature, precipitation, and drainage values produced by Stages 2–3 and routes them through the three-level hierarchy.

**Level 1/2 noise fields** — not implemented as separate noise layers. Temperature zone and moisture regime are resolved from the axis values already computed by Stage 2 noise, which is anchored to the segment base temperature. The distinction between "coarse" and "fine" noise fields is collapsed — Stage 2 covers both.

**Level 1/2 blend weights** — not implemented. The cascade makes a hard cut at each threshold. Inter-family ecotones emerge from Stage 4 axis blending (the blended axis values feed naturally into the cascade). Intra-family blend weights (a tile near the drainage threshold drawing from two adjacent variants' distributions) are an open gap.

**Parameter generation from `paramDist`** — implemented in Stage 8. Temperature and precipitation are sampled from the tile's assigned biome's `paramDist` distributions (Box-Muller, clamped to biome range). Altitude, drainage, and light remain geophysically derived.
