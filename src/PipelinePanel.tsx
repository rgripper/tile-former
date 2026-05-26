import type { PipelineConfig } from "./tileGenerator/pipeline";

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
}: {
  config: PipelineConfig;
  onChange: (key: keyof PipelineConfig, value: number | string) => void;
}) {
  return (
    <div className="flex flex-col gap-1 text-xs font-mono">
      <div
        className="grid gap-x-2 gap-y-1 items-center"
        style={{ gridTemplateColumns: "4rem 1fr 3rem" }}
      >
        <div className="text-gray-400 text-right">param</div>
        <div className="text-gray-400 text-center">value</div>
        <div />

        {sliderParams.map(({ key, label, min, max, step, format }) => (
          <>
            <div key={key + "-label"} className="text-right text-gray-300">
              {label}
            </div>
            <input
              key={key + "-slider"}
              type="range"
              min={min}
              max={max}
              step={step}
              value={config[key] as number}
              onChange={(e) => onChange(key, parseFloat(e.target.value))}
              className="w-full"
            />
            <div
              key={key + "-val"}
              className="text-center text-gray-200 tabular-nums"
            >
              {format(config[key] as number)}
            </div>
          </>
        ))}

        <div className="text-right text-gray-300">seed</div>
        <input
          type="text"
          value={config.seed}
          onChange={(e) => onChange("seed", e.target.value)}
          className="col-span-2 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-gray-200 text-xs font-mono"
        />
      </div>
    </div>
  );
}
