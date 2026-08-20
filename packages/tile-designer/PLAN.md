# tile-designer — Plan (v2, dual-grid redesign)

A designer tool + generation library for isometric tile floors, driven by
`TileProperties` from `@tile-former/tilegen`. End goal: **quantised, toy-like
pixel-art terrain** in the cozy-horror register (Kingdom, Noita) that scales to
a 1000×1000 map.

> v1 (per-tile world-coordinate bakes, M0–M5) shipped and is preserved in
> "History — v1" at the bottom. This document describes the redesign that
> replaces its render path. The taxonomy and resolver from v1 survive.

## Why v1 has to be replaced

`bakeTile(style, ox, oy, seed)` keyed **all** noise on world pixel coordinates.
That bought seamlessness by construction, and it is the direct cause of every
open problem:

- **No two tiles can ever share a texture.** `floorTextureCache.ts` keys on
  `ox,oy`, so it dedupes a given tile across page loads, never across tiles.
- 128×64 RGBA = **32 KB/tile**. 64×64 tiles = 134 MB. **1000×1000 = 32 GB**,
  plus a `<canvas>` and GPU texture per tile.
- `createIsoTiles` instantiates sprites for every tile — no viewport culling.
- **Features clip at tile borders**, because they are painted from a world
  field into a diamond-clipped buffer. `isolatedPatches` + `EDGE_MARGIN` trade
  the clipping for a "blob centred in every diamond, bare rim" grid rhythm.
- **Biome seams read jarring**: adjacent tiles are independent bakes with no
  knowledge of each other, so there is nowhere in the pipeline a transition
  could be drawn.
- **Too high-fidelity / not toy-like**: continuous coverage fractions, free
  24-bit per-biome ramps, and per-pixel noise. `grain` approximates chunkiness
  after the fact instead of authoring at a coarse scale.

None of this is reachable by tuning generators. The premise inverts.

## The inversion

**Bake a small fixed variant atlas once at load; per tile store indices;
compose at draw time as layered sprites.** Compositing into a per-tile texture
would land straight back on a million textures — layered sprites is the
load-bearing detail.

| | v1 | v2 |
|---|---|---|
| textures | 1M × 32 KB = **32 GB** | ~500 variants in 1–2 2048² pages = **~16 MB** |
| per-tile state | full pixel buffer | ~8 bytes packed × 1M = **8 MB** |
| generation | 1M bakes | ~500 bakes, well under a second |
| draw calls | 1M textures | one atlas → batched |

A 2048² page holds 512 tile-sized slots, so the variant budget is generous.
Repetition is not the risk it looks like, because **layering multiplies**:
8 base shape variants × a few threshold-bias levels × 0–2 patches × feature
slots reads as thousands of distinct tiles from ~50 source textures. Milestone L
confirmed 8 shape variants alone are enough to kill visible repetition.

## Decisions (2026-08-17)

Three forks were settled deliberately; each is load-bearing below.

1. **Hidden seams** — same-material variants must abut invisibly. Achieved by
   generating in lattice space with period 1, *not* by world coordinates.
2. **Dual-grid corner rendering** — the material boundary always falls in the
   interior of a rendered sprite, never on its edge.
3. **Freshly authored master palette** — tuned for cozy-horror, replacing the
   free-form per-biome hex ramps.

They reinforce each other: (2) makes transitions structurally seamless, so (1)
only has to hold for same-material abutment.

### Dual-grid geometry on the iso lattice

Tile centres sit at `(((c−r)·TW)/2 + TW/2, ((c+r)·TH)/2 + TH/2)`. Averaging
over the four tiles `(c,r), (c+1,r), (c,r+1), (c+1,r+1)`: the `(c−r)` term is
unchanged, `(c+r)` gains exactly 1. So:

> **The dual lattice is the tile lattice shifted straight down by `TILE_H/2`.**

No horizontal offset, cells congruent to the tile diamond, one extra row and
column at the map fringe. Existing positioning math carries over; floor sprites
move to `topY + TILE_H/2` and index a dual cell instead of a tile.

### Scaling dual-grid past two materials

The textbook 16-combination figure assumes a binary "is/isn't this material".
With 9 substrates a corner can touch four different ones — 9⁴ = 6561 combos,
infeasible. Instead **stack by priority**: draw materials in ascending priority
order; for each material present around the corner, compute the binary mask
"which of these 4 tiles is this material or higher" and draw that material's
16-entry mask set. Per dual cell that is typically 1–2 sprites, worst case 4.

> **Masks are 16 per material, not 16 per pair.** O(N), not O(N²).

### Altitude: the outermost mask, not a special case

Map facts: altitude steps are common, but organised as sizable same-level
plateaus with long coherent edges, rarely single-tile noise, and mostly
passable. So:

- A dual cell whose 4 corners share a floor level (`Math.round(altitude *
  MAX_FLOORS)`, as the renderer already computes) renders normally — the
  overwhelming majority. The straddling band is exactly one cell wide along
  each plateau edge.
- A straddling cell renders **once per level present** (almost always 2), each
  pass positioned at that level's height offset and gated to the corners at
  that level.

The 16 masks are the 16 corner-subsets of a cell, and are therefore **closed
under intersection**. "Corners at my level" is a 4-bit code; "corners with my
material or higher" is a 4-bit code; AND them and the result indexes the *same*
mask set. **Altitude costs zero new textures and no new render machinery** — it
is a bitwise AND before the mask lookup.

Draw order folds into the painter's algorithm already in place: lower floor
pass → cliff face (existing `Graphics`, unchanged) → upper floor pass.

Losing dual-grid rounding *at* a cliff line is not a real cost: the ground
plane itself breaks there and a vertical face separates the two materials, so
nobody reads them as butted together. The lip still gets organic character for
free, since the altitude gate uses the same organically-authored masks — grass
wobbling a few px over a cliff edge is a feature. A crisper dedicated lip mask
is a later data addition, not a design change.

### The overhang-only mask rule

**A mask's alpha must fully cover its nominal corner half-space and may spill a
few px outward, never recede inward.** Consequences:

- In material stacking the lowest-priority material always draws full-cell
  (every corner trivially qualifies) and higher layers overlap it, so nothing
  can peek through.
- At cliffs the wobbly upper lip always *overlaps* the cliff face top rather
  than exposing a gap. (Belt and braces: extend the cliff face a couple px up
  under the lip.)

Masks are generated procedurally, so this is one clamp in the generator, not a
discipline to maintain by hand.

### Hidden seams = periodic noise in lattice space

For the majority case — a dual cell whose four corners are all one material —
the sprite must tile with its neighbours across the diamond's four edges.
Diamond wrapping is tractable because iso is a sheared square grid:

> **Generate in tile-lattice space as a function periodic with period 1 in both
> lattice axes, then sample through the iso transform when filling the
> diamond.** Edge matching falls out; any variant abuts any other variant of
> that material seamlessly.

Cost: every primitive in `noise.ts` needs a periodic form. `valueNoise`/`fbm`
are a small change (hash lattice coords mod P). `cellEdge` (Worley) and
`stampField` are fiddlier but bounded.

Residual risk: a perfectly-wrapping variant still repeats visibly if there are
too few of them. Measured in L: **one** variant shows an obvious regular lattice
of identical blobs; **eight** shape variants break it completely. Tone variation
helps too, but only as a generator-side threshold bias driven by a low-frequency
field — see "Decided" below, where the naive uniform shift is ruled out.

### One unified material stack, quantised coverage

The substrate/mat distinction **collapses at render time**: both become entries
in one priority-ordered list (~17 ids). `resolve.ts` still produces them
separately; they merge and sort before rendering.

Dual-grid masks are binary, so a mat's continuous `coverage` fraction
**quantises to {none, sparse, full}**, selecting among density variants rather
than driving a continuous threshold. That is the toy-like quantisation the
redesign is for — v1's continuous coverage is part of why it reads
high-fidelity.

Budget: 17 materials × ~34 variants (4 for the full mask, 2 each for 15
partials) × 32 KB ≈ **18 MB**, under two 2048² pages — and only materials
actually present in the generated world get built.

### Master palette

**One palette; nothing in the pipeline may emit a colour outside it.**
13 ramps × 4 steps (shadow / base / lit / highlight) + 4 reserved accents = 56.

- Saturation low everywhere except the accents.
- Within each ramp, shadows shifted cool and highlights warm.
- **Adjacent biomes separate by hue at similar value** → flat, readable,
  toy-like. **Features separate by value** → they read as objects. Getting this
  backwards is what makes generated terrain look like soup.
- Accents reserved for interactables and light: `void` (contact outlines),
  `ember`, `blood`, `bile` (the uncanny note).

17 materials + 3 scatter kinds map onto the 13 ramps, differentiated by a
`shade` window (`-1 | 0 | +1`) that remaps ramp indices with clamping — real
differentiation at zero extra colours (e.g. `peat` = `muck` shaded down,
`scree` = `stone` shaded up). Texture carries the rest.

Per-biome overrides become **ramp/shade picks**, not raw hex. Climate tinting
(grass yellow-green when dry → deep green when wet) shifts in HSL then **snaps
back to the palette**, which lands dry grass on `straw` hues automatically.

## Architecture

```
src/core/
  types.ts            ← DesignInput, StyleParams, MaterialId, priority, TILE_W/H
  rng.ts              ← unchanged
  resolve.ts          ← survives v1; now emits materials + quantised coverage
  palette/
    master.ts         ← MASTER_RAMPS + ACCENTS: the only legal colours
    materials.ts      ← materialId → { ramp, shade }
    index.ts          ← getPalette, snapToPalette, rampAt, HSL helpers
    biomeOverrides.ts ← ramp/shade picks per biome
  lattice.ts          ← iso ↔ lattice transform, periodic sampling domain
  noise.ts            ← periodic valueNoise / fbm / cellEdge
  materials/          ← per-material periodic variant generators (from v1
                        substrate/ + mats/)
  masks.ts            ← procedural 16-entry corner mask set, overhang-only
  atlas.ts            ← build variant + masked-variant atlas pages
  compose.ts          ← dual cell → sprite list (level gate ∧ material gate)
  features/           ← overhang decoration sprites (from v1 scatter/)
src/app/              ← designer UI
```

## Milestones

- [x] **P — Master palette.** `master.ts`, `materials.ts`, palette snapping,
  `biomeOverrides` rewritten, `resolve.ts` rewired. Validate in the existing
  biome gallery. *Deliberately produces no new tech; skipping it means tuning
  generators against colours that will all change, which is how v1's muddiness
  got locked in.*
- [x] **PI — Palette inspector** in the designer: master ramps, accents, and
  the resolved per-material ramp for the current input.
- [x] **L — Lattice + periodic noise.** `lattice.ts`, periodic primitives,
  a wrap-check preview (same variant tiled 3×3 must show no seam).
- [ ] **A — Atlas + masks.** Procedural mask set, per-material variants,
  atlas pages, atlas inspector panel in the designer.
- [ ] **D — Dual-grid composition.** `compose.ts`, priority stacking, altitude
  partition, coverage quantisation in `resolve.ts`.
- [ ] **T — Altitude terrain preview.** Preview patch spanning several floor
  levels with cliff faces and rims, biome mixing and altitude steps judged
  together. Becomes the designer's primary surface (a single zoomed tile stops
  being the meaningful unit).
- [ ] **F — Feature overhang layer.** Decoration sprites allowed past the
  diamond, host-material compatibility, depth sorted.
- [ ] **G — Game hookup + teardown.** Point `isoRenderer.ts`'s floor layer at
  the atlas composition, add viewport culling, delete `floorTextureCache.ts`,
  the IndexedDB persistence, and the world-coordinate `bakeTile` path.

## What survives from v1

`resolve.ts`'s scoring taxonomy (the hard-won part — substrate/mat selection
from raw properties) carries over almost unchanged; it emits *material +
variant index* instead of noise params. The v1 generators in `substrate/` and
`mats/` survive as atlas-fill functions, now running ~8 times each instead of a
million. `stamps.ts` becomes placement logic returning `(cell, slot,
variantId)` instead of pixels. `rng.ts`, the HSL helpers, `pixels.ts`, the UI
shell, `PropertyPanel`, and `BiomeGallery` all carry over.

## What is deleted

`bake.ts`'s world-coordinate per-tile bake; `floorTextureCache.ts` and its
IndexedDB store (an atlas that builds in milliseconds needs no persistence);
`RenderStyle.grain` / `isolatedPatches` / `crispEdges` (superseded — chunkiness
comes from authoring at a coarse lattice, edges from masks); `grainCoord`.

## Testing

Core stays pure → vitest golden tests (hash atlas pages for fixed inputs),
unit tests on `resolve.ts` scores, a mask-set property test for the
overhang-only rule, and a wrap test asserting periodic variants tile without
seams. Type-check via `bunx tsc --noEmit` in-package and `bun run type-check`
at the root.

## v2 progress log

**P + PI done (2026-08-17).** New core modules: `palette/master.ts` (13 ramps ×
4 + 4 accents = 56 distinct colors, generated from an HSL spec then frozen as
hex; `snapToPalette` / `snapRampToPalette` as the enforcement point) and
`palette/materials.ts` (`MATERIAL_STYLES`: 20 materials → 13 ramps with a
`shade: -1|0|1` index window, so peat/scree/sedge/cushion/litter separate
tonally at zero extra colors). `types.ts` gained `SCATTER_IDS` / `MATERIAL_IDS`
/ `MaterialId`, unifying substrates + mats + scatter for palette purposes.
`palette/index.ts` rewritten: `ResolvedPalette` is now a flat
`Record<MaterialId, Ramp>` (scatter has real `pebble`/`twig`/`leaf` ids instead
of borrowing `scree`/`needleLitter`/`leafLitter`), plus `tintRamp` = shift then
snap. `biomeOverrides.ts` rewritten from raw hex to `(ramp, shade)` picks — a
biome can no longer leave the palette by construction; Taiga's old override
dropped because it is now the global default. `bake.ts`'s hardcoded
`WATER_RAMP` replaced by `MASTER_RAMPS.water`. New `app/PalettePanel.tsx`
(master ramps / per-material resolved ramps, with the current biome's
deviations from the defaults listed as chips).

Verified: `bunx tsc --noEmit` clean in-package, root `bun run type-check`
clean. Headless bake of all 44 biomes at 3 world origins → **0 off-palette
pixels**, 44 of 56 colors reached; the 12 unreached are exactly the 4 accents
(reserved for milestone F features), the 4 `water` steps (no biome mean sets
`water`), and 4 highlight steps the current generators never push to. Designer
rendered headless (Chrome `--headless=new`, `--virtual-time-budget`) → palette
panel correct and the `soil → clay` rainforest override visible as a chip.

**Real-map measurement (2026-08-17).** A first ramp-usage pass measured one
tile per biome and appeared to show `frost`/`stone` over-selected. That was an
artifact: the gallery weights all 44 biomes equally, and the biome list is
heavily montane/arctic. Re-measured against maps from `generateTileMap` +
`dressTileMap` over 9 climate segments (temperate, hot wet, hot dry, cold dry,
polar, alpine, montane forest, boreal wet, savanna):

- **A single map holds 1–4 biomes, 2–6 substrates, 3–8 mats** — never anything
  like the whole taxonomy. The gallery is a taxonomy check, not a sample of
  what the player sees. 15 of 17 materials appear across all 9 segments
  combined, so the atlas only ever needs the handful present in the current
  segment — **the ~18 MB budget above is a large overestimate**.
- **Area-weighted mean luminance is 75–77** for temperate/wet/forest segments
  and 104–119 for cold/polar/alpine. That is a good low-key read, and bright
  polar ground is correct. **There is no palette brightness problem and no
  frost over-selection on real maps.**
- **~4 distinct floor levels per map** (e.g. 0,1,2,3; alpine 6,7,8,9), which
  confirms the plateau assumption behind the altitude partition and sets the
  scale for milestone T's preview.
- 14 distinct substrate adjacency pairs across all segments, all between
  *similar* materials (`soil|mud`, `clay|soil`, `peat|soil`, `frozenGround|snow`,
  …). Wildly different biomes never abut, so transition masks are exercised on
  near neighbours, not on snow-against-sand.

**Real defect the measurement did find — `drainage` range.** On every segment
`drainage` spans only **0.06–0.38** (p50 0.24, never above 0.38), because
`computeDrainage` (tilegen `tileGenerator/utils.ts:34`) is
`slopeDrainage*0.7 + permeability*0.3` with
`slopeDrainage = clamp(hypot(gx,gy)/0.3, 0, 1)` — the `/0.3` divisor expects
per-patch altitude gradients near 0.3, but real maps are gentle enough that
`gx,gy ≈ 0`. So 70% of the formula contributes nothing and drainage is
effectively `permeability * 0.3`.

Consequences in `resolve.ts`, whose score curves were written against an assumed
[0,1] range:

- `sand` needs `rise(d, 0.5, 0.8)` → **always 0**.
- `bareRock` needs `rise(d, 0.4, 0.7)` → **always 0**.
- `scree` needs `rise(d, 0.45, 0.75)` → **always 0**.
- `aeolian` (the whole warm-desert mechanism) multiplies by `rise(d, 0.5, 0.8)`
  → **dead code**.

**3 of 9 substrates are unreachable on any real map**, which is why a hot dry
segment resolves to `soil` 99% instead of sand. `effectiveMoisture` similarly
never exceeds 0.55, so `peat`/`mud`/`moss` thresholds at `rise(m, 0.5, …)`
barely fire. Both v1-logged tuning gaps (desert `bareRock`-vs-`sand`, Boreal Bog
missing `peat`) are this single bug; the gallery hid it because `biomeToInput`
synthesizes drainage from biome means across the full [0,1] range rather than
from generator output.

Likely also constrains biome diversity, since `stage6_selectBiomes` feeds
drainage into the cascade's `drainageLowerBound` — **not yet confirmed.**

**Drainage fix + resolver rebalance done (2026-08-17).** Fixed at the root in
tilegen: `computeDrainage` now takes an explicit `gradientRef`, with measured
constants `TILE_GRADIENT_REF = 0.055` (stage 8, ±1 tile) and
`PATCH_GRADIENT_REF = 0.19` (stage 4, ±1 patch ≈ 4 tiles). One shared reference
could never serve both call sites — patch-scale gradients run ~3.5× larger.
Each is set so a median slope lands near 0.45 and p90 near 0.8.
`BIOME_LOCAL_PIPELINE.md` stage 4 updated with the formula and the caveat.

Drainage now spans **0.28 / 0.50 / 0.79** (p10/p50/p90) on every segment and all
**9 of 9 substrates are reachable**.

Correcting drainage made `resolve.ts` wrong in the opposite direction — its score
curves had been implicitly compensating for the broken band, so the first
re-measure gave `bareRock` 18–42% on *every* segment and `sand` 12% on temperate
maps. The curves were rebalanced against the measured ranges (see the
calibration note at the top of `scoreSubstrates`), with three substantive
changes beyond threshold shifts:

- A `barren = rise(1−f, …) × fall(m, …)` term gates `bareRock`. Bedrock only
  stays bare where nothing can build a horizon over it; without the moisture
  factor it won every low-fertility tile regardless of climate.
- `aeolian`'s drainage term was weakened (`rise(d, 0.2, 0.5)`). A sand sea is
  defined by heat and aridity — free drainage is a *consequence*, and gating on
  it left hot deserts at soil 61% / sand 39%.
- `frozenGround` became a *banded* rather than open-ended cold material, so
  genuinely polar temperatures yield to snow instead of showing bare permafrost
  everywhere. `snow` also gained a 1.5 coefficient and a wider cold band; it was
  previously unreachable. `sand` gained a `rise(t, −18, −4)` floor to keep it out
  of polar maps.

Resulting substrate mix, area-weighted, top 3 per segment:

| segment | mix |
|---|---|
| temperate default | soil 90%, sand 4%, bareRock 3% |
| hot wet lowland | soil 50%, clay 31%, mud 13% |
| hot dry lowland | **sand 60%**, soil 40% |
| cold dry | frozenGround 53%, bareRock 19%, soil 16% |
| polar | frozenGround 51%, bareRock 19%, snow 17% |
| alpine | frozenGround 45%, soil 19%, scree 19% |
| montane forest | soil 71%, mud 16%, scree 6% |
| boreal wet | soil 66%, peat 13%, frozenGround 10% |
| savanna | soil 80%, sand 9%, clay 6% |

Verified: all three packages type-check (`packages/tilegen`,
`packages/tile-designer`, root). Palette closure still holds — 0 off-palette
pixels over all 44 biomes at 3 origins, now 46 of 56 colors reached (up from 44,
since `sand`/`frost`/`snow` became reachable). Real-map mean pixel luminance:
temperate 80, montane forest 74, hot dry 113, polar 112 — vegetated regions sit
in the intended low-key band, deserts and ice read bright, which is correct.

Still open: `mud` at 16% on a montane-forest slope is high for well-drained
terrain (damp hollows are plausible, but worth a look); polar remains
`frozenGround`-dominant rather than snow-dominant, which may be correct given
the biomes actually selected there. Neither blocks L.

**L done (2026-08-19).** New `core/lattice.ts` and a periodic primitive family
in `core/noise.ts` (`periodicValueNoise`, `periodicFbm`, `periodicCellEdge`,
`periodicBlockHash`, `periodicAnchors`, `periodicSpot`), plus
`core/lattice.test.ts` (13 vitest cases). v1's world-coordinate primitives are
untouched and still drive the live `bake.ts` path; they go away in A.

The geometric fact the whole milestone rests on: with the tile's top corner as
origin and basis vectors `e_u = (TILE_W/2, TILE_H/2)`, `e_v = (−TILE_W/2,
TILE_H/2)`, **the diamond is exactly the unit square in lattice space**, so
"inside the diamond" is just `0 ≤ u,v < 1` and a period-1 function matches across
all four diamond edges with no special-casing of the diagonals. The lattice also
*is* the tile grid — a pixel's global lattice coordinate is `(col + u, row + v)`
— which is why v1's world-pixel sampling was equivalent to a *non*-periodic
function over this same space. Two bonuses fell out: the 2:1 squash disappears
(lattice space is the undistorted ground plane, so generators no longer need
v1's hand-doubled y-frequency or `spotField`'s `* 2` correction), and `grainCoord`
is replaced by `quantizeLattice`, making chunkiness a property of the authoring
grid rather than something applied to world pixels after the fact.

Verified: 13/13 tests pass. The lattice transform agrees with `insideDiamond` on
all 8192 pixels of the tile rect and with `rowSpan` on every row. All periodic
primitives are invariant under whole-period shifts, and `periodicBlockHash` is
invariant *exactly*. The strongest test is the last one: the field's jump across
the tile boundary must be no larger than the largest jump occurring naturally
within a tile — that is the property that actually decides whether a seam is
visible, and it fails loudly if anyone later makes a primitive non-periodic.

*Note on the test contract:* bit-exact equality under whole-period shifts was
tried first and is **unachievable** — `(u+1)*cells` and `u*cells + cells` differ
by an ULP, so interpolated primitives land ~1e-15 away. Exactness is asserted
only where it is genuinely achievable (floor-based block hashing, which is what
aligns the visible chunk grid); elsewhere the contract is 1e-9, some eight orders
of magnitude inside one quantized ramp step.

Visual end-to-end check (headless render of a reference lattice-space generator
tiled across a 6×6 and 7×7 iso field):

- **Seamlessness holds.** No tile grid is visible anywhere, including where
  *different* variants abut — which confirms the claim made when writing the
  primitives that statistically uniform textures hide different-variant
  boundaries, and that periodicity only has to cover self-abutment.
- **One variant repeats visibly.** A single periodic variant tiles cleanly but
  shows an obvious regular lattice of identical blobs.
- **8 shape variants is enough** to break the repetition completely; the field
  reads as continuous organic ground.
- **Uniform per-tile tone shifts are actively harmful** — see the corrected
  decision above.
- 8 shapes × 5 threshold-bias levels ≈ 1.25 MB per material at 32 KB/variant.
  With ~6 substrates present on a typical map that is ~7.5 MB before masks,
  comfortably inside budget. Bias levels can drop to 3 if it needs trimming.

**Interim v1 fix — grass-biome rim border (2026-08-19).** While L was in
progress the user spotted a distinct dark-brown speckled border on grass tiles
in the running designer. Worth fixing even though `mats/index.ts` is superseded
by milestone A, since the app stays in daily use as the evaluation surface
through the remaining v2 milestones.

Root cause was three independent hole mechanisms stacking at the tile rim,
where `isolatedPatches` gates every *non-primary* mat off entirely (intentional
— "so the border stays pure primary"), leaving nothing to backfill the
*primary* mat's own coverage gaps there:

1. `turf()`/`moss()` punch per-pixel micro-holes even at full strength, by
   design, so a flat fill doesn't look dead.
2. One level up, `mat.coverage < 100%` excludes whole low-frequency macro
   *patches* of the tile (~28% of area for a 72%-coverage mat) via the `s`/
   `inside` gate, independent of rim proximity — a coarser hole `turf()`'s own
   fix can't reach, since the generator is never even called there.
3. `sedge` has a third, structural gate: `clump < 0.45 → null` excludes ~55% of
   its own cells outright, before `turf()` is reached at all. Because
   `primaryIndex` picked mats by raw coverage score, a wetland biome where
   sedge outscored grass (Tropical Swamp: sedge 100% vs grass 94%) picked the
   clumped tussock mat as the *spreading* primary — worse than the reported
   bug, +34.7 points of excess bare substrate at the rim vs interior.

Fixed 1 and 2 with a new `MatCtx.rimFill` (0 interior → 1 at the rim) that
blends each hole threshold toward "always covered" as the real edge inset
approaches the border, applied only to the primary mat's own generator call —
non-primary mats are correctly absent at the rim, not holed, so they're
untouched. Fixed 3 by excluding `sedge` from primary eligibility alongside the
existing stamp-mat exclusion (`SPARSE_PRIMARY_MATS`), since a clump-gated mat
can never read as a solid spreading cover no matter how its threshold is
biased — the same category of problem the file's own comment already solved
once for `leafLitter`/`needleLitter`.

One caching subtlety: `rimFill` depends on the *real* (ungrained) edge inset,
but the existing per-mat color cache is keyed on the grained world coordinate
only — reusing it for the rim-boosted primary would leak one pixel's color
across a whole grain block straddling the rim band. The primary's cache lookup
is bypassed whenever `rimFill > 0` (i.e., only within the ~0.30-inset rim
band); the deep interior is unaffected and keeps the existing cache speedup.

Verified: measured substrate-family color fraction at the rim (inset < 0.06)
vs. deep interior (inset > 0.4) across all 44 biomes at 2 world origins.
Grass/dryGrass-primary biomes (the reported case) went from up to +16 points
of rim excess to **0** at every tested origin. Sedge-primary wetland biomes
went from **+25 to +35** points down to **0**. The only remaining nonzero
cases are `cushion`-primary alpine/subalpine biomes at **+4 to +11** points —
left as-is, deliberately: cushion is a spot/dome generator, so its "holes" are
the physical gaps between discrete plant domes, not a coverage-fraction bug;
forcing it solid at the rim would flatten individual cushion plants into a
smear exactly where they should read as discrete. `bunx tsc --noEmit` clean.
Zoomed visual render of Grassland/Savanna confirms a clean solid border with
the dark-brown speckle correctly confined to interior "worn patch" texture.

**Interim v1 fix — hard-edged isolated patches (2026-08-19).** Two more
reported defects, same root-cause pattern in two files: a secondary substrate
or non-primary mat rendered as a **razor-edged geometric blob** disconnected
from its surroundings by a flat gap — a sand patch in Tropical Alpine Desert
(substrate), green grass islands in Savanna (mat). Confirmed general (not a
one-off) by scanning all 44 biomes for isolated substrate/mat coverage > 35%.

Distinct from the EDGE_MARGIN/rim-avoidance tradeoff already named above as a
reason for the v2 redesign — that governs *where* a patch may exist; this was
about the *shape of its boundary* once allowed, and is fixable without
touching the isolation/rim policy:

- `substrate/index.ts`'s `pickSubstrate` chose the secondary substrate with a
  single low-frequency `fbm` field cut by a pure binary threshold
  (`n > 1-cover ? 1 : 0`). At a decent coverage fraction (37% sand in Tropical
  Alpine Desert) that collapses to one big blob with a literal vector-line
  edge.
- `mats/index.ts`'s `paintMats` had the exact same shape, one level up: for
  isolated (non-primary) mats, `crispEdges` collapsed the edge-strength `s` to
  `inside > 0 ? 1 : 0` — grass at 45% coverage over dryGrass (Savanna) read as
  sharp-edged green islands.

Fixed both with a **fray band**: near the threshold, the pixel is decided by
an independent hash test instead of the flat comparison, so the boundary
dithers into organic speckle at the same per-pixel hard-choice granularity as
everywhere else in this style — no smooth alpha, no antialiasing, just a
spatially varied cut instead of a straight one. Substrate also got a
frequency bump (0.055→0.065) so a given coverage fraction reads as a slightly
more broken-up cluster rather than one dominant blob; validated by prototyping
several (frequency, band-width) pairs and rejecting ones that either kept the
hard edge (too narrow a band) or fragmented into confetti and lost the
"compact patch" identity the mode's own doc comment calls for (too wide a
band / too high a frequency). New constants: `FRAY_BAND = 0.1` in
`substrate/index.ts` (field's own [0,1) units), `ISOLATE_FRAY_BAND = 0.12` in
`mats/index.ts` (existing `inside` units). Mats' fray is scoped to
`isolate && crispEdges` only — the primary mat's own boundary and the
existing non-crisp Bayer-dither path in both files are untouched.

Verified: zoomed before/after renders of Tropical Alpine Desert and Savanna —
hard vector edges gone, patches read as organic clusters at essentially the
same footprint and position. Spot-checked Cloud Forest, Alpine Fell, and
Grassland (other biomes from the same >35%-coverage sweep) for no regression.
`bunx tsc --noEmit` clean in-package, root `bun run type-check` clean.
Palette closure re-verified: still 0 off-palette pixels over all 44 biomes at
3 origins; 47 of 56 colors now reached (up from 46) since fraying exposes a
ramp step hard thresholds had been excluding outright.

**Interim v1 fix — edge-gate contour and rimFill over-application (2026-08-19).**
Two follow-up reports after the fray fix: Temperate Shrubland cells still showed
"a strong rectangular cut-off several pixels away from the edge", and the Desert
sample gained "a clear green gap". Both trace to `edgeGate`, the isolate-mode
rim suppression — one to its *magnitude*, one to its *shape*.

*Green ring (magnitude).* The previous session's `rimFill` pushed the primary
mat's effective coverage to a flat 1.0 at the rim, unconditionally. That is
correct when a dense mat is losing a dense partner (Tropical Swamp: sedge 100%
vanishes at the rim, so grass must fill all of it) but wrong when the primary is
itself sparse and *nothing* is being gated off. Desert has a single mat
(dryGrass 17%), so no mat is suppressed at all — yet dryGrass was manufactured
up to **97% of the rim against 1% in the interior**, painting an olive ring
around bare sand. Fixed by budgeting the boost: new `rimCoverLoss` = combined
coverage of the mats actually gated off at the rim, and `rimFill` is scaled by
it. A biome whose mats are all primary/stamp now gets no boost whatsoever.
Desert's rim went from dryGrass 97% to **sand 93% / dryGrass 4%**, matching its
interior.

*Rectangular cut-off (shape).* `smoothstep(MARGIN, MARGIN+FEATHER,
edgeInset(x,y))` gates on the raw inset — and a constant inset is by definition
a diamond contour concentric with the tile, so whatever non-primary material
contributes stops dead along a perfectly straight line tracing the tile shape.
Fixed by perturbing the inset with low-frequency **world-keyed** noise before
the smoothstep (`isolateEdgeGate` in `pixels.ts`, `EDGE_INSET_JITTER = 0.16`),
which breaks the contour into an irregular wandering boundary while still
bounding how close non-primary material can get to the true rim — so the
clean-biome-seam property the gate exists for is preserved. World-keyed matters:
two adjacent tiles perturb their shared border identically, so the gate stays
seam-consistent.

Both stages previously carried an identical private copy of `EDGE_MARGIN` /
`EDGE_FEATHER` and the smoothstep; these are now one shared `isolateEdgeGate`
in `pixels.ts` (which consequently gains a `noise.ts` import — no cycle, since
`noise.ts` only depends on `rng.ts`).

Verified: density-vs-inset profiles for the reported biomes show no step in the
gate band (Desert secondary substrate ramps 0 -> 1 -> 10% across the rim instead
of cliffing; the previously "speckled" Temperate Shrubland cells measure uniform
there, confirming that texture was within-grass tonal variation, not a material
boundary). Rim-substrate-excess regression sweep over all 44 biomes at 2
origins: **8 of 37 mat-bearing biomes exceed 5pt, and 6 of those are the
`cushion`-primary alpine set the previous fix already documented as deliberately
excluded** (cushion's holes are the physical gaps between discrete plant domes;
forcing them solid would smear them). The two genuine residuals — Semi-arid
Scrub +5.5, Tropical Dry Forest +5.1, against the original defect's +16 — were
rendered zoomed and show no visible ring, so the small rim excess is accepted as
the price of not re-introducing the Desert failure mode. Tropical Alpine Desert
and Savanna re-rendered to confirm the earlier fray fix still holds. `bunx tsc
--noEmit` clean in-package, root `bun run type-check` clean, 13/13 lattice tests
pass, palette closure still 0 off-palette pixels over all 44 biomes at 3 origins.

## Open questions

- Variant count per material: start at 4 full-cell + 2 per partial mask, tune
  against the terrain preview once T lands.
- Water: currently a flat noise fill in `bake.ts`. It should join the material
  stack as a top-priority material so shorelines get the same rounding, but
  animation is out of scope until F.
- **Where to fix the drainage range defect** — see the measurement note below.
  Blocks nothing in L/A, but every substrate-selection judgment is wrong until
  it is resolved.

## Decided (2026-08-17)

- **Per-cell tone variation = baked variants, not a Pixi sprite `tint`.** Tint
  multiplies, so it emits colors outside the master palette and would undermine
  the closure guarantee the whole design rests on — for a saving in atlas space
  that is not scarce.
- **…but the variant must differ by a *threshold bias inside the generator*, not
  by a uniform ramp-index shift.** Measured in milestone L (see the log): shifting
  a whole tile's dominant step up or down makes every diamond a distinct flat
  brightness and the tile grid becomes glaringly obvious — the exact opposite of
  the "hidden seams" decision. Biasing the patch threshold instead changes the
  *mix* of light and dark blocks, so perceived brightness still shifts but there
  is no flat step at the tile edge to see. This is the same trap commit
  `01b18bd` ("tone variations are now gradual, and not totally random") already
  hit in v1.
- **Bias index comes from a low-frequency field over tile coordinates**, so
  neighbouring tiles mostly share a tone and it drifts over ~4 tiles.

---

# History — v1 (M0–M5, per-tile world-coordinate bakes)

Preserved for the tuning notes and the pipeline facts the redesign inherits.

## v1 scope: the three feature classes

1. **Substrate & mat** — baked into the floor texture. In scope.
2. **Animated scatter** (ferns, reeds, small flowers) — separate overlay
   sprites with sway frames, positions deterministic. In scope.
3. **Interactive flora** (trees, bushes, succulents) — **out of scope**; the
   game keeps its existing sprite pipeline (`src/isoRenderer.ts`).

## Surface taxonomy (replaced the `surfaceType` hack) — still current

`surfaceType: "rocky" | "sandy"` was a temporary visual marker.

**Substrates** (what the ground *is*):

| id             | typical biomes                                  | keyed on |
|----------------|--------------------------------------------------|----------|
| `bareRock`     | Alpine, Fell, Highland Desert, rocky outcrops   | low fertility + high drainage; tinted by `rockType` |
| `scree`        | Cold Desert, Alpine Fell, frost-cracked plateaus | high drainage + freeze range temps |
| `sand`         | Hot/Cold Desert, Semi-arid                       | sandy rock types + high drainage + arid |
| `soil`         | forests, grassland (default)                     | moderate fertility/moisture |
| `clay`         | Tropical Rainforest, Monsoon lowlands            | very low drainage + warm + wet |
| `mud`          | Swamp, Wetland, Marsh, riparian margins          | near-zero drainage + high moisture / `riparian` |
| `peat`         | Boreal/Alpine/Subalpine Bog                      | cold + waterlogged + organic |
| `frozenGround` | Tundra, Polar Desert, Arctic Heath               | sub-zero temps + permafrost drainage |
| `snow`         | Polar/Alpine extremes                            | very low temp + altitude |

**Mats** (what covers it): `grass`, `dryGrass`, `moss`, `lichen`, `leafLitter`,
`needleLitter`, `sedge`, `cushion`. Driven by `fertility` × `groundLight` ×
moisture × temperature.

Selection is by score functions over raw `TileProperties`; per-biome overrides
can bias scores or pin a substrate/mat. The **biome gallery** preview (one tile
per biome at its `paramDist` means) validates coverage of all ~44 biomes.

**Migration path (still open):** promote `SurfaceSpec` into tilegen dresser
stage 1; delete `surfaceType` from `TileProperties` and update
`isoRenderer.ts` / `TileInfo.tsx` consumers.

## v1 decisions that carry forward

- **Resolution: 128×64** (2× the screen diamond).
- **Animated-scatter positions: computed at load from seed** — zero storage.
- **Palettes: global base ramps + per-biome partial overrides** — the
  mechanism survives; the *contents* are replaced by the master palette.

## v1 progress log

**M0/M1 done (2026-07-08).** Package lives at `packages/tile-designer/`;
`bun run designer` (root) or `bun run dev` (in-package) launches it. Core
(`src/core/`) is pure TS and exported from the package root. UI (`src/app/`) is
React + plain `<canvas>` (`imageSmoothingEnabled = false`).

Verified: `bunx tsc --noEmit` clean in-package; dev server serves and all
workspace imports resolve; headless run of `resolveSurface` over all 44 biomes
produces plausible substrate/mat picks (tundra → frozenGround+lichen, bogs →
peat, fell-fields → bareRock+scree+cushion, rainforest → clay+soil+grass/litter).

Known tuning gaps (score-curve edits in `resolve.ts` / `biomeInput.ts`, **still
open**):
- Hot/Cold Desert lean too `bareRock`-heavy vs. sand — partly an artifact of
  the gallery's deterministic per-biome rock-type guess in `biomeToInput`.
- Boreal Bog resolves to `frozenGround`+`soil` instead of `peat` — its
  `paramDist` moisture mean sits just under the `peat` score's threshold.

**M2 done (2026-07-08).** `pixels.ts` (PixelBuffer, diamond mask, blit),
`noise.ts` (value noise, 3-octave fBm, Bayer 4×4, Worley cell-edge),
`substrate/index.ts` (rock strata + fracture lines, scree clumps, sand ripples,
soil/clay shrinkage cracks, mud/clay wet sheen, peat fiber streaks, frost
polygons, snow drifts + sparkle), `bake.ts`. `preview.ts` deleted;
`StyleParams` gained `texture: { arid, wet }`. All noise keyed on world pixel
coordinates + the *world* seed, so seam-freeness held by construction; the iso
2:1 squash compensated by doubling y-frequency inside generators. UI gained
`NeighborhoodPreview` (3×3 iso composite with per-neighbor jitter).

Verified: `bunx tsc --noEmit` clean; headless bake of all 44 biomes non-empty;
3×3 composites for 8 showcase biomes → no visible seams, distinct per-substrate
texture.

**M3 done (2026-07-08).** `stamps.ts` (world-lattice feature placement —
`stampField`, `spotField`; anchors jittered per cell, 3×3 neighbor scan so
features crossing tile borders paint identically from both sides),
`mats/index.ts` (turf fill with blade runs / bright tips / dark bases; moss
carpet; lichen crust discs; cushion domes; leaf/needle litter stamps; every
generator caps density < 1 and frays patch boundaries),
`scatter/index.ts` (pebbles with lit tops, kinked twigs, stray leaves).
`StyleParams` gained `staticScatter` densities and `scatterRamps`. `rampAt`
moved to `palette/`.

Verified: `bunx tsc --noEmit` clean; headless bake of all 44 biomes fully
painted with plausible mat mixes and scatter densities; 3×3 composites for 12
showcase biomes → no seams, features legible.

**M5 game hookup done (2026-07-08).** `src/floorTextures.ts` (root app): maps
`Tile` → `DesignInput`, hashes the game's string seed (FNV-1a), computes the
world pixel origin from the iso grid index (`ox=(col−row)·64, oy=(col+row)·32`),
wraps the baked buffer in a Pixi `Texture` (`scaleMode = "nearest"`).
`isoRenderer.ts` overlays a half-scale (64×32) floor sprite on each top
diamond; the flat `getTileTopColor` fill remains underneath as the click
hit-area, for cliff-face shading, and for debug overlays. Altitude rim strokes
moved to a child `Graphics` so they render above the floor sprite.
`initIsoApp` gained a `seed?: string` param.

Verified: root `bun run type-check` clean; full app rendered headless
(playwright + system Chrome) → 64×64 map seamless, water/rims/vegetation
intact.

**Persistent bake cache added (2026-07-09).** `src/floorTextureCache.ts`:
`warmFloorTextureCache(tiles, worldSeed)` before `createIsoTiles`, returning a
`Map<"col,row", Texture>`. Resolved the M1 quantized-cache-key question: since
all noise is world-pixel-coordinate keyed, two tiles at different positions
never share a bake regardless of property quantization — so the key is
`` v{CACHE_VERSION}|{ox},{oy}|s{worldSeed}|{quantized properties} ``, i.e. it
dedupes a *given* tile's bake across page loads and small property drift, **not
across tiles**. That finding is exactly what motivates the v2 redesign.
Storage was IndexedDB, raw buffer records.

Verified: headless run — first load writes exactly 4096 records, frame
pixel-identical to the non-cached bake; `fake-indexeddb` logic test confirmed
cold/warm/partial-miss behaviour. A second full-browser reload pass was
inconclusive (headless Chrome crashed under memory pressure, ~2 GB free).

**Flat-look render styles (2026-07 late).** `RenderStyle` added
`tileVariation`, `crispEdges`, `isolatedPatches`, `grain` so the designer could
A/B looks live, plus `tone.ts` (flat "minecrafty" tone resolver: ~85% dominant
tone, ~12% one step off in low-frequency patches, ~3.5% single-step accent
fleck) and `MixedBiomePreview` (N×N field with two minority biome clusters).
These were the first move toward the quantised look; v2 supersedes them by
authoring at a coarse lattice instead of quantising after the fact.
