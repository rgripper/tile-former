import { Biome } from "./Biome.ts";

// Dimension scales:
//   temperature   — degrees Celsius, unbounded
//   precipitation — 0: hyperarid (<50mm/yr)  →  1: extremely wet (>4000mm/yr)
//   drainage      — 0: impermeable (permafrost/dense clay)  →  1: free-draining (gravel/bare rock)
//   light         — 0: polar/minimal insolation  →  1: equatorial/peak insolation
//   altitude      — 0: sea level  →  1: extreme high mountain
//   seasonality   — 0: stable year-round  →  1: extreme seasonal swing

type RawBiome = Omit<Biome, "paramDist">;

function d(lo: number, hi: number) {
  return { mean: (lo + hi) / 2, stddev: (hi - lo) / 6 };
}

function withDist(b: RawBiome): Biome {
  return {
    ...b,
    paramDist: {
      temperature:   d(b.temperatureRange[0],   b.temperatureRange[1]),
      precipitation: d(b.precipitationRange[0], b.precipitationRange[1]),
      drainage:      d(b.drainageRange[0],      b.drainageRange[1]),
      light:         d(b.lightRange[0],         b.lightRange[1]),
      altitude:      d(b.altitudeRange[0],      b.altitudeRange[1]),
      seasonality:   d(b.seasonalityRange[0],   b.seasonalityRange[1]),
    },
  };
}

const rawBiomes: RawBiome[] = [
  {
    id: 1,
    name: "Tropical Rainforest",
    temperatureRange: [20, 35],
    precipitationRange: [0.7, 1], // >2000mm/yr
    drainageRange: [0.05, 0.35], // clay soils, dense roots hold water
    lightRange: [0.5, 1], // high insolation, near-equatorial
    altitudeRange: [0, 0.35], // lowland basins
    seasonalityRange: [0, 0.25], // near-constant climate year-round
    textureColor: "#228B22",
  },
  {
    id: 2,
    name: "Tropical Dry Forest",
    temperatureRange: [20, 35],
    precipitationRange: [0.3, 0.65], // 500–1500mm/yr, seasonal
    drainageRange: [0.25, 0.6],
    lightRange: [0.5, 1],
    altitudeRange: [0, 0.3],
    seasonalityRange: [0.2, 0.55], // distinct wet/dry seasons
    textureColor: "#A0522D",
  },
  {
    id: 3,
    name: "Savanna",
    temperatureRange: [18, 35],
    precipitationRange: [0.15, 0.5], // 250–1000mm/yr
    drainageRange: [0.4, 0.75], // laterite, sandy soils
    lightRange: [0.5, 1],
    altitudeRange: [0, 0.4],
    seasonalityRange: [0.05, 0.7],
    textureColor: "#FFD700",
  },
  {
    id: 4,
    name: "Desert",
    temperatureRange: [15, 35],
    precipitationRange: [0, 0.15], // <250mm/yr
    drainageRange: [0.6, 1], // sand/rock, water disappears immediately
    lightRange: [0.65, 1], // intense, cloudless sun
    altitudeRange: [0, 0.5],
    seasonalityRange: [0, 0.6],
    textureColor: "#EDC9AF",
  },
  {
    id: 5,
    name: "Temperate Forest",
    temperatureRange: [4, 20],
    precipitationRange: [0.45, 0.85], // 600–2000mm/yr
    drainageRange: [0.2, 0.55],
    lightRange: [0.3, 0.7], // mid-latitude, partial canopy
    altitudeRange: [0, 0.6],
    seasonalityRange: [0.35, 0.8],
    textureColor: "#6B8E23",
  },
  {
    id: 6,
    name: "Grassland",
    temperatureRange: [3, 26],
    precipitationRange: [0.15, 0.45], // 250–750mm/yr
    drainageRange: [0.35, 0.7],
    lightRange: [0.4, 0.85], // open, mid-latitude
    altitudeRange: [0, 0.5],
    seasonalityRange: [0.4, 0.85],
    textureColor: "#7CFC00",
  },
  {
    id: 7,
    name: "Mediterranean",
    temperatureRange: [10, 24],
    precipitationRange: [0.15, 0.45], // 250–700mm/yr, winter-concentrated
    drainageRange: [0.3, 0.65],
    lightRange: [0.55, 1], // sunny coasts
    altitudeRange: [0, 0.35],
    seasonalityRange: [0.35, 0.75],
    textureColor: "#FF6347",
  },
  {
    id: 8,
    name: "Taiga (Boreal Forest)",
    temperatureRange: [-15, 5],
    precipitationRange: [0.2, 0.55], // 300–800mm/yr, low evaporation
    drainageRange: [0.05, 0.35], // near-permafrost, boggy soils
    lightRange: [0.1, 0.45], // high latitude, low sun angle
    altitudeRange: [0, 0.35],
    seasonalityRange: [0.6, 1],
    textureColor: "#4682B4",
  },
  {
    id: 9,
    name: "Tundra",
    temperatureRange: [-20, 4],
    precipitationRange: [0.1, 0.4], // 150–500mm/yr
    drainageRange: [0, 0.2], // permafrost = near-zero drainage, stays waterlogged
    lightRange: [0.05, 0.3], // polar, minimal insolation
    altitudeRange: [0, 0.3],
    seasonalityRange: [0.65, 1],
    textureColor: "#B0E0E6",
  },
  {
    id: 10,
    name: "Alpine",
    temperatureRange: [-20, 8],
    precipitationRange: [0.35, 0.75], // high snowfall
    drainageRange: [0.4, 0.8], // rocky slopes, water runs off fast
    lightRange: [0.5, 1], // above cloud layer, intense UV
    altitudeRange: [0.45, 1],
    seasonalityRange: [0.5, 1],
    textureColor: "#ADD8E6",
  },
  {
    id: 11,
    name: "Cloud Forest",
    temperatureRange: [15, 28],
    precipitationRange: [0.55, 1], // high effective moisture from cloud/fog
    drainageRange: [0.1, 0.45],
    lightRange: [0.4, 0.85], // often overcast, diffuse light
    altitudeRange: [0.3, 0.65],
    seasonalityRange: [0.2, 0.65],
    textureColor: "#3B7A57",
  },
  {
    id: 12,
    name: "Tropical Swamp",
    temperatureRange: [20, 35],
    precipitationRange: [0.6, 1],  // flooded year-round
    drainageRange: [0, 0.2],       // standing water, impermeable substrate
    lightRange: [0.3, 0.85],
    altitudeRange: [0, 0.2],       // lowland basins and floodplains
    seasonalityRange: [0, 0.45],
    textureColor: "#2E6B3E",
  },
  {
    id: 13,
    name: "Temperate Wetland",
    temperatureRange: [-5, 20],
    precipitationRange: [0.35, 1.0],
    drainageRange: [0, 0.25],      // floodplains, marshes, fens
    lightRange: [0.3, 0.8],
    altitudeRange: [0, 0.35],
    seasonalityRange: [0.2, 0.75],
    textureColor: "#4F7942",
  },
  {
    id: 14,
    name: "Boreal Bog",
    temperatureRange: [-15, 5],
    precipitationRange: [0.2, 0.8],
    drainageRange: [0, 0.15],      // peat/permafrost, water trapped permanently
    lightRange: [0.1, 0.55],
    altitudeRange: [0, 0.3],
    seasonalityRange: [0.5, 1],
    textureColor: "#5C7A4E",
  },
  {
    id: 16,
    name: "Cold Desert",
    temperatureRange: [-15, 15],   // Gobi, Patagonian, Great Basin
    precipitationRange: [0, 0.15],
    drainageRange: [0.5, 0.90],    // rocky/gravelly, frost-cracked substrate
    lightRange: [0.3, 0.75],       // mid-latitude, less intense than hot deserts
    altitudeRange: [0, 0.7],       // can be high-altitude (Tibetan plateau)
    seasonalityRange: [0.3, 0.85], // cold winters, warm summers
    textureColor: "#C4B99A",
  },
  {
    id: 17,
    name: "Hot Desert",
    temperatureRange: [35, 55],    // Rub' al Khali, Danakil Depression
    precipitationRange: [0, 0.10],
    drainageRange: [0.7, 1],
    lightRange: [0.8, 1],          // extreme insolation
    altitudeRange: [0, 0.3],
    seasonalityRange: [0, 0.4],
    textureColor: "#F4A460",
  },
  {
    id: 15,
    name: "Semi-arid Scrub",
    temperatureRange: [5, 30],
    precipitationRange: [0.05, 0.20], // 50–300mm/yr, between Desert and Grassland
    drainageRange: [0.45, 0.80],      // rocky/sandy soils, fast runoff
    lightRange: [0.45, 0.90],         // open, sunny
    altitudeRange: [0, 0.5],
    seasonalityRange: [0.3, 0.8],
    textureColor: "#BDB76B",
  },

  // --- Lowland stubs (previously biomeId: null) ---

  {
    id: 18,
    name: "Polar Desert",
    temperatureRange: [-50, -5],
    precipitationRange: [0, 0.10],   // <50mm/yr, hyperarid
    drainageRange: [0.40, 0.85],     // rocky/gravelly, permafrost beneath
    lightRange: [0, 0.15],           // polar, minimal insolation
    altitudeRange: [0, 0.5],
    seasonalityRange: [0.75, 1],
    textureColor: "#E8E8E0",
  },
  {
    id: 19,
    name: "Arctic Heath",
    temperatureRange: [-20, -5],
    precipitationRange: [0.35, 0.60],
    drainageRange: [0.15, 0.45],
    lightRange: [0.05, 0.25],
    altitudeRange: [0, 0.3],
    seasonalityRange: [0.65, 1],
    textureColor: "#8B7355",
  },
  {
    id: 20,
    name: "Arctic Marsh",
    temperatureRange: [-20, -5],
    precipitationRange: [0.60, 1.0],
    drainageRange: [0, 0.15],        // polygon bogs, waterlogged flats
    lightRange: [0.05, 0.20],
    altitudeRange: [0, 0.2],
    seasonalityRange: [0.70, 1],
    textureColor: "#4A7B6E",
  },
  {
    id: 21,
    name: "Cold Steppe",
    temperatureRange: [-10, 5],
    precipitationRange: [0.15, 0.35], // Mongolian/Kazakh steppe range
    drainageRange: [0.35, 0.75],
    lightRange: [0.25, 0.60],
    altitudeRange: [0, 0.55],
    seasonalityRange: [0.55, 0.95],
    textureColor: "#C8B87A",
  },
  {
    id: 22,
    name: "Cold Rainforest",
    temperatureRange: [-5, 10],      // Pacific Northwest / Valdivian analogue
    precipitationRange: [0.60, 1.0],
    drainageRange: [0.15, 0.50],
    lightRange: [0.20, 0.55],
    altitudeRange: [0, 0.5],
    seasonalityRange: [0.45, 0.85],
    textureColor: "#2D5A27",
  },
  {
    id: 23,
    name: "Temperate Shrubland",
    temperatureRange: [5, 20],
    precipitationRange: [0.35, 0.60],
    drainageRange: [0.30, 0.65],
    lightRange: [0.35, 0.75],
    altitudeRange: [0, 0.5],
    seasonalityRange: [0.35, 0.80],
    textureColor: "#8B9467",
  },
  {
    id: 24,
    name: "Thorn Scrub",
    temperatureRange: [35, 55],      // Sahel/Caatinga analogue, extreme heat
    precipitationRange: [0.15, 0.35],
    drainageRange: [0.50, 0.85],
    lightRange: [0.75, 1],
    altitudeRange: [0, 0.3],
    seasonalityRange: [0.40, 0.80],
    textureColor: "#B8860B",
  },
  {
    id: 25,
    name: "Tropical Monsoon Forest",
    temperatureRange: [35, 50],
    precipitationRange: [0.35, 0.60],
    drainageRange: [0.25, 0.60],
    lightRange: [0.65, 1],
    altitudeRange: [0, 0.3],
    seasonalityRange: [0.45, 0.85],
    textureColor: "#7B9A42",
  },
  {
    id: 26,
    name: "Tropical Monsoon Rainforest",
    temperatureRange: [30, 50],
    precipitationRange: [0.60, 1.0],
    drainageRange: [0.10, 0.45],
    lightRange: [0.55, 1],
    altitudeRange: [0, 0.25],
    seasonalityRange: [0.30, 0.70],
    textureColor: "#1A6B2A",
  },

  // --- Montane stubs: arctic zone (altitude > 0.40, temp < −5 °C) ---

  {
    id: 27,
    name: "Alpine Desert",
    temperatureRange: [-50, -5],
    precipitationRange: [0, 0.15],   // bare rock and ice, negligible precip
    drainageRange: [0.55, 0.95],
    lightRange: [0.30, 0.80],        // high-altitude UV even at polar latitudes
    altitudeRange: [0.50, 1],
    seasonalityRange: [0.70, 1],
    textureColor: "#D0CEC8",
  },
  {
    id: 28,
    name: "Alpine Fell",
    temperatureRange: [-40, -5],
    precipitationRange: [0.15, 0.35], // rocky fell-field, sparse cushion plants
    drainageRange: [0.50, 0.85],
    lightRange: [0.25, 0.75],
    altitudeRange: [0.45, 1],
    seasonalityRange: [0.75, 1],
    textureColor: "#9BA89A",
  },
  {
    id: 29,
    name: "Alpine Bog",
    temperatureRange: [-30, -5],
    precipitationRange: [0.60, 1.0],  // snowmelt-fed high-altitude bogs
    drainageRange: [0, 0.20],
    lightRange: [0.20, 0.65],
    altitudeRange: [0.45, 0.90],
    seasonalityRange: [0.70, 1],
    textureColor: "#4A6B5A",
  },

  // --- Montane stubs: cold zone (altitude > 0.40, temp −5 to 5 °C) ---

  {
    id: 30,
    name: "Subalpine Steppe",
    temperatureRange: [-15, 5],      // Tibetan plateau / Andean puna analogue
    precipitationRange: [0, 0.15],
    drainageRange: [0.50, 0.90],
    lightRange: [0.40, 0.85],
    altitudeRange: [0.45, 0.90],
    seasonalityRange: [0.55, 0.95],
    textureColor: "#BDB090",
  },
  {
    id: 31,
    name: "Subalpine Heath",
    temperatureRange: [-15, 5],
    precipitationRange: [0.15, 0.35],
    drainageRange: [0.35, 0.70],
    lightRange: [0.30, 0.70],
    altitudeRange: [0.45, 0.85],
    seasonalityRange: [0.60, 0.95],
    textureColor: "#7D7060",
  },
  {
    id: 32,
    name: "Subalpine Forest",
    temperatureRange: [-15, 5],      // spruce-fir near treeline
    precipitationRange: [0.35, 0.60],
    drainageRange: [0.20, 0.55],
    lightRange: [0.30, 0.65],
    altitudeRange: [0.45, 0.85],
    seasonalityRange: [0.55, 0.95],
    textureColor: "#3D6B4F",
  },
  {
    id: 33,
    name: "Subalpine Bog",
    temperatureRange: [-10, 5],
    precipitationRange: [0.60, 1.0],
    drainageRange: [0, 0.25],
    lightRange: [0.25, 0.60],
    altitudeRange: [0.45, 0.85],
    seasonalityRange: [0.50, 0.90],
    textureColor: "#3E5E45",
  },

  // --- Montane stubs: temperate zone (altitude > 0.40, temp 5–18 °C) ---

  {
    id: 34,
    name: "Montane Steppe",
    temperatureRange: [-5, 18],      // Andean dry puna / Asian plateau steppe
    precipitationRange: [0, 0.15],
    drainageRange: [0.55, 0.90],
    lightRange: [0.45, 0.90],
    altitudeRange: [0.45, 0.85],
    seasonalityRange: [0.40, 0.85],
    textureColor: "#C4AA7A",
  },
  {
    id: 35,
    name: "Montane Scrub",
    temperatureRange: [0, 18],
    precipitationRange: [0.15, 0.35],
    drainageRange: [0.40, 0.75],
    lightRange: [0.40, 0.85],
    altitudeRange: [0.45, 0.80],
    seasonalityRange: [0.35, 0.80],
    textureColor: "#8F9B5A",
  },
  {
    id: 36,
    name: "Montane Forest",
    temperatureRange: [0, 18],       // mixed conifer / Appalachian analogue
    precipitationRange: [0.35, 0.65],
    drainageRange: [0.25, 0.60],
    lightRange: [0.35, 0.70],
    altitudeRange: [0.45, 0.85],
    seasonalityRange: [0.35, 0.80],
    textureColor: "#4E7A45",
  },
  {
    id: 37,
    name: "Montane Rainforest",
    temperatureRange: [0, 18],
    precipitationRange: [0.60, 1.0],
    drainageRange: [0.15, 0.50],
    lightRange: [0.30, 0.65],
    altitudeRange: [0.45, 0.85],
    seasonalityRange: [0.35, 0.80],
    textureColor: "#2E6040",
  },

  // --- Montane stubs: warm zone (altitude > 0.40, temp 18–35 °C) ---

  {
    id: 38,
    name: "Tropical Alpine Desert",
    temperatureRange: [10, 30],      // dry flanks of tropical volcanoes / elevated plateaus
    precipitationRange: [0, 0.15],
    drainageRange: [0.55, 0.90],
    lightRange: [0.55, 0.95],
    altitudeRange: [0.45, 0.80],
    seasonalityRange: [0.20, 0.65],
    textureColor: "#C8A060",
  },
  {
    id: 39,
    name: "Montane Dry Scrub",
    temperatureRange: [10, 30],      // Ethiopian highlands / Andean matorral analogue
    precipitationRange: [0.15, 0.35],
    drainageRange: [0.40, 0.75],
    lightRange: [0.50, 0.90],
    altitudeRange: [0.45, 0.80],
    seasonalityRange: [0.25, 0.70],
    textureColor: "#9B8B4A",
  },
  {
    id: 40,
    name: "Subtropical Montane Forest",
    temperatureRange: [10, 28],      // East African / Central American highland pine-oak
    precipitationRange: [0.35, 0.60],
    drainageRange: [0.20, 0.55],
    lightRange: [0.45, 0.85],
    altitudeRange: [0.45, 0.75],
    seasonalityRange: [0.20, 0.65],
    textureColor: "#4A7A35",
  },

  // --- Montane stubs: hot zone (altitude > 0.40, temp > 35 °C) ---

  {
    id: 41,
    name: "Highland Desert",
    temperatureRange: [25, 45],      // Saharan highlands / Ethiopian lowland plateau margins
    precipitationRange: [0, 0.10],
    drainageRange: [0.65, 0.95],
    lightRange: [0.70, 1],
    altitudeRange: [0.45, 0.75],
    seasonalityRange: [0.15, 0.55],
    textureColor: "#D4B87A",
  },
  {
    id: 42,
    name: "Montane Thorn Scrub",
    temperatureRange: [25, 45],
    precipitationRange: [0.15, 0.35],
    drainageRange: [0.45, 0.80],
    lightRange: [0.65, 1],
    altitudeRange: [0.45, 0.75],
    seasonalityRange: [0.30, 0.75],
    textureColor: "#A89040",
  },
  {
    id: 43,
    name: "Afromontane Forest",
    temperatureRange: [20, 40],      // East African highland forests
    precipitationRange: [0.35, 0.65],
    drainageRange: [0.25, 0.60],
    lightRange: [0.55, 0.95],
    altitudeRange: [0.45, 0.75],
    seasonalityRange: [0.20, 0.65],
    textureColor: "#3A6E35",
  },
  {
    id: 44,
    name: "Montane Tropical Forest",
    temperatureRange: [20, 40],
    precipitationRange: [0.60, 1.0],
    drainageRange: [0.10, 0.40],
    lightRange: [0.50, 0.90],
    altitudeRange: [0.45, 0.75],
    seasonalityRange: [0.15, 0.60],
    textureColor: "#1E5A30",
  },
];

export const biomes: Biome[] = rawBiomes.map(withDist);
