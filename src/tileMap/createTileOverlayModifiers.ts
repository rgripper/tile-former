import { NoiseFunction2D } from "simplex-noise";
import { Point } from "./generateTileMap";
import { TileProperties } from "./TileProperties";

export type OverlayNoises = {
  temperature: NoiseFunction2D;
  moisture: NoiseFunction2D;
  light: NoiseFunction2D;
  altitude: NoiseFunction2D;
  seasonality: NoiseFunction2D;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function createTileOverlayModifiers(
  noises: OverlayNoises,
  swing: TileProperties,
) {
  return (point: Point, base: TileProperties): TileProperties => ({
    temperature:
      base.temperature +
      swing.temperature * noises.temperature(point.x, point.y),
    moisture: clamp(
      base.moisture + swing.moisture * noises.moisture(point.x, point.y),
    ),
    light: clamp(base.light + swing.light * noises.light(point.x, point.y)),
    altitude: clamp(
      base.altitude + swing.altitude * noises.altitude(point.x, point.y),
    ),
    seasonality: clamp(
      base.seasonality +
        swing.seasonality * noises.seasonality(point.x, point.y),
    ),
  });
}
