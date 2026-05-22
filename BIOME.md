# Biome Generation Architecture

## The Problem with Classify-After-Noise

The current pipeline generates tile properties from independent noise layers, then classifies them into biomes:

```
noise → (temperature, precipitation, drainage, light, altitude, seasonality) → classify → biome
```

Noise has no knowledge of biome boundaries, so it produces values in the gaps between biomes. Classification then either fails hard (confidence = 0 on any out-of-range axis) or requires constant range-widening as edge cases appear.

---

## Target Architecture: Generate Biomes First

Invert the pipeline. Assign biome regions before deriving tile properties.

```
biome regions → sample tile properties from biome ranges → blend at borders
```

### Stage 1 — Macro layout (biome regions)

Use large-scale noise or Voronoi to place biome "seeds" across the map. At this scale, the two root axes drive placement:

- **Temperature** — latitude gradient (large, smooth noise)
- **Precipitation** — orthogonal large-scale noise (not correlated with temperature)

These two axes alone constrain which biomes are plausible at any location (hot+wet → tropical zone, cold+dry → tundra zone). Place biome seeds within the plausible set for each region.

### Stage 2 — Local modifiers (drainage, altitude, light, seasonality)

Within each biome region, apply local noise to derive secondary properties:

- **Drainage** — driven by local elevation gradient (low flat areas → low drainage)
- **Altitude** — elevation noise, mostly independent
- **Light** — correlated with latitude/cloud cover
- **Seasonality** — correlated with continentality (distance from coast proxy)

These modifiers can shift a tile toward a neighboring biome — a low-drainage patch inside a Taiga region becomes a Boreal Bog. This is how ecotones form naturally.

### Stage 3 — Ecotone blending at borders

At biome region boundaries, blend properties from both adjacent biomes rather than switching abruptly. The blend width can be fixed (e.g. 3–5 tiles) or driven by terrain features (rivers, ridgelines are hard edges; open plains are soft).

Blended tiles can be classified as a transitional biome or simply carry mixed properties for texture generation.

---

## Derived Values

Rather than scoring tiles against 6 independent axes, compute a small set of derived ecological values that capture what actually matters:

```
effectiveMoisture  = precipitation × (1 - drainage)
continentality     = seasonality × temperature variance
waterlogging       = precipitation × (1 - drainage)² 
```

These collapse the 6-axis space into a smaller set of ecologically meaningful dimensions that map more cleanly onto biome character.

---

## Axis Hierarchy and Contagion

When applying local noise in Stage 2, apply axes in dependency order:

| Order | Axis | Contagion | Depends on |
|---|---|---|---|
| 1 | Elevation | — | base noise |
| 2 | Temperature | low (local) | latitude + elevation |
| 3 | Precipitation | very high | large-scale climate noise |
| 4 | Drainage | medium | elevation gradient (slope) |
| 5 | Light | low | latitude + cloud cover |
| 6 | Seasonality | low | continentality |
| 7 | Effective moisture | — | derived from precip + drainage |

Cellular automata passes, if used, should run in this order — each pass can read the output of the previous.

---

## Classifier (interim / fallback)

Until the pipeline is fully inverted, the classifier should use **soft scoring** instead of hard zeros:

```ts
function score(value: number, range: [number, number]): number {
  const [min, max] = range;
  if (value >= min && value <= max) {
    // peak score at midpoint
    const mid = (min + max) / 2;
    return 1 - Math.abs(value - mid) / (mid - min);
  }
  // decay beyond boundary, never fully zero
  const width = max - min;
  const overshoot = value < min ? min - value : value - max;
  return Math.max(0, 1 - overshoot / (width * 0.5));
}
```

This ensures out-of-range tiles still get a meaningful best-match rather than falling back to array order.
