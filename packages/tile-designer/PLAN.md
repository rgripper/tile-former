# tile-designer — Plan

A designer tool + generation library for pre-baked isometric tile floor textures,
driven by `TileProperties` from `@tile-former/tilegen`. End goal: generative
pixel art for tile floors that the game bakes once and only re-bakes when tile
parameters change.

## Scope: the three feature classes

1. **Substrate & mat** — baked into the floor texture. In scope.
2. **Animated scatter** (ferns, reeds, small flowers) — separate overlay sprites
   with sway frames, positions deterministic. In scope.
3. **Interactive flora** (trees, bushes, succulents) — **out of scope**; the game
   keeps its existing sprite pipeline (`src/isoRenderer.ts`).

## Tech choice

- **Core = pure TypeScript** writing into `ImageData`/`Uint8ClampedArray`.
  No React/Pixi/DOM dependencies, so the game can import the same bake
  functions and wrap results in Pixi `Texture`s.
- **Designer UI = Vite + React + plain Canvas 2D** (`imageSmoothingEnabled = false`
  for zoom). Matches the root app's stack (React 19, Tailwind). Animation preview
  via `requestAnimationFrame`; Pixi not needed at designer scale.

## Architecture

```
packages/tile-designer/
  src/core/                    ← exported library, later consumed by the game
    types.ts                   ← DesignInput (visual subset of TileProperties),
                                 StyleParams, Recipe
    rng.ts                     ← seeded RNG; tile seed = hash(worldX, worldY, worldSeed)
    resolve.ts                 ← TileProperties → StyleParams (pure, unit-testable)
    palette/                   ← color ramps; climate/biome → ramp selection
    substrate/                 ← substrate + mat layer generators
    scatter/                   ← static stamps + animated sprite generators
    bake.ts                    ← compose layers → 64×32 diamond ImageData / atlas
  src/app/                     ← the designer UI
```

## Surface taxonomy (replaces the `surfaceType` hack)

`surfaceType: "rocky" | "sandy"` was a temporary visual marker. The designer
introduces a full taxonomy able to cover every biome in `biomes.ts`, split into
the two visual roles the pipeline already uses:

**Substrates** (what the ground *is* — blended top-2 by score, dithered boundary):

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

**Mats** (what covers it — 0..n coverage layers, each with a coverage fraction):
`grass` (lush), `dryGrass` (straw/steppe), `moss`, `lichen`, `leafLitter`,
`needleLitter`, `sedge` (marsh tufts), `cushion` (fell-field mats).
Driven by `fertility` × `groundLight` × moisture × temperature.

Selection is by score functions over raw `TileProperties` (rockType, drainage,
effectiveMoisture, temperature, altitude, riparian) — per-biome overrides can
bias scores or pin a substrate/mat. A **biome gallery** preview (one tile per
biome at its `paramDist` means) validates coverage of all ~44 biomes at a glance.

**Migration path:** taxonomy lives in the designer core first (`SurfaceSpec`
computed in `resolve.ts` from raw properties, ignoring `surfaceType`). Once
tuned, promote it into tilegen: dresser stage 1 stamps `tile.surface: SurfaceSpec`
and `surfaceType` is deleted. Game logic (movement, sound, spawning) can then
consume the same taxonomy.

## Layer pipeline for one tile bake

1. **Resolve** — `TileProperties` → `StyleParams` (surface spec, colors,
   coverage fractions, scatter densities). Pure function.
2. **Substrate** — paint blended substrate materials per the surface spec.
   Dithered blends (Bayer / blue-noise) between materials; cracks when arid;
   wet sheen near water.
3. **Mat** — coverage masks per mat layer. Grass hue: yellow-green (dry/hot) →
   deep green (wet); desaturated when cold. Tuft pixels, litter speckle.
4. **Static scatter** — pebbles, twigs, fallen leaves stamped into the floor.
5. **Animated scatter** — ferns/reeds/flowers as separate small pixel sprites,
   3–4 sway frames, deterministic placement (reeds ↑ with `riparian`, ferns ↑
   with moisture + low `groundLight`). Exported as overlay spritesheet, NOT
   baked into the floor.
6. **Mask & edges** — 64×32 diamond mask; later phase: border dithering using
   neighbor properties.

**Seamlessness:** all noise is sampled in world coordinates so adjacent tiles
with similar properties tile without visible seams.

## Baking & determinism (pre-bake contract)

- `bakeFloorTexture(props: DesignInput, seed: number): ImageData` — pure,
  deterministic. Painted directly at **128×64** (2× the 64×32 screen diamond;
  the renderer displays it at half size, or full size when zoomed).
- **Cache key = hash of quantized visual properties + seed.** Quantization
  buckets (e.g. moisture ×8, fertility ×8, groundLight ×6) bound the number of
  unique textures; the game re-bakes only when a tile crosses a bucket boundary.
  The designer displays quantized values so designed == baked.
- **Recipe JSON** — resolved StyleParams + seed, exportable/reproducible.

## Designer UI

- **Property panel:** sliders for relevant `TileProperties` fields; selects for
  `rockType` / `surfaceType` / `water`; **biome presets** from tilegen's
  `biomes.ts` filling sliders with biome means.
- **Previews:** zoomed single tile (4×–8× of the 128×64 base); 3×3 neighborhood
  seam check with per-neighbor jitter; variant strip (same props, 8 seeds);
  biome gallery (all biomes at their mean params); animation play/pause for scatter.
- **Export:** PNG (tile / variant atlas / scatter spritesheet) + recipe JSON.

## Milestones

- [x] **M0 — Scaffold:** renamed to `@tile-former/tile-designer`, Vite+React app
  with `dev` script (root: `bun run designer`), workspace dep on
  `@tile-former/tilegen`. tilegen now also exports `rockTypes`/`RockTypeId`/
  `TileProperties`.
- [x] **M1 — Resolver + shell:** surface taxonomy + `resolve.ts` (score
  functions → top-2 blended substrates + up to 3 mats + scatter densities),
  palette system (global ramps + per-biome partial overrides), property
  sliders + biome preset dropdown + flat-color preview + biome gallery
  (renders all 44 biomes at once for taxonomy sanity-checking).
- [ ] **M2 — Substrate:** material generators, dithered blends, diamond mask,
  3×3 seam preview.
- [ ] **M3 — Mat + static scatter:** grass/moss coverage, tufts, pebble/litter stamps.
- [ ] **M4 — Animated scatter:** fern/reed generators, sway frames, overlay preview,
  spritesheet export.
- [ ] **M5 — Export + game hookup:** atlas/recipe export, quantized cache-key API,
  wire `bakeFloorTexture` into `isoRenderer.ts` replacing flat `getTileTopColor`.

## Progress log

**M0/M1 done (2026-07-08).** Package lives at `packages/tile-designer/`;
`bun run designer` (root) or `bun run dev` (in-package) launches it. Core
(`src/core/`) is pure TS and exported from the package root for later reuse by
the game. UI (`src/app/`) is React + plain `<canvas>` (`imageSmoothingEnabled
= false`), no Pixi at designer scale as planned.

Verified: `bunx tsgo --noEmit` clean in-package; dev server serves and all
workspace imports (`@tile-former/tilegen`) resolve; headless run of
`resolveSurface` over all 44 biomes produces plausible substrate/mat picks
(tundra → frozenGround+lichen, bogs → peat, fell-fields → bareRock+scree+
cushion, rainforest → clay+soil+grass/litter).

Known tuning gaps to chase in the UI next session (score-curve edits in
`resolve.ts` / `biomeInput.ts`, not architecture changes):
- Hot/Cold Desert lean too `bareRock`-heavy vs. sand — partly an artifact of
  the gallery's deterministic per-biome rock-type guess in `biomeToInput`,
  worth checking against real sand-forming rock assignment once tilegen
  drives the input instead of biome means.
- Boreal Bog resolves to `frozenGround`+`soil` instead of `peat` — its
  `paramDist` moisture mean sits just under the `peat` score's moisture
  threshold; either lower the threshold or raise the biome's effective
  moisture derivation in `biomeInput.ts`.

## Testing

Core is pure → vitest golden tests (hash `ImageData` for fixed inputs) +
unit tests on `resolve.ts`. Type-check via `bun type-check`.

## Decided

- **Resolution: 128×64** (2× the screen diamond).
- **Animated-scatter positions: computed at load from seed** — zero storage,
  same determinism.
- **Palettes: global base ramps + per-biome partial overrides** from the start.
  A biome override supplies only the ramps it wants to change and is merged
  over the defaults, so shifting the global/per-biome balance later is a data
  edit, not a code change.
- **`surfaceType` is deprecated** in favor of the surface taxonomy above;
  removal from tilegen happens after the taxonomy is visually validated (M2+).

## Follow-ups outside this package

- Promote `SurfaceSpec` into tilegen dresser stage 1; delete `surfaceType`
  from `TileProperties` and update `isoRenderer.ts` / `TileInfo.tsx` consumers.
