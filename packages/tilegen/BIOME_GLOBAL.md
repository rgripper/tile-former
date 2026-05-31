# Global Map Generation

See [BIOME_LOCAL.md](BIOME_LOCAL.md) for local world generation.

---

The global map is a grid of **segments**. Each segment represents a region ~100–500 km across and is the entry point for one local world. The global map sets the climate envelope — it does not simulate individual tiles.

Each local world is a grid of tiles, each tile approximately **5 meters** across (exact size TBD).

## Responsibilities

- Place climate regions across the world using Voronoi
- Assign each segment a **stable base climate**: altitude band, temperature zone, precipitation zone, light level
- Generate smooth transitions between adjacent segments

## Climate Placement

At this scale, two root axes drive placement:

- **Temperature** — latitude gradient (large, smooth noise)
- **Precipitation** — orthogonal large-scale noise (not correlated with temperature)
- **Altitude** — Voronoi-placed highland and lowland regions, applied after temperature and precipitation; raises or lowers the effective temperature of a segment and constrains which biome families are plausible (high-altitude segments cannot be tropical regardless of latitude)

These constrain which biomes are plausible per segment (hot+wet → tropical zone, cold+dry → tundra zone). `biomeFamily` is then selected within the plausible set — **selection mechanism is deferred work**.

## Ocean Segments

Ocean segments exist but are restricted to the **edges of the global grid**. Interior segments are always land. Ocean segments do not run local world generation — they are boundary markers that affect climate blending (moisture source, continentality reference) for adjacent land segments. Ocean segment generation details are **deferred work**.

## Segment Data

Each segment stores the stable base values that seed its local world:

```
segment.baseAltitude      // stable for the whole local world
segment.baseTemperature   // stable base, local noise adds variation on top
segment.basePrecipitation // stable base, local noise adds variation on top
segment.baseLight         // latitude-derived baseline insolation — exact derivation is deferred work
segment.baseSeasonality   // amplitude of seasonal swings; driven by latitude + continentality (distance from coast)
segment.biomeFamily       // broad biome class (e.g. "boreal", "arid", "tropical")
```

## Segment Border Blending

Global-to-global transitions are blended at segment borders — when moving between adjacent segments the climate parameters shift gradually, not abruptly. The local world inherits this blend at its edges (see Stage 4 in [BIOME_LOCAL.md](BIOME_LOCAL.md)).
