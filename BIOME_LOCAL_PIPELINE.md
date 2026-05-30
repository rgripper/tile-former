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
    → rock type (dominant from segment base + minority noise patches)
      → fine noise (variant selection within family)
        → gradient axes: drainage = slope × rock permeability
          → ecotone blending at segment borders
            → CA smoothing
                                                      [tile scale]
              → full-resolution elevation + terrain geometry
                  (drainage = slope × rock permeability, rock type inherited from patch)
                → drainage cluster pass (ponds from geology-driven accumulation zones)
                  → surface patch pass (rocky/sandy overlays)
                    → fertility (rock + climate + moisture → soil quality)
                      → ore placement (rock affinities × configured rates)
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
seasonality        = segment.baseSeasonality   -- constant across the local world
```

### Stage 3 — Rock type `[patch scale]`

Assign a rock type to each patch. The segment base carries a `dominantRockType` that anchors the local geology; a low-frequency noise map introduces minority patches (~16 % total coverage split across two minority types) for gameplay variety.

Rock types and their properties:

| Type         | Permeability | Fertility base | Notable ore affinities         |
| ------------ | ------------ | -------------- | ------------------------------ |
| Sedimentary  | 0.55         | 0.65           | iron ×2, coal ×3, salt ×1.5   |
| Limestone    | 0.70         | 0.60           | salt ×3, gems ×0.8             |
| Granite      | 0.20         | 0.25           | gold ×2.5, gems ×1.5           |
| Basalt       | 0.45         | 0.80           | iron ×1.5, sulfur ×2           |
| Metamorphic  | 0.30         | 0.45           | gems ×3, gold ×1.5             |

### Stage 4 — Patch-level secondary axes `[patch scale]`

Derived from patch-center terrain and rock type, used to drive biome selection and CA:

- **Drainage** — combines slope gradient with rock permeability. Slope drives most of the value; rock permeability contributes a baseline so impermeable rock (granite) stays wet even on gentle slopes:

  ```
  slopeDrainage = clamp(gradient / 0.3, 0, 1)
  drainage      = slopeDrainage × 0.7 + rockPermeability × 0.3
  ```

  Convention: `drainage ∈ [0, 1]` where 0 = fully waterlogged / no runoff, 1 = fully free-draining.

- **Light** — slope aspect at patch center (north/south-facing). Coarse but sufficient for family and variant selection.

### Stage 5 — Ecotone blending at segment borders `[patch scale]`

Where a local world borders a different segment (different biome family), blend the raw property values (temperature, precipitation, drainage, light) from both adjacent segment bases across a transition band, before biome assignment. The blend width can be fixed (e.g. 3–5 patches) or terrain-driven (rivers and ridgelines are hard edges; open plains are soft).

Blending happens at the property level so that downstream derived values and biome classification operate on already-blended inputs. Patches in the blend zone may produce a transitional biome naturally from this.

### Stage 6 — Biome selection `[patch scale]`

Select a biome for each patch. See [BIOME_LOCAL_SELECTION.md](BIOME_LOCAL_SELECTION.md) for the full spec.

### Stage 7 — CA smoothing `[patch scale]`

Run CA post-processing on the patch grid. See [BIOME_LOCAL_CA.md](BIOME_LOCAL_CA.md) for the full spec.

Each patch exits this stage with a stable biome assignment and rock type.

### Stage 8 — Tile-level modifier pass `[tile scale]`

Generate full-resolution terrain geometry and apply local modifiers per tile:

- **Elevation** — high-frequency noise on top of the patch's sampled altitude, producing actual hills, ridges, and hollows
- **Drainage** — recomputed from tile-level elevation gradient + inherited rock permeability (same formula as Stage 4)
- **Light** — slope aspect and terrain shadowing at tile resolution
- **Rock type** — inherited directly from the parent patch

Tiles inherit their biome from the parent patch. The modifier pass adjusts per-tile axis values for gameplay purposes (which tile effects apply, what grows here) but does not reassign biomes.

Compute derived values (`effectiveMoisture`) last, after all modifiers.

### Stage 9 — Drainage cluster pass `[tile scale]`

Identify geology-driven water accumulation zones and stamp them as ponds. Water placement is emergent from the drainage field (which rock type already shaped) rather than independently noise-placed. Three parameters control the output:

- **`drainageClusterChance`** `[0, 1]` — fraction of qualifying drainage minima that activate. Geology determines the candidate pool; this parameter thins it.
- **`drainageClusterBreadth`** (tiles) — flood-fill radius from each activated seed. Controls spatial footprint of each cluster.
- **`drainageClusterDepth`** `[0, 1]` �� drainage suppression intensity at cluster center, tapering to zero at the edge. Low depth → boggy/marshy but no open water. High depth → open water pond at center with riparian fringe.

A tile is a candidate seed if its drainage (post rock-permeability) is below `0.35` and it is a local altitude minimum. Activated seeds flood-fill outward; the fill suppresses drainage and marks tiles as water where `drainage < 0.15` after suppression. Two CA passes clean up cluster shapes. Riparian fringe is then BFS-stamped from all water tiles.

### Stage 10 — Surface patch pass `[tile scale]`

Stamp `surfaceType` flags (`"rocky"` or `"sandy"`) on eligible tiles using two independent low-frequency simplex noise maps. This introduces minor terrain-surface variation within biomes without reassigning biomes.

- **Rocky patches** — larger blobs (~10-tile noise wavelength). Represents exposed bedrock, scree, or rocky outcrops breaking through otherwise vegetated ground. Drainage is pushed toward 0.85 (`max(drainage, 0.70) × 1.15`) — bare rock sheds water immediately.
- **Sandy patches** — slightly smaller blobs (~7-tile noise wavelength). Represents sandy clearings, dune-like pockets, or wind-deposited sand within otherwise non-sandy terrain. Drainage is pushed toward 0.75 (`max(drainage, 0.55) × 1.10`) — sand drains quickly but less extremely than bare rock.

In both cases `effectiveMoisture` is recomputed from the updated drainage value.

**Exclusion rules:**

- Water tiles (`tile.water === true`) are always skipped.
- Biomes where `precipitationRange[1] ≤ 0.20` are skipped — these are already naturally bare/rocky/sandy (deserts, polar deserts, alpine deserts, subalpine steppe, montane steppe, etc.) and adding patches there would be redundant.

**Coverage and tuning:**

The single parameter `surfacePatchChance` on `PipelineConfig` (default `0.07`) controls density. Rocky uses 60 % of that budget, sandy uses 40 %. At the default value roughly 4 % of eligible tiles become rocky and 3 % become sandy. The parameter scales continuously — `0.03` gives near-pristine biomes, `0.20` gives heavily disrupted terrain.

```
rockyThreshold = 0.75 − (surfacePatchChance × 0.6 × 3.0)
sandyThreshold = 0.75 − (surfacePatchChance × 0.4 × 3.0)
```

If a tile would qualify for both (independent noise maps, so possible), rocky wins.

### Stage 11 — Fertility `[tile scale]`

Derive `tile.fertility ∈ [0, 1]` from rock type, climate, and moisture. Water tiles receive `fertility = 0`.

```
tempFactor     = exp(−((temperature − 17) / 20)²)   -- bell curve peaking at 17°C
moistureFactor = lerp(0.3, 1.0, min(1, effectiveMoisture × 2))

fertility = rockType.fertilityBase × tempFactor × moistureFactor

if riparian:    fertility × 1.3   (sediment and nutrient deposition)
if rocky:       fertility × 0.25  (no soil over exposed bedrock)
if sandy:       fertility × 0.45  (low mineral content)
```

### Stage 12 — Ore placement `[tile scale]`

Place ore deposits using `PipelineConfig.oreRates` (base occurrence rate per ore type) multiplied by each rock type's affinity for that ore. Each ore type gets an independent simplex noise map; tiles exceeding the threshold for the rarest qualifying ore are stamped with `tile.ore`.

```
effectiveRate = oreRates[ore] × rockType.oreAffinities[ore]
threshold     = 0.75 − (effectiveRate × 3.0)
tile.ore      = rarest ore whose noise(x, y) > threshold
```

Ore affinities are defined per rock type (see Stage 3 table). Water tiles are skipped. When multiple ores would qualify on the same tile, the rarest (lowest base rate) wins.

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

---

## Implementation Notes

All 12 stages are implemented. Deviations from spec:

**Stage 2 — noise amplitudes (not constrained by spec)**

- altitude ±0.15, temperature ±3 °C (plus lapse rate −30 °C/unit altitude), precipitation ±0.08

**Stage 5 — drainage not blended**

- Drainage is gradient-derived and has no segment base value. It is not blended at borders — Stage 4 recomputes it from the blended elevation that Stage 5 produces, so it will naturally reflect the flatter terrain at segment edges.

**Stage 6 — cascade inputs**

- Temperature zone and moisture regime are resolved from the axis values produced by Stage 2 (no separate coarse/fine noise layer). Stage 2 noise anchored to the segment base already serves that role. Hard cuts at thresholds are intentional: Stage 5 blends the input axes continuously, so biome transitions at borders are smooth even without explicit blend weights.

**`paramDist` on biomes**

- Each biome in `biomes.ts` carries a `paramDist` (`{ mean, stddev }` per axis, computed via `withDist()`). The pipeline does not yet sample from these distributions — tile parameter values come directly from noise layers. Variant-distribution sampling is an open gap.
