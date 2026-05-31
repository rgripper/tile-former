import {
  biomeCascade,
  ALTITUDE_MONTANE_THRESHOLD,
  type TemperatureZoneLabel,
} from "../tileMap/biomeVariants";

export function getTemperatureZone(temp: number): TemperatureZoneLabel {
  if (temp >= 35) return "hot";
  if (temp >= 18) return "warm";
  if (temp >= 5) return "temperate";
  if (temp >= -5) return "cold";
  return "arctic";
}

export function selectBiomeId(
  altitude: number,
  temperature: number,
  precipitation: number,
  drainage: number,
): number {
  const branch =
    altitude > ALTITUDE_MONTANE_THRESHOLD
      ? biomeCascade.montane
      : biomeCascade.lowland;

  let tempNode = branch[0];
  for (const node of branch) {
    if (temperature >= node.tempLowerBound) tempNode = node;
    else break;
  }

  let moistNode = tempNode.moisture[0];
  for (const node of tempNode.moisture) {
    if (precipitation >= node.precipLowerBound) moistNode = node;
    else break;
  }

  let slot = moistNode.slots[0];
  for (const s of moistNode.slots) {
    if (drainage >= s.drainageLowerBound) slot = s;
    else break;
  }

  return slot.biomeId;
}
