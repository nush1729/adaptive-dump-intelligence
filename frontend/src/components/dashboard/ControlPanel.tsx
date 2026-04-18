"use client";
import React from "react";
import { useSimStore } from "@/store/simStore";

const FLEET_COLORS: Record<string, string> = {
  Cat777: "#FFD700",
  Cat793: "#FF8C00",
  Cat797: "#FF4500",
  Generic50: "#00CED1",
  Generic200: "#9400D3",
};

const FLEET_LABELS: Record<string, string> = {
  Cat777: "Cat 777 · 100t",
  Cat793: "Cat 793 · 240t",
  Cat797: "Cat 797 · 400t",
  Generic50: "Generic · 50t",
  Generic200: "Generic · 200t",
};

interface ControlPanelProps {
  onRun: () => void;
  onTune: () => void;
  isTuning: boolean;
}

function RangeField({
  id, label, min, max, step = 0.01, value, onChange, decimals = 2,
}: {
  id: string; label: string; min: number; max: number;
  step?: number; value: number; onChange: (v: number) => void; decimals?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="kpi-label">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="range" id={id} min={min} max={max} step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1 h-1 rounded accent-[#C8FF00] cursor-pointer"
          style={{ accentColor: "var(--acid)" }}
        />
        <span className="text-acid font-mono text-xs min-w-[36px] text-right">
          {value.toFixed(decimals)}
        </span>
      </div>
    </div>
  );
}

export default function ControlPanel({ onRun, onTune, isTuning }: ControlPanelProps) {
  const {
    material, nDumps, isoThreshold, seed, selectedFleet, weights,
    useML, isRunning,
    setMaterial, setNDumps, setIsoThreshold, setSeed, toggleFleet,
    setWeight, setUseML,
  } = useSimStore();

  return (
    <aside className="flex flex-col gap-4 overflow-y-auto p-4 h-full"
      style={{ background: "var(--surface)", borderRight: "1px solid var(--border)" }}>

      {/* Header */}
      <div>
        <div style={{ fontFamily: "Syncopate", fontSize: "0.55rem", letterSpacing: "0.3em",
          color: "var(--muted)", textTransform: "uppercase", marginBottom: 2 }}>
          ADIOS v3
        </div>
        <div style={{ fontFamily: "Syncopate", fontSize: "1.1rem", letterSpacing: "0.15em",
          color: "var(--acid)" }}>
          CONTROL
        </div>
      </div>

      {/* Simulation section */}
      <div className="section-label">Simulation</div>

      <div className="flex flex-col gap-1">
        <label className="kpi-label">Material</label>
        <select
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
          style={{ background: "var(--panel)", border: "1px solid var(--border)",
            color: "var(--text)", padding: "6px 8px", borderRadius: 3,
            fontFamily: "JetBrains Mono", fontSize: "0.75rem" }}
        >
          <option value="default">Default</option>
          <option value="rock">Rock (40°)</option>
          <option value="ore">Ore (37°)</option>
          <option value="overburden">Overburden (35°)</option>
        </select>
      </div>

      <RangeField id="n_dumps" label="Dump Count" min={10} max={120}
        step={1} value={nDumps} onChange={setNDumps} decimals={0} />

      <RangeField id="iso" label="Isolation Threshold" min={0.5} max={0.99}
        value={isoThreshold} onChange={setIsoThreshold} />

      <div className="flex flex-col gap-1">
        <label className="kpi-label">Polygon Seed</label>
        <input
          type="number" value={seed} min={1} max={9999}
          onChange={(e) => setSeed(parseInt(e.target.value) || 42)}
          style={{ background: "var(--panel)", border: "1px solid var(--border)",
            color: "var(--text)", padding: "6px 8px", borderRadius: 3,
            fontFamily: "JetBrains Mono", fontSize: "0.75rem", width: "100%" }}
        />
      </div>

      {/* ML Toggle */}
      <div className="flex items-center justify-between py-1">
        <label className="kpi-label">Use PPO Policy (ML)</label>
        <button
          onClick={() => setUseML(!useML)}
          style={{
            padding: "3px 10px", borderRadius: 3, fontSize: "0.65rem",
            fontFamily: "JetBrains Mono", cursor: "pointer", transition: "all 0.15s",
            background: useML ? "rgba(200,255,0,0.15)" : "var(--panel)",
            border: `1px solid ${useML ? "var(--acid)" : "var(--border)"}`,
            color: useML ? "var(--acid)" : "var(--text2)",
          }}
        >
          {useML ? "ON" : "OFF"}
        </button>
      </div>

      {/* Fleet section */}
      <div className="section-label">Fleet</div>
      <div className="flex flex-wrap gap-2">
        {Object.keys(FLEET_COLORS).map((model) => {
          const active = selectedFleet.includes(model);
          return (
            <button key={model} onClick={() => toggleFleet(model)}
              style={{
                padding: "3px 10px", borderRadius: 3, fontSize: "0.62rem",
                fontFamily: "JetBrains Mono", cursor: "pointer", transition: "all 0.15s",
                background: active ? `${FLEET_COLORS[model]}18` : "var(--panel)",
                border: `1px solid ${active ? FLEET_COLORS[model] : "var(--border)"}`,
                color: active ? FLEET_COLORS[model] : "var(--text2)",
              }}>
              {FLEET_LABELS[model]}
            </button>
          );
        })}
      </div>

      {/* Weights section */}
      <div className="section-label">Scoring Weights</div>
      <div className="grid grid-cols-2 gap-3">
        <RangeField id="w1" label="w1 · Fill" min={0.5} max={3} value={weights.w1}
          onChange={(v) => setWeight("w1", v)} />
        <RangeField id="w2" label="w2 · Congestion" min={0.1} max={2} value={weights.w2}
          onChange={(v) => setWeight("w2", v)} />
        <RangeField id="w3" label="w3 · Isolation" min={1} max={5} step={0.1} value={weights.w3}
          onChange={(v) => setWeight("w3", v)} />
        <RangeField id="w4" label="w4 · Distance" min={0.05} max={0.5} value={weights.w4}
          onChange={(v) => setWeight("w4", v)} />
      </div>

      <button className="btn-secondary" onClick={onTune} disabled={isTuning || isRunning}>
        {isTuning ? "Tuning…" : "⚙ Auto-Tune"}
      </button>

      {/* Run button */}
      <div className="mt-auto pt-2">
        <button className="btn-primary" onClick={onRun} disabled={isRunning}>
          {isRunning ? "RUNNING…" : "▶ EXECUTE"}
        </button>
      </div>
    </aside>
  );
}
