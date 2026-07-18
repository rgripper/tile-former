import { ALL_ROCK_TYPE_IDS, biomes } from "@tile-former/tilegen";
import type { RockTypeId } from "@tile-former/tilegen";
import type { DesignInput, RenderStyle } from "../core/types.ts";
import { biomeToInput } from "../core/biomeInput.ts";

// Boolean-valued RenderStyle keys only (excludes the numeric `grain`), so the
// checkbox binding below is type-safe without a runtime filter.
type BoolRenderKey = { [K in keyof RenderStyle]: RenderStyle[K] extends boolean ? K : never }[keyof RenderStyle];

const RENDER_TOGGLES: Array<{ key: BoolRenderKey; label: string }> = [
  { key: "tileVariation", label: "per-tile tone variation" },
  { key: "crispEdges", label: "crisp material edges" },
  { key: "isolatedPatches", label: "isolated non-primary patches" },
];

type NumericKey =
  | "temperature"
  | "effectiveMoisture"
  | "drainage"
  | "groundLight"
  | "altitude"
  | "fertility"
  | "riparian"
  | "forestDensity";

const SLIDERS: Array<{ key: NumericKey; label: string; min: number; max: number; step: number }> = [
  { key: "temperature", label: "temperature °C", min: -50, max: 55, step: 1 },
  { key: "effectiveMoisture", label: "moisture", min: 0, max: 1, step: 0.01 },
  { key: "drainage", label: "drainage", min: 0, max: 1, step: 0.01 },
  { key: "groundLight", label: "ground light", min: 0, max: 1, step: 0.01 },
  { key: "altitude", label: "altitude", min: 0, max: 1, step: 0.01 },
  { key: "fertility", label: "fertility", min: 0, max: 1, step: 0.01 },
  { key: "riparian", label: "riparian", min: 0, max: 1, step: 0.01 },
  { key: "forestDensity", label: "forest density", min: 0, max: 1, step: 0.01 },
];

export function PropertyPanel({
  input,
  seed,
  render,
  onChange,
  onSeed,
  onRender,
}: {
  input: DesignInput;
  seed: number;
  render: RenderStyle;
  onChange: (next: DesignInput) => void;
  onSeed: (seed: number) => void;
  onRender: (next: RenderStyle) => void;
}) {
  return (
    <div className="panel">
      <h2>Tile properties</h2>

      <div className="field">
        <label>biome preset</label>
        <select
          value={input.biomeId ?? ""}
          onChange={(e) => {
            const id = e.target.value === "" ? null : Number(e.target.value);
            const biome = biomes.find((b) => b.id === id);
            onChange(biome ? biomeToInput(biome) : { ...input, biomeId: null });
          }}
        >
          <option value="">— custom —</option>
          {biomes.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {SLIDERS.map((s) => (
        <div className="field" key={s.key}>
          <label>{s.label}</label>
          <input
            type="range"
            min={s.min}
            max={s.max}
            step={s.step}
            value={input[s.key]}
            onChange={(e) =>
              // Manual slider edits detach from the preset's palette overrides
              // only implicitly — biomeId is kept so palette stays; that's the
              // "tweak around a biome" workflow.
              onChange({ ...input, [s.key]: Number(e.target.value) })
            }
          />
          <span className="value">{Number(input[s.key]).toFixed(s.step >= 1 ? 0 : 2)}</span>
        </div>
      ))}

      <div className="field">
        <label>rock type</label>
        <select
          value={input.rockType}
          onChange={(e) => onChange({ ...input, rockType: e.target.value as RockTypeId })}
        >
          {ALL_ROCK_TYPE_IDS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </div>

      <div className="row">
        <label>
          <input
            type="checkbox"
            checked={input.water}
            onChange={(e) => onChange({ ...input, water: e.target.checked })}
          />{" "}
          water
        </label>
      </div>

      <h2>Render style</h2>
      <div className="field">
        <label>grain (noise brush size, px)</label>
        <input
          type="range"
          min={1}
          max={4}
          step={1}
          value={render.grain}
          onChange={(e) => onRender({ ...render, grain: Number(e.target.value) })}
        />
        <span className="value">{render.grain}</span>
      </div>
      {RENDER_TOGGLES.map((t) => (
        <div className="row" key={t.key}>
          <label>
            <input
              type="checkbox"
              checked={render[t.key]}
              onChange={(e) => onRender({ ...render, [t.key]: e.target.checked })}
            />{" "}
            {t.label}
          </label>
        </div>
      ))}

      <div className="row">
        <label>seed</label>
        <input
          type="number"
          value={seed}
          style={{ width: 110 }}
          onChange={(e) => onSeed(Number(e.target.value))}
        />
        <button onClick={() => onSeed(Math.floor(Math.random() * 0xffffffff))}>reroll</button>
      </div>
    </div>
  );
}
