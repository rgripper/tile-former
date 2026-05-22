import plantsJson from "./plants.json"; // with { type: 'application/json'};
import { biomes } from "../biomes";

function scaleRange(
  range: [number, number],
  min: number = 1,
  max: number = 4,
): [number, number] {
  return range.map((x) => (x - min) / (max - min)) as [number, number];
}

export const plants = plantsJson.map((x) => ({
  ...x,
  lightRange: scaleRange(x.lightRange as [number, number]),
  moistureRange: scaleRange(x.moistureRange as [number, number]),
  temperatureRange: scaleRange(x.temperatureRange as [number, number]),
  biomeId: biomes.find((b) => b.name === x.biome)!.id,
}));
