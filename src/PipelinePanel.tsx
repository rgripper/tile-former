import type { PipelineConfig } from "@tile-former/tilegen";
import { Fragment } from "react";

type SliderParam = {
  key: "borderBlendWidth" | "localNoiseScale" | "tilesPerPatch";
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
};

const sliderParams: SliderParam[] = [
  {
    key: "borderBlendWidth",
    label: "Blend",
    min: 0,
    max: 8,
    step: 1,
    format: (v) => String(v),
  },
  {
    key: "localNoiseScale",
    label: "L.noise",
    min: 0.03,
    max: 0.5,
    step: 0.01,
    format: (v) => v.toFixed(2),
  },
  {
    key: "tilesPerPatch",
    label: "t/patch",
    min: 2,
    max: 16,
    step: 1,
    format: (v) => String(v),
  },
];

export function PipelinePanel({
  config,
  onChange,
  showLargeVoronoi,
  showSmallVoronoi,
  showVoronoiFeatures,
  onToggleLargeVoronoi,
  onToggleSmallVoronoi,
  onToggleVoronoiFeatures,
  voronoiM1,
  voronoiM2,
  onChangeVoronoiM1,
  onChangeVoronoiM2,
}: {
  config: PipelineConfig;
  onChange: (key: keyof PipelineConfig, value: number | string) => void;
  showLargeVoronoi: boolean;
  showSmallVoronoi: boolean;
  showVoronoiFeatures: boolean;
  onToggleLargeVoronoi: (v: boolean) => void;
  onToggleSmallVoronoi: (v: boolean) => void;
  onToggleVoronoiFeatures: (v: boolean) => void;
  voronoiM1: number;
  voronoiM2: number;
  onChangeVoronoiM1: (v: number) => void;
  onChangeVoronoiM2: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 text-xs font-mono">
      <div
        className="grid gap-x-2 gap-y-1 items-center"
        style={{ gridTemplateColumns: "4rem 1fr 3rem" }}
      >
        <div className="text-gray-400 text-right">param</div>
        <div className="text-gray-400 text-center">value</div>
        <div />

        {sliderParams.map(({ key, label, min, max, step, format }) => (
          <Fragment key={key}>
            <div className="text-right text-gray-300">{label}</div>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={config[key] as number}
              onChange={(e) => onChange(key, parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="text-center text-gray-200 tabular-nums">
              {format(config[key] as number)}
            </div>
          </Fragment>
        ))}

        <div className="text-right text-gray-300">seed</div>
        <input
          type="text"
          value={config.seed}
          onChange={(e) => onChange("seed", e.target.value)}
          className="col-span-2 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-gray-200 text-xs font-mono"
        />
      </div>

      <div className="border-t border-gray-700 pt-1 flex flex-col gap-0.5">
        <div className="text-gray-400 mb-0.5">voronoi</div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showLargeVoronoi}
            onChange={(e) => onToggleLargeVoronoi(e.target.checked)}
            className="accent-blue-400"
          />
          <span className="text-gray-300">large (N=10)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showSmallVoronoi}
            onChange={(e) => onToggleSmallVoronoi(e.target.checked)}
            className="accent-blue-400"
          />
          <span className="text-gray-300">small (sub-tile)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showVoronoiFeatures}
            onChange={(e) => onToggleVoronoiFeatures(e.target.checked)}
            className="accent-blue-400"
          />
          <span className="text-gray-300">features</span>
        </label>

        <div className="mt-1 grid gap-x-2 gap-y-0.5 items-center" style={{ gridTemplateColumns: "2rem 1fr 2rem" }}>
          <div className="text-gray-500 text-right">M1</div>
          <input
            type="range" min={0} max={5} step={1}
            value={voronoiM1}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              onChangeVoronoiM1(v);
              if (v > voronoiM2) onChangeVoronoiM2(v);
            }}
            className="w-full"
          />
          <div className="text-center text-gray-200 tabular-nums">{voronoiM1}</div>

          <div className="text-gray-500 text-right">M2</div>
          <input
            type="range" min={0} max={10} step={1}
            value={voronoiM2}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              onChangeVoronoiM2(v);
              if (v < voronoiM1) onChangeVoronoiM1(v);
            }}
            className="w-full"
          />
          <div className="text-center text-gray-200 tabular-nums">{voronoiM2}</div>
        </div>
      </div>
    </div>
  );
}
