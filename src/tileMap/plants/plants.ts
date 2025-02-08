import plantsJson from "./plants.json"; // with { type: 'application/json'};
import { biomes, scaleRange } from "../biomes";

export const plants = plantsJson.map((x) => ({
  ...x,
  lightRange: scaleRange(x.lightRange as [number, number]),
  moistureRange: scaleRange(x.moistureRange as [number, number]),
  temperatureRange: scaleRange(x.temperatureRange as [number, number]),
  biomeId: biomes.find((b) => b.name === x.biome)!.id,
}));
