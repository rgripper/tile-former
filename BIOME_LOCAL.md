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

The pipeline runs at two resolutions to keep expensive operations cheap:

- **Patch scale** — biome assignment runs on ~100 × 100 patches (one patch ≈ 50 m × 50 m, covering 10 × 10 tiles). Noise sampling, variant selection, ecotone blending, and CA all operate here.
- **Tile scale** — once each patch has a biome, full-resolution terrain geometry is computed per tile. Tiles inherit their biome from the parent patch; local modifiers then adjust per-tile axis values for gameplay use.

```
                                                      [patch scale]
segment base biome
  → coarse noise (family selection, anchored to segment base)
    → fine noise (variant selection within family)
      → sample parameters from variant distribution
        → ecotone blending at segment borders
          → CA smoothing
                                                      [tile scale]
            → full-resolution elevation + terrain geometry
              → apply local modifiers (slope → drainage, aspect → light)
                → compute derived values (effectiveMoisture, continentality)
```

### Stage 1 — Base anchoring `[patch scale]`

Read the parent segment's stable base values. These set the mean of all local distributions — noise will add variation around them but the mean is fixed.

Because the base is stable, the local world has ecological coherence — a Taiga segment will not accidentally generate a Desert tile in its center. Variation stays within the character of the parent biome family, except at edges that border another segment.

### Stage 2 — Local noise layers `[patch scale]`

Sample noise at patch centers within the constrained envelope:

- **Elevation** — local relief noise (hills, valleys) on top of base altitude
- **Temperature** — small local variation (slopes, shade), always relative to base
- **Precipitation** — local variation on top of base precipitation

```
localAltitude      = segment.baseAltitude + localElevationNoise(x, y)
localTemperature   = segment.baseTemperature + f(altitude, localTempNoise)
localPrecipitation = segment.basePrecipitation + localPrecipNoise(x, y)
```

### Stage 3 — Patch-level secondary axes `[patch scale]`

Derived from patch-center terrain, used to drive biome selection and CA:

- **Drainage** — driven by elevation gradient between neighboring patch centers. Convention: `drainage ∈ [0, 1]` where 0 = fully waterlogged / no runoff, 1 = fully free-draining.
- **Light** — slope aspect at patch center (north/south-facing). Coarse but sufficient for family and variant selection.

These are the values the CA justification check reads. They are coarser than tile-level geometry but accurate enough to distinguish, say, a drainage hollow from a flat plain.

### Stage 4 — Ecotone blending at segment borders `[patch scale]`

Where a local world borders a different segment (different biome family), blend the raw property values (temperature, precipitation, drainage, light) from both adjacent segment bases across a transition band, before biome assignment. The blend width can be fixed (e.g. 3–5 patches) or terrain-driven (rivers and ridgelines are hard edges; open plains are soft).

Blending happens at the property level so that downstream derived values and biome classification operate on already-blended inputs. Patches in the blend zone may produce a transitional biome naturally from this.

### Stage 5 — Biome selection and CA `[patch scale]`

Select a biome for each patch and run CA smoothing. See [Biome Selection: Hierarchical Noise](#biome-selection-hierarchical-noise) and [Cellular Automata Post-Processing](#cellular-automata-post-processing) for full specs.

Each patch exits this stage with a stable biome assignment.

### Stage 6 — Tile-level modifier pass `[tile scale]`

Generate full-resolution terrain geometry and apply local modifiers per tile:

- **Elevation** — high-frequency noise on top of the patch's sampled altitude, producing actual hills, ridges, and hollows
- **Drainage** — recomputed from tile-level elevation gradient (steeper slope → better drainage)
- **Light** — slope aspect and terrain shadowing at tile resolution

Tiles inherit their biome from the parent patch. The modifier pass adjusts per-tile axis values for gameplay purposes (which tile effects apply, what grows here) but does not reassign biomes.

Compute derived values (`effectiveMoisture`, `continentality`) last, after all modifiers.

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

Axes 1–4 are computed at both resolutions: coarsely at patch scale for biome selection and CA, then at full resolution at tile scale for gameplay. CA runs between the two passes, reading patch-scale axis values.

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

## Cellular Automata Post-Processing `[patch scale]`

CA runs on the ~100 × 100 patch grid after biome selection (Stage 5), before the tile-level modifier pass. The goal is not to homogenize the map — isolated patches with a terrain reason should survive. The goal is to eliminate artifacts where noise happened to land on a boundary and produced a single patch or tiny cluster that has no ecological cause.

### Two-level rule

**Level 1 — Majority-rule smoothing (noise removal)**

Run 1–2 passes of plurality-rule: each patch tentatively adopts the biome of the majority of its neighbors (Moore or von Neumann neighborhood). This collapses isolated single patches and very small clusters into the surrounding biome.

**Level 2 — Terrain-justification check (cluster preservation)**

Before committing a reassignment from Level 1, check whether the patch's axis values (from Stage 3) actually support its current biome better than the proposed replacement. If the axis values justify the anomaly, suppress the reassignment.

The relevant axes are those already computed in Stage 3:
- **Drainage** — a low-drainage hollow inside a Taiga justifies a Boreal Bog cluster
- **Slope aspect / light** — a shaded north-facing patch justifies a cooler variant
- **Elevation** — a local high point justifies an Alpine variant inside a Temperate Forest

Concretely: a cluster survives if its mean axis values fall closer (in the variant's primary-axis space) to the cluster's biome than to the surrounding biome. If not, the cluster is a noise artifact and Level 1 reassignment stands.

### Result

- Single patches and clusters below **7 patches** with no terrain driver → smoothed away
- Small but terrain-justified clusters (a bog in a hollow, a cold pocket on a north face) → preserved as legitimate intra-family ecotones
- Cluster interiors are never touched — only boundary patches that fail the justification check are candidates for reassignment

### Pass order

CA runs after patch-level axis values are computed (post-Stage 3) and after biome selection (post-Stage 5), but before the tile-level modifier pass (Stage 6). The justification check reads Stage 3 patch axes, which are available at this point.

---

## Unresolved TODOs

- **Biome family adjacency graph** — Level 1 (coarse noise) needs to know which families can border which others to constrain the blend at segment edges. Not yet defined.
- **Variant primary-axis thresholds** — resolved in `src/tileMap/biomeVariants.ts` for all six families. Note: Deserts and Wetlands use temperature in °C as their primary axis; all other families use 0–1 axes.
- **Parameter distribution values** — each variant needs `{ mean, stddev }` per axis. The orderings imply relative values but exact numbers are not yet defined.
