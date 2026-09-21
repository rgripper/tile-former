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
  materials/          ← per-material periodic variant generators
  masks.ts            ← procedural 16-entry corner mask set, overhang-only
  atlas.ts            ← build variant + masked-variant atlas pages
  compose.ts          ← dual cell → sprite list (level gate ∧ material gate)
  features/           ← overhang decoration sprites
  terrain.ts          ← whole-field CPU render: floor + cliffs + rims + scatter
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
- [x] **A — Atlas + masks.** Procedural mask set, per-material variants,
  atlas pages, atlas inspector panel in the designer.
- [x] **D — Dual-grid composition.** `compose.ts`, priority stacking, altitude
  partition, coverage quantisation in `resolve.ts`.
- [x] **T — Altitude terrain preview.** Preview patch spanning several floor
  levels with cliff faces and rims, biome mixing and altitude steps judged
  together. Becomes the designer's primary surface (a single zoomed tile stops
  being the meaningful unit).
- [x] **F — Feature overhang layer.** Decoration sprites allowed past the
  diamond, host-material compatibility, depth sorted.
- [x] **G — Game hookup + teardown.** `isoRenderer.ts`'s floor layer draws the
  dual-grid composition out of one atlas; per-diagonal culling; the v1 bake
  path, its IndexedDB cache and the `RenderStyle` knobs are gone. **Wired and
  building, but not yet seen in a browser** — see the log entry.

## What survived from v1 (settled at G)

`resolve.ts`'s scoring taxonomy (the hard-won part — substrate/mat selection
from raw properties) carried over almost unchanged; it emits *material +
variant index* instead of noise params. The v1 generators were rewritten rather
than moved: `materials/index.ts` holds their periodic lattice-space successors,
running ~8 times each instead of a million, and `features/index.ts` replaced
`stamps.ts` + `scatter/` with placement returning `(cell, slot, variantId)`.
`rng.ts`, the HSL helpers, `pixels.ts`, the UI shell, `PropertyPanel` and
`BiomeGallery` all carry over — the last two lighter, having lost the
`RenderStyle` knobs and the per-tile bake respectively.

## What was deleted (done at G)

`bake.ts`'s world-coordinate per-tile bake and the `substrate/`, `mats/`,
`scatter/`, `stamps.ts` generators it drove; `floorTextureCache.ts` and its
IndexedDB store (an atlas that builds in ~750 ms for a whole map needs no
persistence); `RenderStyle` entire — `grain` / `isolatedPatches` / `crispEdges`
were all ways of quantising a per-pixel bake after the fact, and chunkiness now
comes from authoring at a coarse lattice and edges from masks; `grainCoord`;
`isolateEdgeGate` and `edgeInset`, which existed only to serve
`isolatedPatches`; and `MixedBiomePreview`, absorbed by the terrain preview.

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

**A done (2026-08-20).** New `core/masks.ts`, `core/materials/index.ts`,
`core/atlas.ts`, `app/AtlasPanel.tsx`, and three test files (79 cases). v1's
`bake.ts` path is untouched and still drives the live designer; it goes away in
G.

*The mask set.* A dual cell's four corners are the centres of tiles `(c,r)`,
`(c+1,r)`, `(c,r+1)`, `(c+1,r+1)`, and in lattice space they land exactly on the
unit square's corners — so a corner's index is `(v ? 2 : 0) | (u ? 1 : 0)`, `u`
runs along +col and `v` along +row, and a code is that 4-bit set. The nominal
region of a code is the union of its corners' quadrants; `nominalSigned` measures
distance only to the mid-line *segments* that separate a member corner from a
non-member one, never to the cell's own edges, since the region continues into
the neighbour there. Unioned over the four cells meeting at a tile centre, those
quadrants reconstruct that tile's diamond — "nominal" is the material's own tile
footprint, drawn a quarter at a time.

The overhang-only rule is one clamp (`if (signed >= 0) return true`) evaluated
before the spill is consulted, so it holds by construction rather than by tuning.
Because higher-priority materials draw last, the visible boundary is always the
higher material's *spilled* edge, which means the spill can be generous rather
than a few pixels: `SPILL_AMP = 0.2` lattice units (~14 native px), bounded well
under 0.5, past which a material would reach a tile centre it does not own.

*Cross-cell continuity was the one real design decision.* Adjacent cells share
two corners, so their nominal fields agree exactly; their spills do not, because
neighbouring cells draw different mask variants. Tapering the spill to zero on
the cell edge fixes it — and pins every boundary crossing to the exact nominal
midpoint, so a long boundary pinches to a waist once per tile. Built it that way
first, then replaced it: the spill is a **blend of a shared, variant-independent
field and a variant-specific one**, variant-specific in the interior and fading
to the shared field at the edge. The shared field is period-1, so its values
either side of an edge are neighbouring samples of one smooth function.

Exact equality across an edge is unachievable anyway once the spill is sampled on
the authoring block grid — the two sides are genuinely different blocks — so the
contract is the one `lattice.test.ts` already holds the primitives to: the jump
across an edge must be no larger than jumps occurring naturally inside a cell.
**Measured 1.20% disagreement across a shared edge against a 3.86% within-cell
block-to-block control**, over all consistent code pairs × all variant pairs.

*First build of the mask set was wrong and the measurement caught it.* `fBm`
concentrates around 0.5, so a spill of `AMP · fbm` only varied over the middle
third of its range: the boundary came out as a **constant-width ribbon along a
straight nominal line**, and the two variants of a code were near
indistinguishable. Fixed with a contrast stretch about the midpoint
(`SPILL_CONTRAST = 2.4`) plus a floor, after rendering the mask sheet with
nominal/overhang/recession colour-coded, which is also how the overhang rule was
confirmed visually before it was a test.

*The generator port.* All 17 substrate/mat generators moved to lattice space.
Frequencies convert as `cells ≈ round(72 · freq)` (one lattice unit ≈ 72 native
px) and must be integers or the wrap boundary leaves the tile edge. v1's
hand-doubled y-frequencies and `spotField`'s `* 2` iso correction are gone —
lattice space is the undistorted ground plane. `RenderStyle.grain` becomes
`MaterialCtx.blocks` (32 blocks per lattice unit ≈ 2 native px, matching v1's
`grain: 2`), and litter stamps are now defined on that block grid, so they come
out iso-projected, which is what something lying flat on the ground should do.
Two of v1's three stacked hole mechanisms are simply gone: the patch macro-shape
is now the mask, and there is no rim to hold anything off, so all of
`rimFill` / `rimCoverLoss` / `SPARSE_PRIMARY_MATS` / `isolateEdgeGate` have no v2
counterpart.

*The port exposed a defect that had been in v1 all along.* Measuring the
distribution of emitted colours per generator showed **sand, grass, dryGrass and
sedge each emitting one colour 96–98% of the time**, with mud and peat close
behind. Their base fields were centred *on* a ramp rounding threshold rather than
beside it, so the field never crossed one and the only variation left was
`resolveTone`'s ~3.5% accent — a flat fill wearing a texture's clothes. Sand's
ripples were mathematically present and completely invisible. `tone.ts`'s own
doc comment states the intent as ~85% dominant / ~12% one step off / ~3.5%
accent, so this was measurably wrong, not a matter of taste. Recentred the
affected bases; **the whole set now spans 53–82% dominant.** `materials.test.ts`
asserts no material exceeds 90%, which is the regression guard.

Three other port findings: `sedge`'s tussock gate was a hard threshold on an
axis-aligned block hash, which in lattice space drew a visible lattice of rhombi
rather than clumps (now a fBm field); `scree`'s 3 px clumps read as grain rather
than rubble at v2's scale (doubled); and `sand` needed a **shared structural
layer** — the caveat `noise.ts` states outright. Periodicity makes a variant abut
*itself* seamlessly, which is enough for statistically uniform texture, but dune
ripples have direction and continuity and broke visibly where two variants met.
Its ripple wavevector and most of its wandering phase now come from a
variant-independent `structureSeed`, with a smaller per-variant phase term so
every tile does not carry an identical motif. Rock cracks and frost polygons
deliberately do *not* use it: their networks have no long-range direction, and a
9×9 tiled field shows no grid.

*The atlas.* A sprite is `texture(material, density, shape, bias) × mask(code,
maskShape)`. The two factors are independent, so the generator — the expensive
part — runs only `fullShapes × biasLevels` times per material-density, and the 16
codes are produced by masking. Masks are material-independent and built once for
the whole atlas. Defaults: 8 full-cell shapes (milestone L's measured floor) × 3
tone-bias levels, 2 shapes per partial code, 52 sprites per material-density.
Sprites are cropped to their bounding box before shelf-packing.

Cropping is worth stating precisely because it is easy to overrate: a full-cell
sprite's box *is* the diamond and saves nothing, so the win is entirely in the 14
partial codes — a single-corner box is 33% of a full cell's, and the atlas comes
out **24% smaller** than storing every sprite uncropped. The remaining obvious
waste is that a diamond fills only half its bounding box; recovering it means
interlocking diamonds at pack time, not worth it while a map fits in one or two
pages.

Measured cost:

| scope | material-densities | sprites | pages | content | build |
|---|---|---|---|---|---|
| single biome (worst of 44) | 8 | 416 | 1 | 9.1 MB | 426 ms |
| temperate 4-biome map | 10 | 520 | 1 | 11.1 MB | 543 ms |
| montane 4-biome map | 15 | 780 | 2 | 16.5 MB | 747 ms |
| polar 4-biome map | 5 | 260 | 1 | 5.7 MB | 259 ms |
| every material at once (never happens) | 25 | 1300 | 2 | 28.3 MB | 1.1 s |

Real maps land at **5.7–16.5 MB in one or two 2048² pages**, inside the plan's
~18 MB budget and consistent with the real-map measurement above (a map holds
1–4 biomes, never the whole taxonomy).

*The designer* gains an `AtlasPanel` with three tabs — the 16-code mask set, a
material's full-cell shape × tone-bias grid alongside its 16 masked codes, and
the packed page — plus live shape/tone-level controls and a build-cost readout,
so the variant-count question milestone T has to answer is a dropdown rather than
a rebuild.

Verified: 79 new cases pass (9 mask, 60 material, 10 atlas) alongside the 13
lattice cases; `bunx tsc --noEmit` clean in-package and `bun run type-check`
clean at root. (Six failures in the repo's `sun`/`temperature` suites are
pre-existing — confirmed identical on a stashed tree.) **Palette closure holds
through the new pipeline: 0 off-palette pixels over the atlas pages of all 44
biomes, 47 of 56 colours reached — the same reach as v1.** The mask set was
rendered with nominal/overhang/recession colour-coded (no recessions, every code
overhangs); all 17 materials were rendered tiled 4×4 and individually seam-checked
9×9; and a throwaway dual-grid compositor stood in for milestone D to render
organic two-material boundaries and a 14×14 mixed field with **0 interior gaps**.
The 8-shapes-vs-1 control from L reproduces exactly through the atlas: one shape
shows an obvious lattice, eight show none. Designer rendered headless on all
three atlas tabs.

*Deliberately deferred.* Partial codes carry no tone-bias levels, so a boundary
cell sits at bias 0 while its neighbours may not — much less visible than shape
repetition, and it costs 14 × (levels − 1) sprites per material to fix; revisit
at T. Water is still `bake.ts`'s flat fill and has no atlas entry.

**D done (2026-08-22).** New `core/compose.ts` and `compose.test.ts` (14 cases);
`resolve.ts` gained the quantisation the atlas needs and `types.ts` gained
`RenderMaterialId`, `Density`/`Coverage`, and the altitude constants (mirrored
from `isoRenderer.ts`, unified at G). `materials/index.ts` gained
`MaterialInstance` / `materialInstance()`; `atlas.ts` now keys sprites by
instance, not by id, and gained `mergeMaterials` for a whole field's request
list.

*The stacking rule the plan wrote down turned out to be one rule, not three.*
"For each material present around the corner, compute the binary mask 'which of
these 4 tiles is this material or higher'" is exactly right for substrates —
one per tile, opaque, must leave no gap — and wrong for mats and for density
levels, both discovered while writing `composeCell`:
  - **Substrates nest**, as written: ascending by priority, each one's code is
    "this corner's substrate ranks at or above mine", so the lowest-ranked
    substrate present necessarily gets every corner and draws the full cell.
  - **Mats add.** A tile carries a *set* of mats and every mat generator already
    leaves holes for what is under it (that is the whole point of a mat).
    Nesting them the substrate way would let a mat draw over a corner that
    belongs to a different, higher-priority mat, and the substrate under *that*
    corner would show through the wrong material's holes. A mat's code is
    simply "this corner has me" — no ranking against other mats at all.
  - **Density levels partition**, settling the open question standing since A:
    `sparse` and `full` are separate stack entries and a corner belongs to
    whichever one it actually is, never both. Nesting them (as if `full`
    implied `sparse`) would double-paint a `full` corner and read as measurably
    denser than the `full` texture alone.

*Altitude is a bitwise AND, exactly as planned* — no new mechanism, just every
code above computed only from the corners present at one floor level, one pass
per level. Measured over the same nine climate segments used throughout v2 (9
segments × 2 seeds, 39,762 dual cells at 48×48): **17.2% of cells straddle two
floor levels, 0.00% straddle three or more.** That confirms the plan's "almost
always 2" as a measurement, not an assumption, and the extra-pass cost is real
but bounded — it's not a rare edge case, one cell in six pays it.

*Coverage quantisation exposed an atlas-cost problem that wasn't specified.*
`resolve.ts` already produced continuous `coverage` and `texture.{arid,wet}`
scalars and a continuous grass climate tint; feeding those straight to the
atlas — one instance per distinct value — measured **51 material instances on
a real 48×48 map** (worst case across nine segments), against 11.6 material
*ids*, almost all of it the per-tile grass tint. `resolve.ts` now snaps all
three to a handful of levels before they reach a generator: `quantiseCoverage`
(none/sparse/full, split at 0.4 — the measured median of 82,757 real mat
coverage instances, chosen so both density levels earn their atlas space),
3-level climate tint, 3-level arid, 2-level wet. Arid and wet are keyed only
into instances of the three generators that actually read them
(`READS_ARID`/`READS_WET` in `materials/index.ts`, checked against the real
generator bodies rather than assumed) — keying every material by both measured
22 → 51 instances for no reason, since 14 of 17 materials ignore both. End to
end through `resolveStyle` → `tileSurface` → `fieldMaterials` on the same nine
segments: **mean 14.6 instances per map, worst 21**, and composing a full field
against its own built atlas produced zero missing lookups on every segment —
the compositor's codes and the atlas's keys agree by construction, not by luck.

*Found by measurement, not by eye: `turf`'s fill fractions were lying.* The doc
comment states mats leave holes for the ground to show through; measuring the
generators' actual output showed `grass` at `full` density painting **100%** of
the cell and `dryGrass` 98% — the fBm gate concentrates around 0.5 the same way
masks.ts's spill field does, so a fill fraction near either end of the range
saturated instead of thinning out. Same fix as `SPILL_CONTRAST`: a contrast
stretch about the midpoint (`TURF_CONTRAST = 2.4` in `materials/index.ts`)
before the threshold compare, so `fill` means what its comment says.

Verified: 106 tests pass (14 new in `compose.test.ts` — instance ordering,
substrate nesting, additive mat stacking, sparse/full partition, the altitude
AND at 2 and 3+ straddling levels, fringe clamping, and an integration test
compositing a real 6×6 mixed field against a real atlas with **0 interior
gaps**); `bunx tsc --noEmit` clean in-package, root `bun run type-check` clean.
Real-map measurements above (altitude straddle rate, instance counts, turf
fill) were re-run against the actual shipped code, not just the scratch scripts
used to pick the constants.

*Deliberately deferred to T.* `compose.ts` has no designer-visible surface yet
— D's own milestone line doesn't ask for one, and T's is explicitly "becomes
the designer's primary surface", so wiring a live multi-tile preview is that
milestone's job, not this one's.

**T done (2026-08-22).** New `core/terrain.ts`, `core/terrain.test.ts` (14 cases),
and `app/TerrainPreview.tsx`; `previewUtils.ts` gained the biome-cluster
placement generalized from `MixedBiomePreview` (width×height, not just square,
so both previews share one implementation). Wired into `App.tsx` as the
designer's primary preview, ahead of the atlas/palette panels, per the
milestone's own framing.

*What this milestone actually had to solve.* `compose.ts` only ever asked "which
sprites cover this dual cell" — cliff faces and altitude rims are a *tile*
concept (compose.ts says so explicitly: "the renderer's job… not the atlas's"),
offset from the dual grid by half a tile (masks.ts). Nothing before T combined
the two grids into one picture. `tileOrigin` is that relationship read
backwards from `compose.ts`'s `cellOrigin` (shift up by `TILE_H/2`); cliff walls
and rim strokes are ports of `isoRenderer.ts`'s existing per-tile `Graphics`
code, unchanged in geometry, just at the 2× native-bake scale and rasterised
into a `PixelBuffer` instead of a Pixi `Graphics` object (new `fillPolygon` /
`drawLine` primitives in `pixels.ts`, since the designer has no scene graph).

*Depth-sorting two grids with different origins was the one real design
decision.* Both `isoRenderer.ts` (tiles) and `compose.ts` (dual cells) already
sort back-to-front by `col + row`, but a dual cell sits, on screen, between
tile `(c, r)` and tile `(c+1, r+1)` — its apparent depth is the tile grid's key
shifted by half a cell in each axis, i.e. `cellDepth + 1`, not `cellDepth`.
Using that offset for dual-cell items and the bare `col + row` for tile items
in one merged, depth-sorted paint list interleaves the two correctly: an
elevated tile's wall is occluded by the floor sprites in front of it and itself
occludes the ones behind it. This is a prototype of an interleaving problem
milestone G has to solve for real inside Pixi's container ordering — the file
header says so, and it is why `renderTerrain` produces a plain `PixelBuffer`
rather than trying to be the shape G's renderer will end up taking.

*That heuristic is not exact, and the tests are written to not pretend it is.*
Two independent grids can legitimately land on the same screen point, and which
one wins there depends on the depth tie-break. Measuring this directly (a
throwaway script, not a kept test): a uniformly-elevated flat field shows the
predicted "every tile's own pillar is hidden behind the next one" behavior at
low elevations, but **not** at high ones or near the map fringe, where the
finite grid runs out of neighbours to do the occluding — cliff wall pixels went
from 0 at level 1 to several thousand at level 3 on a 4×4 uniformly-raised
field. So no test asserts an exact pixel color at a hand-computed coordinate;
`terrain.test.ts` instead scans the whole buffer for exact-color counts
(present/absent, not "at this pixel"), and the one true-by-construction case —
a perfectly flat, level-0 field, where `drawTileWalls` never calls
`fillPolygon`/`drawLine` at all — is what pins down the "nothing drawn when
nothing should be" contract exactly.

*Synthetic altitude field, calibrated against D's own measurement.*
`terrainLevel` picks integer floor levels directly from a low-frequency `fbm`
field around a base level (not from a continuous altitude value that happens to
round the way you want), so `floorLevel(level / MAX_FLOORS)` round-trips
exactly for any integer level — verified for all 11 levels under floating-point
rounding, not just assumed. `defaultLevelFrequency` and the panel's default
"relief" of 2 were picked by measuring `straddleFraction` (new, and reused by
both the panel's readout and the test suite) across grid sizes 12–32 and 3
seeds at relief 1/2/3: relief 2 lands straddle rates in the 10–28% range and
3–4 distinct levels per field, the same neighbourhood as D's real-map figures
(17.2% straddle, ~4 levels) — not an exact match (a hand-authored scenario
doesn't need one), but evidence the synthetic scenario isn't degenerate (either
a flat field or wall-to-wall single-tile noise, both of which would defeat the
preview's purpose).

*Composition itself needed no new machinery.* `renderTerrain` calls the exact
same `composeCell` milestone D shipped, unmodified — the only new floor-side
code is depth-sorting its output against the tile-wall items. The "no interior
gaps" property compose.test.ts already established for `composeField` in
isolation is re-verified here through the full merged pipeline (cliffs + rims +
floor in one buffer) on a flat field, closing the gap D's own log flagged as
deferred ("no designer-visible surface yet").

Verified: 14 new tests (raster primitive correctness, the `tileOrigin`/
`cellOrigin` relationship at multiple levels, `terrainLevel` bounds and
plateau-coherence, `straddleFraction` against both a checkerboard extreme and a
hand-counted mixed field, and the renderTerrain suite above) alongside the
existing 108; `bunx tsc --noEmit` clean in-package, root `bun run type-check`
clean. Headless render of the running designer (Chrome `--headless=new`) at the
default 16×16/relief-2 scenario over a real biome (Tropical Rainforest) shows
the intended picture at a glance: a cliff face where the patch's outer edge
meets ground level, and an organic wandering rim line — not a straight
diamond-contour cut — tracing an interior plateau boundary, both sitting under
the same biome-mixed, textured floor composition milestone D produced.

*Deliberately deferred.* Exact cross-grid occlusion (the depth-tie approximation
above) is explicitly G's problem, not fixed here. The panel's biome-cluster
placement reuses `MixedBiomePreview`'s wobbly-circle blobs rather than a purpose
-built terrain-scale biome layout; revisit if T's read on biome seams next to
altitude steps turns out to need one. Water is still absent from the composed
floor (same gap A and D both logged).

**F done (2026-08-24).** New `core/features/index.ts` and `index.test.ts` (10
cases); `compose.ts` gained `TileSurface.scatter`, `tileOrigin` (mirrored from
terrain.ts), `featuresForTile` and `fieldFeatureInstances`; `terrain.ts`
gained the feature pass in `renderTerrain`. Two new tests in compose.test.ts,
two in terrain.test.ts (140 total, up from 122).

*What F actually is.* Static scatter (pebbles/twigs/leaves — v1's per-pixel
stamp stage) becomes atlas sprites: 4 variants per kind, stamped on the same
authoring block grid as the litter mats so shapes come out iso-projected and
chunky at texture scale. Unlike ground materials there is no periodicity
requirement and no corner mask — a feature is a self-contained object, rasterised
over the WHOLE cell rect and cropped, so it may legitimately spill past its own
tile's diamond edge onto the neighbour's rect. That is the milestone's headline
property, and it is asserted directly: across 8 seeds every kind must draw at
least one pixel outside the unit lattice square.

*Host-material compatibility is a placement gate, not a texture property.*
`FEATURE_HOSTS` maps each kind to the substrates/mats that can bear it (a pebble
needs stony or bare ground; a leaf can land on grass); `tileSurface` applies it
when building the tile's scatter list, alongside a two-level coverage
quantisation (`quantiseScatter`: none below 0.05, sparse to 0.35, full above —
deliberately lower thresholds than the mats', because dense leaf cover is what
the leafLitter mat is for). Placement itself (`featuresForTile`) hashes
(tile, seed, instance key) against the density level, so sparse tiles show a
subset of what full would show, never a different random set.

*The depth slot was the one real bug, found by a zero pixel-diff.* Features were
first drawn at their host tile's depth slot — and vanished completely: a tile's
own diamond is covered by the four dual cells whose corners meet at its centre,
all of which sort at tileDepth+1 or deeper, so every floor sprite painted over
every feature pixel. Features now emit at tileDepth + 1.5 — strictly above all
floor, which is correct semantics anyway: scatter lies ON whatever ground is
under it, host or not. The test that caught this compared renderTerrain against
itself (both calls drew features once the internal feature-atlas fallback
landed); it now compares a with-scatter field against an identical field minus
scatter.

*A measurement note on the overhang test.* The first version asserted that ONE
seed's build overhangs for every kind; it failed for pebble because anchor
jitter only puts a shape past the diamond edge when its anchor lands near an
cell boundary — measured, roughly 11/30 seeds do that for pebble, 21/30 for
twig, 17/30 for leaf, with every individual shape index capable across seeds.
So the test now aggregates over 8 seeds per kind instead of demanding one lucky
build prove the property — same failure mode if someone adds an insideDiamond
clip, without flaking on legitimate anchor luck.

Verified: 140/140 tests pass (18 new across features/compose/terrain);
`bunx tsc --noEmit` clean in-package, root `bun run type-check` clean. Feature
colors are asserted to come only from their material's ramp (palette closure
holds), sprites stay ≥90% inside their own tile rect (overhang is a few px of
spill, not half the object on the wrong tile), and the flat-field no-gaps
integration test re-passes with features layered in.

*Deliberately deferred to G.* The feature atlas is not shelf-packed into the
main pages — three kinds × 4 small sprites don't justify packer machinery until
the real renderer wires both atlases together. Animated scatter (ferns/reeds/
flowers) remains out of scope, as PLAN.md's open question always scoped it.

**Designer memory + rebuild cost (2026-09-20, commits `58f5210` / `03b794d`).**
Not a milestone — the designer tab was running out of memory after a handful of
preview-option changes, which made T and F's own surface unusable for judging
anything. Five separate causes, worth logging because four of them are
properties of the v2 design rather than of this UI.

*The dominant one was React's dev build reading our pixels.* Its performance
track serialises each component's props (`logComponentRender` →
`addObjectToProperties`), walking objects with `for...in` to depth 3. A typed
array's indices are enumerable own properties, so **one `PixelBuffer` reaching a
prop costs one `[string, string]` pair per pixel byte**. Measured with Chrome's
sampling heap profiler on a single 32×32 terrain-preview rebuild: **954 MB
allocated, of which 953 MB was React's serialiser and ~1 MB this package's own
code.** A production build of the same interaction stays flat at 4–5 MB, so it
is purely a dev-mode tax — but dev is where the designer lives. `pixels.ts`
gained `hidePixelData`, which marks the payload non-enumerable; `for...in` skips
it while `buf.data[i]` is unaffected. Every object in the package that carries a
big typed array now goes through it, which in practice means all of them —
`PixelBuffer`, `MaskBitmap` and `FeatureSpriteRef` all end up inside an `Atlas`,
and `AtlasPanel` takes an `Atlas`.

*Its one real consequence is a trap, so it is guarded rather than documented.*
`{ ...buf }` now silently drops the pixels, because spread copies enumerable own
properties only. `aliasBuffer` exists for the one case that legitimately needs a
fresh object identity over the same pixels (`MixedBiomePreview` republishing a
buffer it is still progressively baking into, so React sees a changed prop), and
`TileCanvas` throws a named error rather than letting it surface as
"ImageData: input data has zero elements".

*The other four.* `TileCanvas` caches the decoded `ImageBitmap` by buffer
identity, so a zoom-only change redraws instead of re-copying and re-decoding
tens of MB, and a stale effect run closes its bitmap the moment the decode
resolves — never more than one in-flight decode plus one cached bitmap.
`atlas.ts` memoises variant textures on the exact ctx fields that define them
(`cachedVariant`), which turns the repeat builds the panels do on load, on a
grid switch and on a re-bake into cut-and-pack only; it is bounded at
`VARIANT_CACHE_MAX = 2048` 32 KB entries and drops the whole cache at the cap
rather than evicting per entry, because builds always request a coherent batch.
`TerrainPreview` debounces its inputs by 150 ms, since the field → atlas → render
chain is synchronous and costs ~0.5–1 s at the larger grids — undebounced, a
slider drag queues a rebuild storm and piles up the multi-MB buffers each
rebuild produces. And `App` mounts the biome-mix and gallery panels only after
first idle, keeping their bakes (~400 ms) off the initial-load critical path.

**Preview coherence + the level clip (2026-09-20, commit `03b794d`).** Two
defects found on one Cold Desert / seed 1232 terrain preview. Both are dual-grid
properties, not tuning.

*Single-tile enclaves: the preview's property jitter was the wrong model.*
`previewUtils.ts`'s `jitterInput` perturbed each tile's climate properties with
`hash2D(tx, ty, …)` — independent white noise per tile. Several biomes sit right
on a substrate threshold in `scoreSubstrates` (Cold Desert on sand/soil, the
montane and tropical-forest ones on two or three at once), so a per-tile coin
flip decided the winner and the dual grid rendered that faithfully: a chessboard
of one-tile enclaves, each a lone diamond — the one shape this whole design
exists to stop the eye finding. Measured over **44 biomes × 5 seeds at 16×16:
4.9% of all tiles were lone one-tile islands of their substrate** (11.6% in the
worst biome), mean patch 10.3 tiles. Low-frequency fBm at `JITTER_CELLS = 5`
with the usual contrast stretch (`JITTER_CONTRAST = 2.2` — fBm concentrates near
0.5, the same trap logged in A) gives **0.7% / 2.6% worst, mean patch 30.0**.
This is also the faithful model: tilegen's properties come from gradient axes,
cluster fields and a CA smoothing pass, so a real substrate patch is many tiles
across. Two knock-ons — the `seed` is now threaded in (a re-roll never used to
re-roll the speckle), and the "origin tile is exactly `input`" exemption is gone
— against a coherent field, pinning one tile back to the base value is precisely
how you manufacture a one-tile enclave, dead centre of the preview.

*Spill runs downhill, never uphill.* The reported symptom was "cliff colours look
slightly off-centre". The cause: **mask spill was crossing floor-level
boundaries in both directions.** Two levels of one dual cell are drawn
`CLIFF_UNIT` = 12 px apart with the upper tile's cliff face standing between
them, and `SPILL_AMP = 0.2` is ±0.2·TILE_H/2 ≈ 3 px vertically — so the *lower*
level's overhang, drawn at the lower offset, painted ground a few pixels **up**
the wall, in chunks that wandered along its length, while the upper lip ate
another ~3 px from above. 7.2 px of a 12 px face survived, with a foot that
moved. The fix is one rule: a mask may spill onto levels *below* it (the lip
overhanging a face is the intended read, per "the overhang-only mask rule") and
never onto levels above it. `CellSprite` gained `clip`, the hard nominal
footprint of "corners at or below my level" — `CODE_FULL`, i.e. no clip, for a
non-straddling cell and for the top level of a straddling one, so ~83% of cells
take the unchanged path. Applied in `blitSprite` against `masks.ts`'s new
`nominalMask`, **not** baked into new sprite codes: doing it in the atlas would
take the code space from 16 to 81 (`code ⊆ clip ⊆ 15`) and multiply sprites by
five for no visual gain. Measured on a one-level plateau step: **foot-of-cliff
wander sd 1.83 → 0.25 px** (0.25 is the iso line's own rasterisation — identical
to a spill-off reference), **mean visible face 7.2 → 9.5 px** of 12.

*The generalisation worth keeping.* The dual grid's organic overhang assumes
there is nothing behind the boundary it spills across. That holds for a material
boundary and fails for anything drawn *between* two passes of one cell. A cliff
face is the only such thing today; whatever G adds between passes will need the
same clip.

Verified: 152/152 tests pass, up from 140 — 12 new across `masks.test.ts`
(`nominalMask` covers exactly the nominal region, partitions the diamond with
its complement so clipping can never open a hole the face doesn't fill, and is
strictly tighter than the drawn mask), `compose.test.ts` (clip codes for
two-level, non-straddling and three-level cells), `terrain.test.ts` (the
foot-of-cliff wander, as a straightness assertion on rendered pixels) and a new
`app/previewUtils.test.ts` (the enclave census above, plus jitter coherence,
seed dependence and amplitude bounds). **Each new test was confirmed to fail on
the pre-fix code** — foot wander 6.5 px, singleton share 4.1% — rather than
passing vacuously. `tsc --noEmit` clean.

*Noted, not fixed.* A 2-pixel interior pinhole shows up in a Temperate Wetland /
seed 99 render. It predates both fixes (present with the clip disabled; the clip
in fact closed a third one elsewhere), so it is a separate defect and was left
alone.

**G done (2026-09-21).** New `src/floorField.ts` and `src/isoTerrain.ts` in the
game; `core/atlas.ts` gained the clipped-sprite axis, `core/compose.ts` gained
`buildFieldAtlas`. Deleted: `src/floorTextureCache.ts` and its IndexedDB store,
`src/floorTextures.ts`, `core/bake.ts`, `core/stamps.ts`, `core/substrate/`,
`core/mats/`, `core/scatter/`, `RenderStyle` + `DEFAULT_RENDER`, `grainCoord`,
`isolateEdgeGate` + `edgeInset`, and `MixedBiomePreview.tsx`. 154 tests (up
from 152); both apps build; `tsc --noEmit` clean at the root and in-package.

*The fork G actually turned on: how the level clip reaches a GPU.* `renderTerrain`
applies it per pixel at blit time, which costs the CPU path nothing. A GPU
sprite is a quad, so there it has to be baked into a texture — and the full
product is `code ⊆ clip ⊊ 15`, 50 non-empty pairs against 15 unclipped codes,
which would roughly triple every atlas. Measured on real 64×64 maps
(`generateTileMap` + `dressTileMap`, 4 seeds) before committing to it: a map
touches **44 of the 65 possible pairs**, but only a fraction of them *per
material*. So the atlas takes the pairs the compositor asks for rather than
enumerating them — `buildFieldAtlas` composes the field once to collect them,
then builds. Actual cost, not estimate: **+46–51% sprites but only +21–23%
sprite pixels** (a clipped sprite is a subset, so it crops tighter), and **still
one 2048 page either way — 16.8 MB, unchanged**. Zero unresolved lookups over
every cell sprite on the map.

*That also un-circularised composition.* `composeCell` used to take an `Atlas`
purely to read `shapeCount`/`biasCount` off it — but on the GPU path what the
atlas must *contain* is decided by what composition asks for, so it cannot
depend on a built one. Those two counts are now `atlasCounts(config)`, a pure
function of the config, and `Atlas` satisfies the same `SpriteCounts` shape
structurally, so no call site changed. Composition no longer depends on the
atlas at all, which is the right shape for the Bevy port as well.

*Equivalence is asserted, not assumed.* `renderTerrain` prefers a pre-baked
clipped sprite when the atlas holds one and falls back to the per-pixel clip
otherwise, and a test renders the same field both ways and requires **0
differing bytes**. That is deliberate beyond the test: it means the designer's
own preview draws the exact sprites the game will, so the two renderers cannot
drift apart unnoticed.

*The interleaving problem T deferred here, solved by bucketing rather than
sorting.* T's prototype pushes every item into one array with a fractional depth
key and sorts. The Pixi equivalent — `sortableChildren` + `zIndex` — means a
sort over ~35k children for a 64×64 map and leaves culling as a per-child test.
But every depth is (integer tile depth) + a small constant, so they bucket
exactly: one `Container` per diagonal `d = col + row`, added in ascending `d`,
reproduces the sort with no sorting at all. Culling becomes ~128 bounds tests
instead of 35k, cheap enough to run on every viewport move. The three offsets
are exported from `terrain.ts` (`TILE_DEPTH`, `CELL_DEPTH`, `FEATURE_DEPTH`) and
both renderers derive from them — writing the rule out twice is exactly how the
two pictures would quietly diverge. `tileOrigin`, which D had knowingly
duplicated across compose.ts and terrain.ts, was folded together for the same
reason, as were `CLIFF_UNIT` / `MAX_FLOORS`, which `isoRenderer.ts` and
`types.ts` had each declared.

*What the teardown cost the designer.* Three panels ran on `bakeTile`. The 8×
single-tile preview became a 3×3 @ 4× close-up — T already established that a
lone diamond is not a meaningful unit, since every material boundary lives
*inside* a dual cell. `BiomeGallery` became 3×3 patches drawn from **one atlas
shared across all 44 biomes**, which is the claim v2 makes and a gallery of 44
separate atlases would have quietly disproved. `MixedBiomePreview` was deleted
outright: its own header said its whole reason for existing was v1's per-tile
cost, and `TerrainPreview` had already absorbed its cluster placement. The
`RenderStyle` section of `PropertyPanel` went with it — `grain`, `crispEdges`
and `isolatedPatches` were knobs for quantising a per-pixel bake after the
fact, and v2 authors at a coarse lattice and cuts edges with masks.

*Verified, and what is not.* Both apps build; the full 64×64 map renders through
the game's own field and atlas (`buildFieldAtlas` at `pageSize: 2048`) with the
CPU renderer — 755 ms atlas, 389 ms render, one page, no holes — and reads
correctly at native scale: organic material boundaries, clean cliff steps,
scatter in place. **The Pixi wiring itself has not been seen in a browser**:
there is no Chrome on this machine, so `isoTerrain.ts`'s display list, the
per-diagonal culling and the hit-area change are type-checked and reasoned
about but not looked at. That is the first thing to do next session.

*Deliberately still open.* Water is a flat blue diamond drawn over the floor —
a stand-in, not the top-priority material in the stack that the open question
asks for; it is now the last v1-shaped thing in the renderer. The feature atlas
is still not packed into the main pages (F deferred that "to G"): three kinds ×
4 shapes of at most 32 KB does not pay for the packer, so it is twelve small
textures cut once per build. The debug overlays keep their flat per-tile fill,
which is correct — they exist to read a scalar field off the map, and a composed
floor would only obscure it.

## Open questions

- Variant count per material: A ships 8 full-cell shapes × 3 tone-bias levels
  + 2 per partial mask, along with the question of whether partial codes need
  their own bias levels (A deferred that at a cost of 14 × (levels − 1) sprites
  per material, "revisit at T"). **T and F have both landed and neither
  revisited it.** Note the plan as written — "judge it against the terrain
  preview" — is not currently possible: only `AtlasPanel` exposes the shape and
  bias dropdowns, while `TerrainPreview` always builds with
  `DEFAULT_ATLAS_CONFIG`. Lifting those two knobs to shared `App` state is a
  prerequisite for answering this at all.
- Water: still has no atlas entry and no place in the material stack —
  `DesignInput.water` / `StyleParams.water` are booleans nothing in `compose.ts`
  or `atlas.ts` reads. G gave it a stand-in (a flat blue diamond drawn over the
  floor in `isoTerrain.ts`) so the map stays readable, which makes it the last
  v1-shaped thing left in the renderer. It should join the stack as a
  top-priority material so shorelines get the same rounding every other boundary
  gets. A, D, T and now G have each logged this; **it is the obvious next
  milestone** — every other open item is a tuning judgment, this one is missing
  machinery.
- Does the drainage range defect also constrain biome *diversity*?
  `stage6_selectBiomes` feeds drainage into the cascade's `drainageLowerBound`,
  so the pre-fix compressed range plausibly narrowed biome selection too. Flagged
  when the defect was found and **still not confirmed** either way. (The defect
  itself is fixed — see "Drainage fix + resolver rebalance done (2026-08-17)" in
  the log. This is the one thread of it left open.)

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
