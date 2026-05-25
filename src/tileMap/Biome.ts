export type AxisDist = { mean: number; stddev: number };

export type BiomeParamDist = {
  temperature:   AxisDist;
  precipitation: AxisDist;
  drainage:      AxisDist;
  light:         AxisDist;
  altitude:      AxisDist;
  seasonality:   AxisDist;
};

export interface Biome {
  name: string;
  id: number;
  textureColor: string;
  temperatureRange:   [number, number];
  precipitationRange: [number, number];
  drainageRange:      [number, number];
  lightRange:         [number, number];
  altitudeRange:      [number, number];
  seasonalityRange:   [number, number];
  // Sampling distributions for tile parameter generation (Stage 4 → pipeline).
  // mean = midpoint of the range; stddev keeps ~99.7% of samples within the range.
  paramDist: BiomeParamDist;
}
