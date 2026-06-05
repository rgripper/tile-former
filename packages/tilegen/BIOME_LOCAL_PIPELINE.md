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

## Design: Biome-First Parameter Generation

The pipeline deliberately inverts the real-world causal order. In nature, physical conditions determine which ecosystem equilibrates — but independent noise channels can produce parameter combinations that don't exist in any real ecosystem (e.g. extreme altitude + tropical heat + hyperhumid precipitation). The pipeline avoids this by:

1. **Patch scale** — select a biome using coarse axes anchored to the segment base. The cascade selector guarantees the result is a valid, ecologically coherent ecosystem type.
2. **Tile scale** — generate tile parameters by sampling from the selected biome's `paramDist` distributions rather than from raw noise. Temperature and precipitation are drawn from `N(mean, stddev)` and clamped to the biome's declared range, ensuring every tile is an internally consistent member of its biome.

Altitude, drainage, and light remain geophysically derived because they depend on terrain geometry, not ecosystem type.

---

## Pipeline

The pipeline runs at two resolutions to keep expensive operations cheap:

- **Patch scale** — biome assignment runs on ~100 × 100 patches (one patch ≈ 50 m × 50 m, covering 10 × 10 tiles). Noise sampling, variant selection, ecotone blending, and CA all operate here.
- **Tile scale** — once each patch has a biome, full-resolution terrain geometry is computed per tile. Tiles inherit their biome from the parent patch; local modifiers then adjust per-tile axis values for gameplay use.

```
                                                      [patch scale]
segment base biome
  → coarse noise (family selection, anchored to segment base)
    → rock type (dominant from segment base + minority noise patches)
      → fine noise (variant selection within family)
        → gradient axes: drainage = slope × rock permeability
          → ecotone blending at segment borders
            → CA smoothing
                                                      [tile scale]
              → full-resolution elevation + terrain geometry
                  (drainage = slope × rock permeability, rock type inherited from patch)
                → drainage cluster pass (ponds from geology-driven accumulation zones)
                  → fertility  (rock + climate + moisture → soil quality)
                    → ore placement  (rock affinities × configured rates)
```

### Stage 1 — Base anchoring `[patch scale]`

See [tileGenerator/stage1.ts](tileGenerator/stage1.ts).

### Stage 2 — Local noise layers `[patch scale]`

See [tileGenerator/stage2.ts](tileGenerator/stage2.ts).

### Stage 3 — Rock type `[patch scale]`

See [tileGenerator/stage3_rockType.ts](tileGenerator/stage3_rockType.ts). Rock-type properties live in [tileMap/rockTypes.ts](tileMap/rockTypes.ts).

### Stage 4 — Patch-level secondary axes `[patch scale]`

See [tileGenerator/stage4_gradientAxes.ts](tileGenerator/stage4_gradientAxes.ts).

### Stage 5 — Ecotone blending at segment borders `[patch scale]`

See [tileGenerator/stage5_blendBorders.ts](tileGenerator/stage5_blendBorders.ts).

### Stage 6 — Biome selection `[patch scale]`

See [tileGenerator/stage6_selectBiomes.ts](tileGenerator/stage6_selectBiomes.ts). Full selection spec: [BIOME_LOCAL_SELECTION.md](BIOME_LOCAL_SELECTION.md).

### Stage 7 — CA smoothing `[patch scale]`

See [tileGenerator/stage7_caSmoothing.ts](tileGenerator/stage7_caSmoothing.ts). Full CA spec: [BIOME_LOCAL_CA.md](BIOME_LOCAL_CA.md).

### Stage 8 — Tile-level modifier pass `[tile scale]`

See [tileGenerator/stage8_expandTiles.ts](tileGenerator/stage8_expandTiles.ts). Altitude, drainage, and light are recomputed from terrain geometry. Temperature and precipitation are sampled from the patch's biome `paramDist` (see *Design: Biome-First Parameter Generation* above).

### Stage 9 — Drainage cluster pass `[tile scale]`

See [tileGenerator/stage9_drainageCluster.ts](tileGenerator/stage9_drainageCluster.ts).

### Stage 10 — Fertility `[tile scale]`

See [tileGenerator/stage10_fertility.ts](tileGenerator/stage10_fertility.ts).

### Stage 11 — Ore placement `[tile scale]`

See [tileGenerator/stage11_ore.ts](tileGenerator/stage11_ore.ts).

---

## Derived Values

```
effectiveMoisture  = precipitation × (1 - drainage)
```

Collapses precipitation and drainage into a dimension that maps more cleanly onto biome character. Recomputed after any stage that modifies drainage.

---

## Axis Hierarchy and Contagion

Apply axes in dependency order during local generation:

| Order | Axis               | Contagion   | Depends on                                            |
| ----- | ------------------ | ----------- | ----------------------------------------------------- |
| 1     | Elevation          | —           | base altitude + local noise                           |
| 2     | Temperature        | low (local) | base temperature + elevation                          |
| 3     | Precipitation      | very high   | base precipitation + local noise                      |
| 4     | Rock type          | none        | segment.dominantRockType + local noise                |
| 5     | Drainage           | medium      | elevation gradient × rock permeability                |
| 6     | Light              | none        | base: segment.baseLight; local: slope aspect + canopy |
| 7     | Effective moisture | —           | derived from precip + drainage                        |
| 8     | Fertility          | —           | derived from rock + climate + moisture                |

Axes 1–5 are computed at both resolutions: coarsely at patch scale for biome selection and CA, then at full resolution at tile scale for gameplay. CA runs between the two passes, reading patch-scale axis values.

