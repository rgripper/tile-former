# Local World Generation

See [BIOME_GLOBAL.md](BIOME_GLOBAL.md) for global map and segment generation.

---

Each segment contains one **local world** (~5 km) — the playable map where individual tiles, terrain features, rivers, and ecotones are generated. The local world is seeded from its parent segment's stable base values.

## Documents

- [BIOME_LOCAL_PIPELINE.md](BIOME_LOCAL_PIPELINE.md) — two-resolution pipeline, stages 1–12, derived values, axis hierarchy
- [BIOME_LOCAL_SELECTION.md](BIOME_LOCAL_SELECTION.md) — biome selection cascade (altitude, temperature, moisture, drainage), parameter generation, ecotones, temperature zone adjacency, constants
- [BIOME_LOCAL_CA.md](BIOME_LOCAL_CA.md) — CA post-processing: majority-rule smoothing + terrain-justification check
- [BIOME_LOCAL_WATER.md](BIOME_LOCAL_WATER.md) — water features (ponds, rivers) as tile flags, placed opportunistically post-Stage 7

---

## Implementation Status

All 12 stages are implemented in `tileGenerator/pipeline.ts`. See each sub-document for per-stage deviations and open gaps.

| Stage | Status | File |
| ----- | ------ | ---- |
| 1 Base anchoring | ✅ | `stage1_initGrid` |
| 2 Local noise axes | ✅ | `stage2_noiseAxes` |
| 3 Rock type | ✅ | `stage3_rockType` |
| 4 Gradient axes | ✅ | `stage4_gradientAxes` |
| 5 Ecotone blending | ✅ | `stage5_blendBorders` |
| 6 Biome selection | ✅ | `stage6_selectBiomes` |
| 7 CA smoothing | ✅ | `stage7_caSmoothing` |
| 8 Tile modifier pass | ✅ | `stage8_expandTiles` |
| 9 Drainage clusters | ✅ | `stage9_drainageCluster` |
| 10 Fertility | ✅ | `stage10_fertility` |
| 11 Mineable resources | ✅ | `stage11_mineableResources` |
| 12 Ground light | ✅ | `stage12_groundLight` |
