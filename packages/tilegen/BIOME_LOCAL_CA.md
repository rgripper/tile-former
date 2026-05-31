# Local World — CA Post-Processing

See [BIOME_LOCAL.md](BIOME_LOCAL.md) for index.

---

## Cellular Automata Post-Processing `[patch scale]`

CA (Stage 6) runs on the ~100 × 100 patch grid after biome selection (Stage 5), before the tile-level modifier pass (Stage 7). The goal is not to homogenize the map — isolated patches with a terrain reason should survive. The goal is to eliminate artifacts where noise happened to land on a boundary and produced a single patch or tiny cluster that has no ecological cause.

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

CA runs after patch-level axis values are computed (post-Stage 3) and after biome selection (Stage 5), before the tile-level modifier pass (Stage 7). The justification check reads Stage 3 patch axes, which are available at this point.

---

## Implementation Notes

Fully implemented in `stage6_caSmoothing()` in `src/tileGenerator/pipeline.ts`.

- 2 passes of 8-neighbor (Moore) plurality-rule followed by terrain-justification check.
- Cluster size measured by BFS with early exit once the count reaches 7 (`CLUSTER_SURVIVAL_MIN`). Uses von Neumann (4-neighbor) connectivity for cluster measurement.
- Justification check compares out-of-range distance on drainage, altitude, and light axes.
- The spec says "only boundary patches are candidates for reassignment." The implementation runs the plurality vote on all patches — interior patches of large clusters are not reassigned because their 8 neighbors are all the same biome, so no replacement is ever proposed. Boundary-only behavior emerges without an explicit interior check.
