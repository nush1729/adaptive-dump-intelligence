"use client";
import React from "react";
import { useSimStore } from "@/store/simStore";
import { STOCK_PAYLOADS_T } from "@/lib/config";

// Truck classes shown for fleet composition — matches backend TRUCK_PROFILES
// (config.py) so every count maps to a real, kinematically-distinct profile.
const FLEET_CLASSES = ["Cat793", "Cat777", "Cat797"] as const;
const FLEET_COLORS: Record<string, string> = {
  Cat777: "#FFD700", Cat793: "#FF8C00", Cat797: "#FF4500",
};
const FLEET_LABELS: Record<string, string> = {
  Cat777: "Cat 777 · 100t · r=11m", Cat793: "Cat 793 · 240t · r=15m", Cat797: "Cat 797 · 400t · r=18m",
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
    material, nDumps, isoThreshold, seed, selectedFleet, fleetCounts,
    payloadOverrides, minDumpSpacing, weights,
    useML, zoneMode, isRunning,
    setMaterial, setNDumps, setIsoThreshold, setSeed, setFleetCount,
    setPayloadOverride, setMinDumpSpacing,
    setWeight, setUseML, setZoneMode,
  } = useSimStore();

  return (
    <div style={{ display: "flex", flexDirection: "column", background: "var(--surface)", color: "var(--text)", padding: "14px 14px 56px", gap: 16 }}>

      {/* ── EXECUTE button — top of the panel ── */}
      <div>
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

      {/* ── Configuration body ── */}
      <div className="flex flex-col gap-4">

        {/* Simulation */}
        <div>
          <SectionLabel>Simulation</SectionLabel>
          <div className="flex flex-col gap-1 mb-3">
            <label className="font-mono text-[0.68rem] tracking-widest uppercase" style={{ color: "var(--muted)" }}>Material</label>
            <select value={material} onChange={(e) => setMaterial(e.target.value)}
              className="p-1.5 rounded text-sm font-mono w-full focus:outline-none"
              style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}>
              <option value="default">Default (38°)</option>
              <option value="rock">Rock (40°)</option>
              <option value="ore">Ore (37°)</option>
              <option value="overburden">Overburden (35°)</option>
              <option value="coal">Coal (34°)</option>
              <option value="waste">Waste (35°)</option>
            </select>
          </div>
          <div className="flex flex-col gap-3">
            <RangeField id="n_dumps" label="Dump Count" min={10} max={120} step={1} value={nDumps} onChange={setNDumps} decimals={0} />
            <RangeField id="iso" label="Iso Threshold" min={0.5} max={0.99} value={isoThreshold} onChange={setIsoThreshold} />
            <RangeField id="min_spacing" label="Min Dump Spacing" min={0.5} max={10} step={0.5} value={minDumpSpacing} onChange={setMinDumpSpacing} decimals={1} />
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
          {/* Zone Mode Toggle */}
          <div className="flex items-center justify-between mt-2">
            <span className="font-mono text-[0.68rem] tracking-widest uppercase" style={{ color: "var(--muted)" }}
              title="Geofenced dispatch — each truck class is hard-restricted to a predefined active face, mirroring real AHS (Cat MineStar / Komatsu FrontRunner) behaviour, instead of ADIOS's free-form per-cell optimisation">
              Zone Mode (Geofenced)
            </span>
            <button onClick={() => setZoneMode(!zoneMode)}
              className="px-3 py-1 rounded text-[0.78rem] font-mono transition-all border"
              style={{
                background: zoneMode ? "rgba(255,205,17,0.1)" : "var(--panel)",
                border: `1px solid ${zoneMode ? "var(--acid)" : "var(--border)"}`,
                color: zoneMode ? "var(--acid)" : "var(--muted)",
              }}>
              {zoneMode ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        {/* Fleet */}
        <div>
          <SectionLabel>Fleet Composition</SectionLabel>
          <div className="flex flex-col gap-2">
            {FLEET_CLASSES.map((model) => {
              const count = fleetCounts[model] ?? 0;
              const stock = STOCK_PAYLOADS_T[model];
              const override = payloadOverrides[model];
              return (
                <div key={model} className="flex flex-col gap-1.5 px-2.5 py-1.5 rounded border"
                  style={{
                    background: count > 0 ? "rgba(255,205,17,0.06)" : "var(--panel)",
                    border: `1px solid ${count > 0 ? "rgba(255,205,17,0.25)" : "var(--border)"}`,
                  }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[0.68rem] font-mono"
                      style={{ color: count > 0 ? "var(--text)" : "var(--muted)" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: FLEET_COLORS[model], display: "inline-block" }} />
                      {FLEET_LABELS[model]}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <button onClick={() => setFleetCount(model, count - 1)} disabled={isRunning || count <= 0}
                        className="w-6 h-6 rounded font-mono text-[0.8rem] leading-none border transition-all"
                        style={{ border: "1px solid var(--border)", color: "var(--muted)", cursor: isRunning || count <= 0 ? "not-allowed" : "pointer" }}>
                        −
                      </button>
                      <span className="font-mono text-[0.78rem] font-bold tabular-nums" style={{ color: "var(--acid)", minWidth: 18, textAlign: "center" }}>
                        {count}
                      </span>
                      <button onClick={() => setFleetCount(model, count + 1)} disabled={isRunning || count >= 12}
                        className="w-6 h-6 rounded font-mono text-[0.8rem] leading-none border transition-all"
                        style={{ border: "1px solid var(--border)", color: "var(--muted)", cursor: isRunning || count >= 12 ? "not-allowed" : "pointer" }}>
                        +
                      </button>
                    </span>
                  </div>
                  {count > 0 && (
                    <div className="flex items-center justify-between gap-2 pl-3.5">
                      <span className="text-[0.6rem] font-mono uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                        Payload override
                      </span>
                      <span className="flex items-center gap-1">
                        <input type="number" min={10} max={600} step={1}
                          value={override ?? ""}
                          placeholder={`${stock}t`}
                          disabled={isRunning}
                          onChange={(e) => setPayloadOverride(model, e.target.value === "" ? null : parseFloat(e.target.value))}
                          className="text-right font-mono text-[0.7rem] rounded px-1.5 py-0.5 focus:outline-none"
                          style={{
                            width: 56, background: "var(--panel)",
                            border: `1px solid ${override != null ? "var(--acid)" : "var(--border)"}`,
                            color: override != null ? "var(--acid)" : "var(--text2)",
                          }} />
                        <span className="text-[0.6rem] font-mono" style={{ color: "var(--muted)" }}>t</span>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-[0.62rem] font-mono" style={{ color: "var(--muted)" }}>
            Total fleet: <span style={{ color: "var(--acid)" }}>{selectedFleet.length}</span> truck{selectedFleet.length === 1 ? "" : "s"} dispatched in rotation
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
