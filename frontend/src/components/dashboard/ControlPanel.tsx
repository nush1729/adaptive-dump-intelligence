"use client";
import React from "react";
import { useSimStore } from "@/store/simStore";

const FLEET_COLORS: Record<string, string> = {
  Cat777: "#FFD700", Cat793: "#FF8C00", Cat797: "#FF4500",
  Generic50: "#00CED1", Generic200: "#9400D3",
};
const FLEET_LABELS: Record<string, string> = {
  Cat777: "Cat 777 · 100t", Cat793: "Cat 793 · 240t", Cat797: "Cat 797 · 400t",
  Generic50: "Generic · 50t", Generic200: "Generic · 200t",
};

interface ControlPanelProps {
  onRun: () => void;
  onTune: () => void;
  isTuning: boolean;
}

function RangeField({ id, label, min, max, step = 0.01, value, onChange, decimals = 2 }: {
  id: string; label: string; min: number; max: number;
  step?: number; value: number; onChange: (v: number) => void; decimals?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <label htmlFor={id} className="font-mono text-[0.68rem] tracking-widest uppercase" style={{ color: "var(--muted)" }}>
          {label}
        </label>
        <span className="font-mono text-[0.8rem] font-bold tabular-nums px-2 py-0.5 rounded" style={{ color: "var(--acid)", background: "var(--panel)", border: "1px solid var(--border)", minWidth: 44, textAlign: "right" }}>
          {value.toFixed(decimals)}
        </span>
      </div>
      <input type="range" id={id} min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full cursor-pointer" style={{ accentColor: "var(--acid)" }} />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-syncopate text-[0.6rem] tracking-[0.22em] uppercase border-b pb-1 mb-3"
      style={{ color: "var(--muted)", borderColor: "var(--border)" }}>
      {children}
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
    <div className="flex flex-col h-full" style={{ background: "var(--surface)", color: "var(--text)" }}>

      {/* ── EXECUTE button — pinned at top, always visible ── */}
      <div className="shrink-0 px-3 pt-3 pb-2">
        <button
          onClick={onRun}
          disabled={isRunning}
          style={{
            width: "100%", padding: "14px 0",
            background: isRunning ? "transparent" : "var(--acid)",
            color: isRunning ? "var(--acid)" : "#000",
            border: isRunning ? "2px solid var(--acid)" : "none",
            cursor: isRunning ? "not-allowed" : "pointer",
            fontFamily: "'Syncopate', sans-serif", fontWeight: 700,
            fontSize: "0.85rem", letterSpacing: "0.26em", textTransform: "uppercase",
            borderRadius: 3,
            boxShadow: isRunning ? "none" : "0 0 24px rgba(255,205,17,0.45), 0 0 60px rgba(255,205,17,0.15)",
            transition: "all 0.25s",
            position: "relative", overflow: "hidden",
          }}
          onMouseEnter={(e) => { if (!isRunning) e.currentTarget.style.boxShadow = "0 0 44px rgba(255,205,17,0.7), 0 0 90px rgba(255,205,17,0.3)"; }}
          onMouseLeave={(e) => { if (!isRunning) e.currentTarget.style.boxShadow = "0 0 24px rgba(255,205,17,0.45), 0 0 60px rgba(255,205,17,0.15)"; }}
        >
          {isRunning ? "● RUNNING…" : "▶ EXECUTE SIMULATION"}
        </button>
      </div>

      {/* ── Scrollable configuration body ── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 pb-4 flex flex-col gap-4">

        {/* Simulation */}
        <div>
          <SectionLabel>Simulation</SectionLabel>
          <div className="flex flex-col gap-1 mb-3">
            <label className="font-mono text-[0.68rem] tracking-widest uppercase" style={{ color: "var(--muted)" }}>Material</label>
            <select value={material} onChange={(e) => setMaterial(e.target.value)}
              className="p-1.5 rounded text-sm font-mono w-full focus:outline-none"
              style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}>
              <option value="default">Default</option>
              <option value="rock">Rock (40°)</option>
              <option value="ore">Ore (37°)</option>
              <option value="overburden">Overburden (35°)</option>
            </select>
          </div>
          <div className="flex flex-col gap-3">
            <RangeField id="n_dumps" label="Dump Count" min={10} max={120} step={1} value={nDumps} onChange={setNDumps} decimals={0} />
            <RangeField id="iso" label="Iso Threshold" min={0.5} max={0.99} value={isoThreshold} onChange={setIsoThreshold} />
          </div>
          <div className="flex flex-col gap-1 mt-3">
            <label className="font-mono text-[0.68rem] tracking-widest uppercase" style={{ color: "var(--muted)" }}>Polygon Seed</label>
            <input type="number" value={seed} min={1} max={9999}
              onChange={(e) => setSeed(parseInt(e.target.value) || 42)}
              className="p-1.5 rounded text-sm font-mono w-full focus:outline-none"
              style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }} />
          </div>
          {/* ML Toggle */}
          <div className="flex items-center justify-between mt-3">
            <span className="font-mono text-[0.68rem] tracking-widest uppercase" style={{ color: "var(--muted)" }}>ML / Hybrid Policy</span>
            <button onClick={() => setUseML(!useML)}
              className="px-3 py-1 rounded text-[0.78rem] font-mono transition-all border"
              style={{
                background: useML ? "rgba(255,205,17,0.1)" : "var(--panel)",
                border: `1px solid ${useML ? "var(--acid)" : "var(--border)"}`,
                color: useML ? "var(--acid)" : "var(--muted)",
              }}>
              {useML ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        {/* Fleet */}
        <div>
          <SectionLabel>Fleet Selection</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {Object.keys(FLEET_COLORS).map((model) => {
              const active = selectedFleet.includes(model);
              return (
                <button key={model} onClick={() => toggleFleet(model)}
                  className="px-2.5 py-1 rounded text-[0.68rem] font-mono transition-all border"
                  style={{
                    background: active ? "rgba(255,205,17,0.1)" : "var(--panel)",
                    border: `1px solid ${active ? "var(--acid)" : "var(--border)"}`,
                    color: active ? "var(--acid)" : "var(--muted)",
                  }}>
                  {FLEET_LABELS[model]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scoring Weights */}
        <div>
          <SectionLabel>Scoring Weights</SectionLabel>
          <div className="flex flex-col gap-3">
            <RangeField id="w1" label="w1 · Fill" min={0.5} max={3} value={weights.w1} onChange={(v) => setWeight("w1", v)} />
            <RangeField id="w2" label="w2 · Congestion" min={0.1} max={2} value={weights.w2} onChange={(v) => setWeight("w2", v)} />
            <RangeField id="w3" label="w3 · Isolation" min={1} max={5} step={0.1} value={weights.w3} onChange={(v) => setWeight("w3", v)} />
            <RangeField id="w4" label="w4 · Distance" min={0.05} max={0.5} value={weights.w4} onChange={(v) => setWeight("w4", v)} />
          </div>
          <button onClick={onTune} disabled={isTuning || isRunning}
            className="w-full mt-3 py-2 rounded font-syncopate text-[0.72rem] tracking-[0.15em] uppercase transition-all"
            style={{
              background: "transparent",
              border: `1px solid ${isTuning ? "var(--muted)" : "var(--ore)"}`,
              color: isTuning ? "var(--muted)" : "var(--ore)",
              cursor: isTuning || isRunning ? "not-allowed" : "pointer",
            }}>
            {isTuning ? "Tuning…" : "⚙ Auto-Tune Weights"}
          </button>
        </div>
      </div>
    </div>
  );
}
