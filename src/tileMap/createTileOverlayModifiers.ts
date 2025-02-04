import { NoiseFunction2D } from "simplex-noise";
import { Point } from "./generateTileMap";
import { TileProperties } from "./TileProperties";

export type OverlayNoises = [NoiseFunction2D, NoiseFunction2D, NoiseFunction2D];

export type TileOverlayProperties = Pick<
  TileProperties,
  "moisture" | "temperature"
>;

const clamp = (value: number) => Math.max(0, Math.min(1, value));

// the sum of all components should be 1
export function createTileOverlayModifiers({
  temperatureNoise,
  moistureNoise,
}: {
  temperatureNoise: NoiseFunction2D;
  moistureNoise: NoiseFunction2D;
}) {
  const modifiers = {
    temperature: (point: Point, t: number) =>
      t + t * temperatureNoise(point.x, point.y) * 0.01,
    moisture: (point: Point, x: number) =>
      clamp(x + 0.02 * moistureNoise(point.x, point.y)),
  };

  return (point: Point, baseTileProperties: TileProperties) => ({
    temperature: modifiers.temperature(point, baseTileProperties.temperature),
    moisture: modifiers.moisture(point, baseTileProperties.moisture),
  });
}
