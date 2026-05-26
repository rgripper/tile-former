# Local World Generation

See [BIOME_GLOBAL.md](BIOME_GLOBAL.md) for global map and segment generation.

---

Each segment contains one **local world** (~5 km) — the playable map where individual tiles, terrain features, rivers, and ecotones are generated. The local world is seeded from its parent segment's stable base values.

## Documents

- [BIOME_LOCAL_PIPELINE.md](BIOME_LOCAL_PIPELINE.md) — two-resolution pipeline, stages 1–8, derived values, axis hierarchy
- [BIOME_LOCAL_SELECTION.md](BIOME_LOCAL_SELECTION.md) — biome selection cascade (altitude, temperature, moisture, drainage), parameter generation, ecotones, temperature zone adjacency, constants
- [BIOME_LOCAL_CA.md](BIOME_LOCAL_CA.md) — CA post-processing: majority-rule smoothing + terrain-justification check
- [BIOME_LOCAL_WATER.md](BIOME_LOCAL_WATER.md) — water features (ponds, rivers) as tile flags, placed opportunistically post-Stage 7

---

## Implementation Status

All 8 stages are implemented in `src/tileGenerator/pipeline.ts`. See each sub-document for per-stage deviations and open gaps.

| Stage | Status | File |
| ----- | ------ | ---- |
| 1 Base anchoring | ✅ | `stage1_initGrid` |
| 2 Local noise axes | ✅ | `stage2_noiseAxes` |
| 3 Gradient axes | ✅ | `stage3_gradientAxes` |
| 4 Ecotone blending | ✅ | `stage4_blendBorders` |
| 5 Biome selection | ✅ | `stage5_selectBiomes` |
| 6 CA smoothing | ✅ | `stage6_caSmoothing` |
| 7 Tile modifier pass | ✅ | `stage7_expandTiles` |
| 8 Water features | ✅ | `stage8_waterFeatures` |
