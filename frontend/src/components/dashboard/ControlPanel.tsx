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
        <label htmlFor={id} className="font-mono text-[0.99rem] tracking-widest uppercase" style={{ color: "var(--muted)" }}>
          {label}
        </label>
        <span className="font-mono text-[1.16rem] font-bold tabular-nums px-2 py-0.5 rounded" style={{ color: "var(--acid)", background: "var(--panel)", border: "1px solid var(--border)", minWidth: 44, textAlign: "right" }}>
          {value.toFixed(decimals)}
        </span>
      </div>
      <input type="range" id={id} min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full cursor-pointer" style={{ accentColor: "var(--acid)" }} />
    </div>
  );
}

const CUSTOM_TRUCK_COLORS = ["#00CC66", "#00A3B3", "#A78BFA", "#FF5E9C", "#38BDF8"];

function CustomTruckForm({ onAdd, takenNames }: { onAdd: (name: string, spec: { payload_t: number; turn_r: number; base_r: number; color: string }) => void; takenNames: string[] }) {
  const [name, setName] = React.useState("");
  const [payload, setPayload] = React.useState(150);
  const [turnR, setTurnR] = React.useState(12);
  const [baseR, setBaseR] = React.useState(6);
  const [color, setColor] = React.useState(CUSTOM_TRUCK_COLORS[0]);

  const trimmed = name.trim();
  const isDuplicate = trimmed.length > 0 && takenNames.includes(trimmed);
  const canAdd = trimmed.length > 0 && !isDuplicate;

  const submit = () => {
    if (!canAdd) return;
    onAdd(trimmed, { payload_t: payload, turn_r: turnR, base_r: baseR, color });
    setName("");
  };

  return (
    <div className="flex flex-col gap-1.5 px-2.5 py-2 rounded border mt-1"
      style={{ background: "var(--panel)", border: "1px dashed var(--border)" }}>
      <div className="text-[0.9rem] font-mono uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        Register custom truck type
      </div>
      <input type="text" value={name} placeholder="Name (e.g. HaulMax9000)"
        onChange={(e) => setName(e.target.value)}
        className="font-mono text-[1.01rem] rounded px-1.5 py-1 focus:outline-none"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }} />
      <div className="grid grid-cols-3 gap-1.5">
        <label className="flex flex-col gap-0.5 text-[0.99rem] font-mono uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Payload (t)
          <input type="number" min={10} max={600} value={payload} onChange={(e) => setPayload(parseFloat(e.target.value) || 0)}
            className="font-mono text-[1.01rem] rounded px-1.5 py-0.5 focus:outline-none"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }} />
        </label>
        <label className="flex flex-col gap-0.5 text-[0.99rem] font-mono uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Turn radius (m)
          <input type="number" min={5} max={30} value={turnR} onChange={(e) => setTurnR(parseFloat(e.target.value) || 0)}
            className="font-mono text-[1.01rem] rounded px-1.5 py-0.5 focus:outline-none"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }} />
        </label>
        <label className="flex flex-col gap-0.5 text-[0.99rem] font-mono uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Base radius (m)
          <input type="number" min={1} max={20} value={baseR} onChange={(e) => setBaseR(parseFloat(e.target.value) || 0)}
            className="font-mono text-[1.01rem] rounded px-1.5 py-0.5 focus:outline-none"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }} />
        </label>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          {CUSTOM_TRUCK_COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)}
              className="w-4 h-4 rounded-full transition-all"
              style={{ background: c, border: color === c ? "2px solid var(--text)" : "2px solid transparent", cursor: "pointer" }} />
          ))}
        </span>
        <button onClick={submit} disabled={!canAdd}
          className="px-3 py-1 rounded font-mono text-[0.96rem] uppercase tracking-wider border transition-all"
          style={{
            background: canAdd ? "rgba(255,205,17,0.1)" : "var(--panel)",
            border: `1px solid ${canAdd ? "var(--acid)" : "var(--border)"}`,
            color: canAdd ? "var(--acid)" : "var(--muted)",
            cursor: canAdd ? "pointer" : "not-allowed",
          }}>
          + Add
        </button>
      </div>
      {isDuplicate && (
        <div className="text-[0.99rem] font-mono" style={{ color: "#FF3366" }}>
          A truck type named &ldquo;{trimmed}&rdquo; already exists.
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-syncopate text-[1.01rem] tracking-[0.22em] uppercase border-b pb-1 mb-3"
      style={{ color: "var(--muted)", borderColor: "var(--border)" }}>
      {children}
    </div>
  );
}

export default function ControlPanel({ onRun, onTune, isTuning }: ControlPanelProps) {
  const {
    material, nDumps, isoThreshold, seed, selectedFleet, fleetCounts,
    payloadOverrides, customTrucks, minDumpSpacing, weights,
    useML, zoneMode, isRunning,
    setMaterial, setNDumps, setIsoThreshold, setSeed, setFleetCount,
    setPayloadOverride, addCustomTruck, removeCustomTruck, setMinDumpSpacing,
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
            <label className="font-mono text-[0.99rem] tracking-widest uppercase" style={{ color: "var(--muted)" }}>Material</label>
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
            <label className="font-mono text-[0.99rem] tracking-widest uppercase" style={{ color: "var(--muted)" }}>Polygon Seed</label>
            <input type="number" value={seed} min={1} max={9999}
              onChange={(e) => setSeed(parseInt(e.target.value) || 42)}
              className="p-1.5 rounded text-sm font-mono w-full focus:outline-none"
              style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }} />
          </div>
          {/* ML Toggle */}
          <div className="flex items-center justify-between mt-3">
            <span className="font-mono text-[0.99rem] tracking-widest uppercase" style={{ color: "var(--muted)" }}>ML / Hybrid Policy</span>
            <button onClick={() => setUseML(!useML)}
              className="px-3 py-1 rounded text-[1.13rem] font-mono transition-all border"
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
            <span className="font-mono text-[0.99rem] tracking-widest uppercase" style={{ color: "var(--muted)" }}
              title="Geofenced dispatch — each truck class is hard-restricted to a predefined active face, mirroring real AHS (Cat MineStar / Komatsu FrontRunner) behaviour, instead of ADIOS's free-form per-cell optimisation">
              Zone Mode (Geofenced)
            </span>
            <button onClick={() => setZoneMode(!zoneMode)}
              className="px-3 py-1 rounded text-[1.13rem] font-mono transition-all border"
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
                    <span className="flex items-center gap-1.5 text-[0.99rem] font-mono"
                      style={{ color: count > 0 ? "var(--text)" : "var(--muted)" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: FLEET_COLORS[model], display: "inline-block" }} />
                      {FLEET_LABELS[model]}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <button onClick={() => setFleetCount(model, count - 1)} disabled={isRunning || count <= 0}
                        className="w-6 h-6 rounded font-mono text-[1.16rem] leading-none border transition-all"
                        style={{ border: "1px solid var(--border)", color: "var(--muted)", cursor: isRunning || count <= 0 ? "not-allowed" : "pointer" }}>
                        −
                      </button>
                      <span className="font-mono text-[1.13rem] font-bold tabular-nums" style={{ color: "var(--acid)", minWidth: 18, textAlign: "center" }}>
                        {count}
                      </span>
                      <button onClick={() => setFleetCount(model, count + 1)} disabled={isRunning || count >= 12}
                        className="w-6 h-6 rounded font-mono text-[1.16rem] leading-none border transition-all"
                        style={{ border: "1px solid var(--border)", color: "var(--muted)", cursor: isRunning || count >= 12 ? "not-allowed" : "pointer" }}>
                        +
                      </button>
                    </span>
                  </div>
                  {count > 0 && (
                    <div className="flex items-center justify-between gap-2 pl-3.5">
                      <span className="text-[1.01rem] font-mono uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                        Payload override
                      </span>
                      <span className="flex items-center gap-1">
                        <input type="number" min={10} max={600} step={1}
                          value={override ?? ""}
                          placeholder={`${stock}t`}
                          disabled={isRunning}
                          onChange={(e) => setPayloadOverride(model, e.target.value === "" ? null : parseFloat(e.target.value))}
                          className="text-right font-mono text-[1.01rem] rounded px-1.5 py-0.5 focus:outline-none"
                          style={{
                            width: 56, background: "var(--panel)",
                            border: `1px solid ${override != null ? "var(--acid)" : "var(--border)"}`,
                            color: override != null ? "var(--acid)" : "var(--text2)",
                          }} />
                        <span className="text-[1.01rem] font-mono" style={{ color: "var(--muted)" }}>t</span>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            {Object.entries(customTrucks).map(([name, spec]) => {
              const count = fleetCounts[name] ?? 0;
              const override = payloadOverrides[name];
              return (
                <div key={name} className="flex flex-col gap-1.5 px-2.5 py-1.5 rounded border"
                  style={{
                    background: count > 0 ? "rgba(255,205,17,0.06)" : "var(--panel)",
                    border: `1px solid ${count > 0 ? "rgba(255,205,17,0.25)" : "var(--border)"}`,
                  }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[0.99rem] font-mono"
                      style={{ color: count > 0 ? "var(--text)" : "var(--muted)" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: spec.color, display: "inline-block" }} />
                      {name} · {spec.payload_t}t · r={spec.turn_r}m
                      <span className="ml-1 px-1 rounded text-[0.96rem] uppercase tracking-wider" style={{ background: "var(--surface)", color: "var(--muted)", border: "1px solid var(--border)" }}>
                        custom
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <button onClick={() => setFleetCount(name, count - 1)} disabled={isRunning || count <= 0}
                        className="w-6 h-6 rounded font-mono text-[1.16rem] leading-none border transition-all"
                        style={{ border: "1px solid var(--border)", color: "var(--muted)", cursor: isRunning || count <= 0 ? "not-allowed" : "pointer" }}>
                        −
                      </button>
                      <span className="font-mono text-[1.13rem] font-bold tabular-nums" style={{ color: "var(--acid)", minWidth: 18, textAlign: "center" }}>
                        {count}
                      </span>
                      <button onClick={() => setFleetCount(name, count + 1)} disabled={isRunning || count >= 12}
                        className="w-6 h-6 rounded font-mono text-[1.16rem] leading-none border transition-all"
                        style={{ border: "1px solid var(--border)", color: "var(--muted)", cursor: isRunning || count >= 12 ? "not-allowed" : "pointer" }}>
                        +
                      </button>
                      <button onClick={() => removeCustomTruck(name)} disabled={isRunning}
                        title="Remove this custom truck type"
                        className="w-6 h-6 rounded font-mono text-[1.01rem] leading-none border transition-all"
                        style={{ border: "1px solid var(--border)", color: "#FF3366", cursor: isRunning ? "not-allowed" : "pointer" }}>
                        ×
                      </button>
                    </span>
                  </div>
                  {count > 0 && (
                    <div className="flex items-center justify-between gap-2 pl-3.5">
                      <span className="text-[1.01rem] font-mono uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                        Payload override
                      </span>
                      <span className="flex items-center gap-1">
                        <input type="number" min={10} max={600} step={1}
                          value={override ?? ""}
                          placeholder={`${spec.payload_t}t`}
                          disabled={isRunning}
                          onChange={(e) => setPayloadOverride(name, e.target.value === "" ? null : parseFloat(e.target.value))}
                          className="text-right font-mono text-[1.01rem] rounded px-1.5 py-0.5 focus:outline-none"
                          style={{
                            width: 56, background: "var(--panel)",
                            border: `1px solid ${override != null ? "var(--acid)" : "var(--border)"}`,
                            color: override != null ? "var(--acid)" : "var(--text2)",
                          }} />
                        <span className="text-[1.01rem] font-mono" style={{ color: "var(--muted)" }}>t</span>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <CustomTruckForm onAdd={addCustomTruck} takenNames={[...FLEET_CLASSES, ...Object.keys(customTrucks)]} />

          <div className="mt-2 text-[0.9rem] font-mono" style={{ color: "var(--muted)" }}>
            Total fleet: <span style={{ color: "var(--acid)" }}>{selectedFleet.length}</span> truck{selectedFleet.length === 1 ? "" : "s"} dispatched in rotation
          </div>
        </div>

        {/* Scoring Weights */}
        <div>
          <SectionLabel>Scoring Weights</SectionLabel>
          <div className="flex flex-col gap-3">
            <RangeField id="volume" label="Volume · favour low piles" min={0.5} max={3} step={0.1} value={weights.volume} onChange={(v) => setWeight("volume", v)} />
            <RangeField id="distance" label="Distance · favour entry-proximity" min={0.5} max={3} step={0.1} value={weights.distance} onChange={(v) => setWeight("distance", v)} />
            <RangeField id="slope" label="Slope · avoid steep ground" min={0.1} max={2} step={0.1} value={weights.slope} onChange={(v) => setWeight("slope", v)} />
            <RangeField id="segregation" label="Segregation · material compatibility" min={0.1} max={2} step={0.1} value={weights.segregation} onChange={(v) => setWeight("segregation", v)} />
            <RangeField id="spacing" label="Spacing · target pile separation" min={1} max={5} step={0.1} value={weights.spacing} onChange={(v) => setWeight("spacing", v)} />
          </div>
          <button onClick={onTune} disabled={isTuning || isRunning}
            className="w-full mt-3 py-2 rounded font-syncopate text-[1.04rem] tracking-[0.15em] uppercase transition-all"
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
