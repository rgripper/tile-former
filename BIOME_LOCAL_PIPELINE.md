# Local World — Pipeline

See [BIOME_LOCAL.md](BIOME_LOCAL.md) for index. See [BIOME_GLOBAL.md](BIOME_GLOBAL.md) for global map and segment generation.

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
                  → water feature pass (ponds, rivers)
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

### Stage 5 — Biome selection `[patch scale]`

Select a biome for each patch. See [BIOME_LOCAL_SELECTION.md](BIOME_LOCAL_SELECTION.md) for the full spec.

### Stage 6 — CA smoothing `[patch scale]`

Run CA post-processing on the patch grid. See [BIOME_LOCAL_CA.md](BIOME_LOCAL_CA.md) for the full spec.

Each patch exits this stage with a stable biome assignment.

### Stage 7 — Tile-level modifier pass `[tile scale]`

Generate full-resolution terrain geometry and apply local modifiers per tile:

- **Elevation** — high-frequency noise on top of the patch's sampled altitude, producing actual hills, ridges, and hollows
- **Drainage** — recomputed from tile-level elevation gradient (steeper slope → better drainage)
- **Light** — slope aspect and terrain shadowing at tile resolution

Tiles inherit their biome from the parent patch. The modifier pass adjusts per-tile axis values for gameplay purposes (which tile effects apply, what grows here) but does not reassign biomes.

Compute derived values (`effectiveMoisture`, `continentality`) last, after all modifiers.

### Stage 8 — Water feature pass `[tile scale]`

Stamp pond and river tile flags using the tile-scale elevation and drainage data produced by Stage 7. Biome assignments are never modified. See [BIOME_LOCAL_WATER.md](BIOME_LOCAL_WATER.md) for the full spec.

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

| Order | Axis               | Contagion   | Depends on                                            |
| ----- | ------------------ | ----------- | ----------------------------------------------------- |
| 1     | Elevation          | —           | base altitude + local noise                           |
| 2     | Temperature        | low (local) | base temperature + elevation                          |
| 3     | Precipitation      | very high   | base precipitation + local noise                      |
| 4     | Drainage           | medium      | elevation gradient (slope)                            |
| 5     | Light              | none        | base: segment.baseLight; local: slope aspect + canopy |
| 6     | Effective moisture | —           | derived from precip + drainage                        |

Axes 1–4 are computed at both resolutions: coarsely at patch scale for biome selection and CA, then at full resolution at tile scale for gameplay. CA runs between the two passes, reading patch-scale axis values.
