import { useMemo, useState } from "react";
import type { DesignInput, MaterialId, Ramp } from "../core/types.ts";
import { MATERIAL_IDS } from "../core/types.ts";
import {
  ACCENTS,
  MASTER_RAMPS,
  MATERIAL_STYLES,
  RAMP_IDS,
  getMaterialStyles,
  resolveMaterialRamp,
} from "../core/palette/index.ts";

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

function Swatches({ colors }: { colors: readonly number[] }) {
  return (
    <div className="swatches">
      {colors.map((c, i) => (
        <span key={i} className="swatch" style={{ background: hex(c) }} title={hex(c)} />
      ))}
    </div>
  );
}

function RampRow({ label, ramp, note }: { label: string; ramp: Ramp | readonly number[]; note?: string }) {
  return (
    <div className="pal-row">
      <span className="pal-name">{label}</span>
      <Swatches colors={ramp} />
      {note && <span className="pal-note">{note}</span>}
    </div>
  );
}

// The master palette plus the per-material ramps the current biome actually
// resolves to. This is the validation surface for palette work: because every
// material is a (ramp, shade) pick rather than free hex, a biome's whole
// character is visible here as a short list of deviations from the defaults.
export function PalettePanel({ input }: { input: DesignInput }) {
  const [tab, setTab] = useState<"master" | "materials">("master");
  const styles = useMemo(() => getMaterialStyles(input.biomeId), [input.biomeId]);

  const overridden = MATERIAL_IDS.filter(
    (id) =>
      styles[id].ramp !== MATERIAL_STYLES[id].ramp || styles[id].shade !== MATERIAL_STYLES[id].shade,
  );

  return (
    <div className="panel">
      <h2>Palette</h2>
      <div className="row">
        <div className="segmented">
          <button className={tab === "master" ? "active" : undefined} onClick={() => setTab("master")}>
            master ({RAMP_IDS.length * 4 + Object.keys(ACCENTS).length})
          </button>
          <button
            className={tab === "materials" ? "active" : undefined}
            onClick={() => setTab("materials")}
          >
            materials ({MATERIAL_IDS.length})
          </button>
        </div>
        <span className="legend">
          {overridden.length === 0 ? (
            <span className="chip">no biome overrides</span>
          ) : (
            overridden.map((id) => (
              <span className="chip" key={id}>
                {id} → {styles[id].ramp}
                {styles[id].shade !== 0 ? ` ${styles[id].shade > 0 ? "+" : ""}${styles[id].shade}` : ""}
              </span>
            ))
          )}
        </span>
      </div>

      {tab === "master" ? (
        <div className="pal-grid">
          {RAMP_IDS.map((id) => (
            <RampRow key={id} label={id} ramp={MASTER_RAMPS[id]} />
          ))}
          <RampRow label="accents" ramp={Object.values(ACCENTS)} note={Object.keys(ACCENTS).join(" ")} />
        </div>
      ) : (
        <div className="pal-grid">
          {MATERIAL_IDS.map((id: MaterialId) => {
            const s = styles[id];
            const isOverride = overridden.includes(id);
            return (
              <RampRow
                key={id}
                label={id}
                ramp={resolveMaterialRamp(s)}
                note={`${s.ramp}${s.shade !== 0 ? ` ${s.shade > 0 ? "+" : ""}${s.shade}` : ""}${isOverride ? " ◂ biome" : ""}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
