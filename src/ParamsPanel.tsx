import { MapGenParams } from "./tileMap/generateTileMap.ts";
import { TileProperties } from "./tileMap/TileProperties.ts";

export type ParamConfig = {
  key: keyof TileProperties;
  label: string;
  baseMin: number;
  baseMax: number;
  baseStep: number;
  swingMax: number;
  swingStep: number;
  format: (v: number) => string;
};

export const paramConfigs: ParamConfig[] = [
  {
    key: "temperature",
    label: "Temp",
    baseMin: -25,
    baseMax: 45,
    baseStep: 0.5,
    swingMax: 25,
    swingStep: 0.5,
    format: (v) => `${v.toFixed(1)}°`,
  },
  {
    key: "precipitation",
    label: "Precip",
    baseMin: 0,
    baseMax: 1,
    baseStep: 0.01,
    swingMax: 0.5,
    swingStep: 0.01,
    format: (v) => v.toFixed(2),
  },
  {
    key: "drainage",
    label: "Drainage",
    baseMin: 0,
    baseMax: 1,
    baseStep: 0.01,
    swingMax: 0.5,
    swingStep: 0.01,
    format: (v) => v.toFixed(2),
  },
  {
    key: "light",
    label: "Light",
    baseMin: 0,
    baseMax: 1,
    baseStep: 0.01,
    swingMax: 0.5,
    swingStep: 0.01,
    format: (v) => v.toFixed(2),
  },
  {
    key: "altitude",
    label: "Altitude",
    baseMin: 0,
    baseMax: 1,
    baseStep: 0.01,
    swingMax: 0.5,
    swingStep: 0.01,
    format: (v) => v.toFixed(2),
  },
  {
    key: "seasonality",
    label: "Season",
    baseMin: 0,
    baseMax: 1,
    baseStep: 0.01,
    swingMax: 0.5,
    swingStep: 0.01,
    format: (v) => v.toFixed(2),
  },
];

export function ParamsPanel({
  params,
  onBaseChange,
  onSwingChange,
}: {
  params: MapGenParams;
  onBaseChange: (key: keyof TileProperties, value: number) => void;
  onSwingChange: (key: keyof TileProperties, value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1 text-xs font-mono">
      <div className="grid gap-x-2 gap-y-1 items-center" style={{ gridTemplateColumns: "4rem 1fr 3rem 1fr 3rem" }}>
        <div className="text-gray-400 text-right">param</div>
        <div className="text-gray-400 text-center">base</div>
        <div />
        <div className="text-gray-400 text-center">swing</div>
        <div />
        {paramConfigs.map(({ key, label, baseMin, baseMax, baseStep, swingMax, swingStep, format }) => (
          <>
            <div key={key + "-label"} className="text-right text-gray-300">{label}</div>
            <input
              key={key + "-base"}
              type="range"
              min={baseMin}
              max={baseMax}
              step={baseStep}
              value={params.base[key]}
              onChange={(e) => onBaseChange(key, parseFloat(e.target.value))}
              className="w-full"
            />
            <div key={key + "-base-val"} className="text-center text-gray-200 tabular-nums">
              {format(params.base[key])}
            </div>
            <input
              key={key + "-swing"}
              type="range"
              min={0}
              max={swingMax}
              step={swingStep}
              value={params.swing[key]}
              onChange={(e) => onSwingChange(key, parseFloat(e.target.value))}
              className="w-full accent-yellow-400"
            />
            <div key={key + "-swing-val"} className="text-center text-yellow-300 tabular-nums">
              ±{format(params.swing[key])}
            </div>
          </>
        ))}
      </div>
    </div>
  );
}
