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

// FIX: Extracted RangeField so label + value sit on ONE line, value never hidden behind label
function RangeField({
  id, label, min, max, step = 0.01, value, onChange, decimals = 2,
}: {
  id: string; label: string; min: number; max: number;
  step?: number; value: number; onChange: (v: number) => void; decimals?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* label row: left = name, right = current value — no overlap */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label htmlFor={id} style={{
          fontFamily: "JetBrains Mono", fontSize: "0.6rem",
          letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text2)",
        }}>
          {label}
        </label>
        <span style={{
          fontFamily: "JetBrains Mono", fontSize: "0.72rem",
          color: "var(--acid)", minWidth: 40, textAlign: "right",
        }}>
          {value.toFixed(decimals)}
        </span>
      </div>
      <input
        type="range" id={id} min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ accentColor: "var(--acid)", width: "100%", cursor: "pointer" }}
      />
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
    // FIX: The aside is a flex-column. The scrollable region is the middle section.
    // The Execute button is pinned at the bottom via a non-shrinking footer div.
    <aside style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "var(--surface)",
      borderRight: "1px solid var(--border)",
      overflow: "hidden",        // outer container never scrolls
    }}>

      {/* ── Scrollable body ── */}
      <div style={{
        flex: 1,
        overflowY: "auto",       // FIX: only this region scrolls
        overflowX: "hidden",
        minHeight: 0,            // FIX: required for flex children to shrink correctly
        padding: "16px 14px 8px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}>

        {/* Header */}
        <div>
          <div style={{ fontFamily: "Syncopate", fontSize: "0.52rem", letterSpacing: "0.3em",
            color: "var(--muted)", textTransform: "uppercase", marginBottom: 2 }}>
            ADIOS v3
          </div>
          <div style={{ fontFamily: "Syncopate", fontSize: "1.05rem", letterSpacing: "0.15em",
            color: "var(--acid)" }}>
            CONTROL
          </div>
        </div>

        {/* Simulation section */}
        <div style={{ fontFamily: "Syncopate", fontSize: "0.52rem", letterSpacing: "0.25em",
          color: "var(--muted)", textTransform: "uppercase",
          paddingBottom: 5, borderBottom: "1px solid var(--border)" }}>
          Simulation
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <label style={{ fontFamily: "JetBrains Mono", fontSize: "0.6rem",
            letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text2)" }}>
            Material
          </label>
          <select
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            style={{ background: "var(--panel)", border: "1px solid var(--border)",
              color: "var(--text)", padding: "6px 8px", borderRadius: 3,
              fontFamily: "JetBrains Mono", fontSize: "0.72rem", width: "100%" }}
          >
            <option value="default">Default</option>
            <option value="rock">Rock (40°)</option>
            <option value="ore">Ore (37°)</option>
            <option value="overburden">Overburden (35°)</option>
          </select>
        </div>

        <RangeField id="n_dumps" label="Dump Count" min={10} max={120}
          step={1} value={nDumps} onChange={setNDumps} decimals={0} />

        <RangeField id="iso" label="Iso Threshold" min={0.5} max={0.99}
          value={isoThreshold} onChange={setIsoThreshold} />

        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <label style={{ fontFamily: "JetBrains Mono", fontSize: "0.6rem",
            letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text2)" }}>
            Polygon Seed
          </label>
          <input
            type="number" value={seed} min={1} max={9999}
            onChange={(e) => setSeed(parseInt(e.target.value) || 42)}
            style={{ background: "var(--panel)", border: "1px solid var(--border)",
              color: "var(--text)", padding: "6px 8px", borderRadius: 3,
              fontFamily: "JetBrains Mono", fontSize: "0.72rem", width: "100%" }}
          />
        </div>

        {/* ML Toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.6rem",
            letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text2)" }}>
            PPO Policy (ML)
          </span>
          <button
            onClick={() => setUseML(!useML)}
            style={{
              padding: "3px 12px", borderRadius: 3, fontSize: "0.65rem",
              fontFamily: "JetBrains Mono", cursor: "pointer", transition: "all 0.15s",
              background: useML ? "rgba(200,255,0,0.15)" : "var(--panel)",
              border: `1px solid ${useML ? "var(--acid)" : "var(--border)"}`,
              color: useML ? "var(--acid)" : "var(--text2)",
              flexShrink: 0,
            }}
          >
            {useML ? "ON" : "OFF"}
          </button>
        </div>

        {/* Fleet section */}
        <div style={{ fontFamily: "Syncopate", fontSize: "0.52rem", letterSpacing: "0.25em",
          color: "var(--muted)", textTransform: "uppercase",
          paddingBottom: 5, borderBottom: "1px solid var(--border)" }}>
          Fleet
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {Object.keys(FLEET_COLORS).map((model) => {
            const active = selectedFleet.includes(model);
            return (
              <button key={model} onClick={() => toggleFleet(model)}
                style={{
                  padding: "4px 10px", borderRadius: 3, fontSize: "0.6rem",
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
        <div style={{ fontFamily: "Syncopate", fontSize: "0.52rem", letterSpacing: "0.25em",
          color: "var(--muted)", textTransform: "uppercase",
          paddingBottom: 5, borderBottom: "1px solid var(--border)" }}>
          Scoring Weights
        </div>

        {/* FIX: weights in a single-column list so values NEVER render behind labels */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <RangeField id="w1" label="w1 · Fill" min={0.5} max={3} value={weights.w1}
            onChange={(v) => setWeight("w1", v)} />
          <RangeField id="w2" label="w2 · Congestion" min={0.1} max={2} value={weights.w2}
            onChange={(v) => setWeight("w2", v)} />
          <RangeField id="w3" label="w3 · Isolation" min={1} max={5} step={0.1} value={weights.w3}
            onChange={(v) => setWeight("w3", v)} />
          <RangeField id="w4" label="w4 · Distance" min={0.05} max={0.5} value={weights.w4}
            onChange={(v) => setWeight("w4", v)} />
        </div>

        <button
          className="btn-secondary"
          onClick={onTune}
          disabled={isTuning || isRunning}
          style={{ width: "100%" }}
        >
          {isTuning ? "Tuning…" : "⚙ Auto-Tune"}
        </button>

      </div>

      {/* ── Pinned Execute button — always fully visible ── */}
      {/* FIX: lives outside the scroll area so it is NEVER clipped */}
      <div style={{
        flexShrink: 0,
        padding: "10px 14px 14px",
        borderTop: "1px solid var(--border)",
        background: "var(--surface)",
      }}>
        <button
          className="btn-primary"
          onClick={onRun}
          disabled={isRunning}
          style={{ width: "100%" }}
        >
          {isRunning ? "RUNNING…" : "▶ EXECUTE"}
        </button>
      </div>

    </aside>
  );
}