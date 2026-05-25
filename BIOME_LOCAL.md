# Local World Generation

See [BIOME_GLOBAL.md](BIOME_GLOBAL.md) for global map and segment generation.

---

Each segment contains one **local world** (~5 km) — the playable map where individual tiles, terrain features, rivers, and ecotones are generated. The local world is seeded from its parent segment's stable base values.

## Documents

- [BIOME_LOCAL_PIPELINE.md](BIOME_LOCAL_PIPELINE.md) — two-resolution pipeline, stages 1–7, derived values, axis hierarchy
- [BIOME_LOCAL_SELECTION.md](BIOME_LOCAL_SELECTION.md) — biome selection cascade (altitude, temperature, moisture, drainage), parameter generation, ecotones, temperature zone adjacency, constants
- [BIOME_LOCAL_CA.md](BIOME_LOCAL_CA.md) — CA post-processing: majority-rule smoothing + terrain-justification check
- [BIOME_LOCAL_WATER.md](BIOME_LOCAL_WATER.md) — water features (ponds, rivers) as tile flags, placed opportunistically post-Stage 7
