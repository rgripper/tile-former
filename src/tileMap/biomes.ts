import { Biome } from "./Biome.ts";

// Dimension scales:
//   temperature   — degrees Celsius, unbounded
//   precipitation — 0: hyperarid (<50mm/yr)  →  1: extremely wet (>4000mm/yr)
//   drainage      — 0: impermeable (permafrost/dense clay)  →  1: free-draining (gravel/bare rock)
//   light         — 0: polar/minimal insolation  →  1: equatorial/peak insolation
//   altitude      — 0: sea level  →  1: extreme high mountain
//   seasonality   — 0: stable year-round  →  1: extreme seasonal swing

export const biomes: Biome[] = [
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
];
