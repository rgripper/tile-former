# Local World Generation

See [BIOME_GLOBAL.md](BIOME_GLOBAL.md) for global map and segment generation.

---

Each segment contains one **local world** (~5 km), placed somewhere within the segment's full area. The local world is the playable map — the scale where individual tiles, terrain features, rivers, and ecotones are generated. The remainder of the segment area is not playable but may host global-scale features (e.g. long-distance roads, regional landmarks) that exist outside any single local world.

The local world is seeded from its parent segment's stable base values; those bases do not drift across the local world, they are anchors.

## The Problem with Classify-After-Noise

The naive pipeline generates tile properties from independent noise layers, then classifies them into biomes:

```
noise → (temperature, precipitation, drainage, light, altitude, seasonality) → classify → biome
```

Noise has no knowledge of biome boundaries, so it produces values in the gaps between biomes. Classification then either fails hard (confidence = 0 on any out-of-range axis) or requires constant range-widening as edge cases appear. The pipeline below avoids this by anchoring noise to segment bases first.

---

## Pipeline

```
segment base biome
  → coarse noise (family selection, anchored to segment base)
    → fine noise (variant selection within family)
      → sample parameters from variant distribution
        → apply local modifiers (elevation gradient → drainage, slope aspect → light)
          → compute derived values (effectiveMoisture, continentality)
```

### Stage 1 — Base anchoring

Read the parent segment's stable base values. These set the mean of all local distributions — noise will add variation around them but the mean is fixed.

Because the base is stable, the local world has ecological coherence — a Taiga segment will not accidentally generate a Desert tile in its center. Variation stays within the character of the parent biome family, except at edges that border another segment.

### Stage 2 — Local noise layers

Apply noise within the constrained envelope:

- **Elevation** — local relief noise (hills, valleys) on top of base altitude
- **Temperature** — small local variation (slopes, shade), always relative to base
- **Precipitation** — local variation on top of base precipitation

```
localAltitude      = segment.baseAltitude + localElevationNoise(x, y)
localTemperature   = segment.baseTemperature + f(altitude, localTempNoise)
localPrecipitation = segment.basePrecipitation + localPrecipNoise(x, y)
```

### Stage 3 — Secondary axes

Derived from local terrain:

- **Drainage** — driven by elevation gradient (low flat areas → poor drainage). Convention: `drainage ∈ [0, 1]` where 0 = fully waterlogged / no runoff, 1 = fully free-draining. `(1 - drainage)` is the wetness retention factor used in derived values.
- **Light** — local variation on top of `segment.baseLight`: slope aspect (north/south-facing), terrain shadowing, canopy cover. No meaningful contagion — purely geometric.

These can shift a tile toward a neighboring biome — a low-drainage patch inside a Taiga world becomes a Boreal Bog. This is how ecotones form naturally within a local world.

### Stage 4 — Ecotone blending at segment borders

Where a local world borders a different segment (different biome family), blend the raw property values (temperature, precipitation, drainage, light) from both adjacent segment bases across a transition band, before biome assignment. The blend width can be fixed (e.g. 3–5 tiles) or terrain-driven (rivers and ridgelines are hard edges; open plains are soft).

Blending happens at the property level so that downstream derived values and biome classification operate on already-blended inputs. Tiles in the blend zone may produce a transitional biome naturally from this.

### Stage 5 — Biome selection and parameter generation

Instead of classifying noise-derived parameters into a biome, select a biome first and generate parameters from it. See [Biome Selection: Hierarchical Noise](#biome-selection-hierarchical-noise) for full spec.

Compute derived values (`effectiveMoisture`, `continentality`) from the generated parameter set after local modifiers are applied.

---

## Derived Values

Rather than scoring tiles against 6 independent axes, compute ecologically meaningful derived values:

```
effectiveMoisture  = precipitation × (1 - drainage)
continentality     = temperature variance across the local world
```

These collapse the axis space into dimensions that map more cleanly onto biome character.

---

## Axis Hierarchy and Contagion

Apply axes in dependency order during local generation:

| Order | Axis | Contagion | Depends on |
|---|---|---|---|
| 1 | Elevation | — | base altitude + local noise |
| 2 | Temperature | low (local) | base temperature + elevation |
| 3 | Precipitation | very high | base precipitation + local noise |
| 4 | Drainage | medium | elevation gradient (slope) |
| 5 | Light | none | base: segment.baseLight; local: slope aspect + canopy |
| 6 | Effective moisture | — | derived from precip + drainage |

Cellular automata passes, if used, should run in this order — each pass can read the output of the previous.

---

## Biome Selection: Hierarchical Noise

Noise selects the biome; the biome generates the parameters. This eliminates the classifier entirely — parameters are always in-range by construction, so score aggregation and zero-floor failure modes do not exist.

### Level 1 — Family selection (coarse noise)

A low-frequency noise field covers the local world. Its mean is anchored to the parent segment's biome family, so the dominant family is almost always the parent's — coarse noise only causes family shifts at high amplitude, which naturally concentrates at segment borders.

At segment borders (Stage 4 blend zone), the coarse noise transitions toward the neighboring segment's family. The output is:

- a **dominant family**
- a **blend weight** toward a second family (non-zero only in the border zone)

### Level 2 — Variant selection (fine noise)

Within each family, variants are ordered along a **primary variation axis** — the axis that most differentiates members of that family. High-frequency noise samples a position along this axis:

| Family | Primary axis | Variants (low → high) |
|---|---|---|
| Cold Forests | drainage | Boreal Bog → Taiga → Subalpine Forest |
| Temperate Forests | effective moisture | Dry Oak Woodland → Temperate Forest → Temperate Rainforest |
| Grasslands | aridity | Prairie → Steppe → Semi-arid Scrub |
| Deserts | temperature | Cold Desert → Desert → Hot Desert |
| Wetlands | salinity | Freshwater Marsh → Brackish Marsh → Salt Marsh |
| Tundra | elevation | Alpine Meadow → Tundra → Polar Desert |

The output is a **variant** (or a blend weight between two adjacent variants when the fine noise lands near a boundary).

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

## Unresolved TODOs

- **Biome family adjacency graph** — Level 1 (coarse noise) needs to know which families can border which others to constrain the blend at segment edges. Not yet defined.
- **Variant primary-axis thresholds** — resolved in `src/tileMap/biomeVariants.ts` for all six families. Note: Deserts and Wetlands use temperature in °C as their primary axis; all other families use 0–1 axes.
- **Parameter distribution values** — each variant needs `{ mean, stddev }` per axis. The orderings imply relative values but exact numbers are not yet defined.
- **Cellular automata propagation** — CA passes are mentioned in the axis hierarchy but what they propagate (drainage flooding, moisture spread, temperature smoothing?) is not specified.
- **Tile count and performance** — at 5 m tiles over a ~5 km local world, a single local world is ~1 000 × 1 000 = 1 million tiles. Running noise and blending at this scale has not been budgeted.
