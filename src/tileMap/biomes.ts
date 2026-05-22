import { Biome } from "./Biome.ts";

// Dimension scales:
//   temperature  — degrees Celsius, unbounded
//   moisture     — 0: bone dry  →  1: saturated
//   light        — 0: polar/minimal insolation  →  1: equatorial/peak insolation
//   altitude     — 0: sea level  →  1: extreme high mountain
//   seasonality  — 0: stable year-round  →  1: extreme seasonal swing

export const biomes: Biome[] = [
  {
    id: 1,
    name: "Tropical Rainforest",
    temperatureRange: [20, 35],
    moistureRange: [0.65, 1],
    lightRange: [0.5, 1],      // high insolation, near-equatorial
    altitudeRange: [0, 0.3],   // lowland basins
    seasonalityRange: [0, 0.25], // near-constant climate year-round
    textureColor: "#228B22",
  },
  {
    id: 2,
    name: "Tropical Dry Forest",
    temperatureRange: [20, 35],
    moistureRange: [0.35, 0.65],
    lightRange: [0.5, 1],
    altitudeRange: [0, 0.3],
    seasonalityRange: [0.2, 0.55], // distinct wet/dry seasons
    textureColor: "#A0522D",
  },
  {
    id: 3,
    name: "Savanna",
    temperatureRange: [18, 35],
    moistureRange: [0.1, 0.4],
    lightRange: [0.5, 1],
    altitudeRange: [0, 0.4],
    seasonalityRange: [0.3, 0.7],
    textureColor: "#FFD700",
  },
  {
    id: 4,
    name: "Desert",
    temperatureRange: [15, 45],
    moistureRange: [0, 0.15],
    lightRange: [0.65, 1],     // intense, cloudless sun
    altitudeRange: [0, 0.5],
    seasonalityRange: [0, 0.6],
    textureColor: "#EDC9AF",
  },
  {
    id: 5,
    name: "Temperate Forest",
    temperatureRange: [4, 20],
    moistureRange: [0.45, 0.9],
    lightRange: [0.3, 0.7],    // mid-latitude, partial canopy
    altitudeRange: [0, 0.6],
    seasonalityRange: [0.35, 0.8],
    textureColor: "#6B8E23",
  },
  {
    id: 6,
    name: "Grassland",
    temperatureRange: [3, 26],
    moistureRange: [0.1, 0.45],
    lightRange: [0.4, 0.85],   // open, mid-latitude
    altitudeRange: [0, 0.5],
    seasonalityRange: [0.4, 0.85],
    textureColor: "#7CFC00",
  },
  {
    id: 7,
    name: "Mediterranean",
    temperatureRange: [10, 24],
    moistureRange: [0.15, 0.45],
    lightRange: [0.55, 1],     // sunny coasts
    altitudeRange: [0, 0.35],
    seasonalityRange: [0.35, 0.75],
    textureColor: "#FF6347",
  },
  {
    id: 8,
    name: "Taiga (Boreal Forest)",
    temperatureRange: [-15, 5],
    moistureRange: [0.3, 0.65],
    lightRange: [0.1, 0.45],   // high latitude, low sun angle
    altitudeRange: [0, 0.35],
    seasonalityRange: [0.6, 1],
    textureColor: "#4682B4",
  },
  {
    id: 9,
    name: "Tundra",
    temperatureRange: [-20, 4],
    moistureRange: [0.1, 0.5],
    lightRange: [0.05, 0.3],   // polar, minimal insolation
    altitudeRange: [0, 0.3],
    seasonalityRange: [0.65, 1],
    textureColor: "#B0E0E6",
  },
  {
    id: 10,
    name: "Alpine",
    temperatureRange: [-20, 8],
    moistureRange: [0.25, 0.65],
    lightRange: [0.5, 1],      // above cloud layer, intense UV
    altitudeRange: [0.45, 1],
    seasonalityRange: [0.5, 1],
    textureColor: "#ADD8E6",
  },
];

export function scaleRange(
  range: [number, number],
  min: number = 1,
  max: number = 4
): [number, number] {
  return range.map((x) => (x - min) / (max - min)) as [number, number];
}
