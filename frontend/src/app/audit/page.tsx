"use client";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import PageShell from "@/components/layout/PageShell";
import { RailItem } from "@/components/layout/CollapsedRail";
import { UI_DEFAULTS, STOCK_PAYLOADS_T } from "@/lib/config";

const Scene3D = dynamic(() => import("@/components/three/Scene3D"), { ssr: false });
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/* ── Fleet class constants (matches dashboard ControlPanel) ─── */
const FLEET_CLASSES = ["Cat793", "Cat777", "Cat797"] as const;
const FLEET_COLORS: Record<string, string> = {
  Cat777: "#FFD700", Cat793: "#FF8C00", Cat797: "#FF4500",
};
const FLEET_LABELS: Record<string, string> = {
  Cat777: "Cat 777 · 100t", Cat793: "Cat 793 · 240t", Cat797: "Cat 797 · 400t",
};

/* ── Material options (same set as dashboard) ──────────────── */
const MATERIAL_OPTIONS = [
  { value: "default", label: "Default (38°)" },
  { value: "rock", label: "Rock (40°)" },
  { value: "ore", label: "Ore (37°)" },
  { value: "overburden", label: "Overburden (35°)" },
  { value: "coal", label: "Coal (34°)" },
  { value: "waste", label: "Waste (35°)" },
];

interface AuditEntry {
  t: number;
  truck: string;
  r: number;
  c: number;
  status: string;
  payload_t: number;
  reach?: number | null;
  volume?: number;
  coverage?: number;
}

interface SimSnapshot {
  dump_n: number;
  truck: string;
  r: number;
  c: number;
  volume: number;
  coverage: number;
  efficiency: number;
  surface?: number[][];
}

interface SimResult {
  surface: number[][];
  mask: boolean[][];
  entry: [number, number];
  summary: Record<string, number | string>;
  log: AuditEntry[];
  snapshots: SimSnapshot[];
}

const STATUS_COLOR: Record<string, string> = {
  dumped: "#FFC000",
  iso_rejected: "#FF5722",
  slope_rejected: "#FF3366",
};
function sc(s: string) { return STATUS_COLOR[s] ?? "#7AA8BC"; }

function policyLabel(policy: unknown) {
  const p = String(policy ?? "heuristic");
  if (p === "maskable_ppo") return "Maskable PPO";
  if (p === "imitation_bc") return "Imitation BC";
  if (p === "hybrid") return "Hybrid Policy";
  if (p === "heuristic") return "Heuristic";
  return p.replace(/_/g, " ");
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded px-2 py-0.5 font-mono text-[0.64rem] uppercase tracking-[0.08em]" style={{
      background: sc(status) + "22",
      color: sc(status),
      border: `1px solid ${sc(status)}44`,
    }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function KPIOverlay({ label, val }: { label: string; val: string }) {
  return (
    <div className="adios-panel px-3 py-2 backdrop-blur">
      <div className="font-mono text-[0.55rem] uppercase tracking-[0.1em]" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="font-mono text-[0.95rem] font-bold" style={{ color: "var(--acid)" }}>{val}</div>
    </div>
  );
}

/** Derive the [model, model, ...] list from per-class counts. */
function fleetFromCounts(counts: Record<string, number>): string[] {
  const out: string[] = [];
  for (const model of FLEET_CLASSES) {
    const n = counts[model] ?? 0;
    for (let i = 0; i < n; i++) out.push(model);
  }
  return out;
}

export default function AuditPage() {
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);

  // ── Simulation config state (mirrors Dashboard) ──────────
  const [seed, setSeed] = useState<number>(UI_DEFAULTS.seed);
  const [material, setMaterial] = useState("default");
  const [nDumps, setNDumps] = useState<number>(UI_DEFAULTS.nDumps);
  const [useML, setUseML] = useState(false);
  const [isoThreshold, setIsoThreshold] = useState<number>(UI_DEFAULTS.isoThreshold);
  const [minDumpSpacing, setMinDumpSpacing] = useState<number>(UI_DEFAULTS.minDumpSpacing);
  const [zoneMode, setZoneMode] = useState(false);

  // Fleet composition state
  const initialFleetCounts: Record<string, number> = UI_DEFAULTS.fleet.reduce(
    (acc, model) => ({ ...acc, [model]: (acc[model] ?? 0) + 1 }),
    {} as Record<string, number>,
  );
  const [fleetCounts, setFleetCounts] = useState<Record<string, number>>(initialFleetCounts);
  const [payloadOverrides, setPayloadOverrides] = useState<Record<string, number>>({});

  const selectedFleet = useMemo(() => fleetFromCounts(fleetCounts), [fleetCounts]);

  const setFleetCount = (model: string, count: number) => {
    const clamped = Math.max(0, Math.min(12, Math.round(count)));
    setFleetCounts(prev => ({ ...prev, [model]: clamped }));
  };
  const setPayloadOverride = (model: string, val: number | null) => {
    setPayloadOverrides(prev => {
      const next = { ...prev };
      if (val == null || Number.isNaN(val) || val <= 0) { delete next[model]; }
      else { next[model] = Math.round(Math.min(600, Math.max(10, val))); }
      return next;
    });
  };

  const loadAuditLog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/audit`);
      if (!r.ok) throw new Error(`HTTP ${r.status} - ${r.statusText}`);
      const d = await r.json();
      if (Array.isArray(d) && d.length > 0) {
        // Just load the log, the backend will generate snapshots when we click runSim
        // but for now let's just let runSim do the work with the correct ML flag.
      }
    } catch (e: any) {
      setError("No previous audit log found. Run a simulation first.");
    } finally {
      setLoading(false);
    }
  }, []);

  const runSim = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPlaying(false);
    setCursor(0);
    try {
      const fleet = selectedFleet.length > 0 ? selectedFleet : ["generic"];
      const r = await fetch(`${API}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material,
          n_dumps: nDumps,
          fleet_models: fleet,
          payload_overrides: Object.keys(payloadOverrides).length > 0 ? payloadOverrides : null,
          iso_threshold: isoThreshold,
          min_dump_spacing: minDumpSpacing,
          seed,
          use_ml: useML,
          zone_mode: zoneMode,
          auto_tune: false,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} - ${r.statusText}`);
      const d = await r.json();
      setSimResult(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [seed, material, nDumps, useML, selectedFleet, payloadOverrides, isoThreshold, minDumpSpacing, zoneMode]);

  useEffect(() => { loadAuditLog(); runSim(); }, []);

  useEffect(() => {
    if (!playing || !simResult) return;
    const max = simResult.log.length - 1;
    if (cursor >= max) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => setCursor((c) => Math.min(c + 1, max)), 300);
    return () => clearTimeout(id);
  }, [playing, cursor, simResult]);

  const { replaySurface, dumpMarkers } = useMemo(() => {
    if (!simResult) return { replaySurface: null, dumpMarkers: [] as Array<{ r: number; c: number }> };
    const log = simResult.log.slice(0, cursor + 1);
    const markers: Array<{ r: number; c: number }> = [];

    for (const e of log) {
      if (e.status !== "dumped" || e.r == null || e.c == null) continue;
      markers.push({ r: e.r, c: e.c });
    }

    const snapshotSurface = simResult.snapshots
      .filter((s) => s.surface)
      .find((s) => s.dump_n >= cursor)?.surface;
    return { replaySurface: snapshotSurface ?? simResult.surface, dumpMarkers: markers.slice(-6) };
  }, [simResult, cursor]);

  const currentEntry = simResult?.log[cursor] ?? null;
  const succeededSoFar = simResult ? simResult.log.slice(0, cursor + 1).filter((e) => e.status === "dumped").length : 0;
  const rejectedSoFar = cursor + 1 - succeededSoFar;
  const progressPct = simResult ? Math.round(((cursor + 1) / simResult.log.length) * 100) : 0;

  const controlsPanel = (
    <div className="h-full overflow-y-auto p-4 flex flex-col gap-4">
      <div className="section-label">Replay Controls</div>

      {/* Material */}
      <label className="flex flex-col gap-1 font-mono text-[0.72rem] uppercase tracking-widest" style={{ color: "var(--text2)" }}>
        Material
        <select value={material} onChange={(e) => setMaterial(e.target.value)} className="rounded px-2 py-1 text-sm" style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}>
          {MATERIAL_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </label>

      {/* Dumps */}
      <label className="flex flex-col gap-1 font-mono text-[0.72rem] uppercase tracking-widest" style={{ color: "var(--text2)" }}>
        Dumps
        <input type="number" value={nDumps} min={10} max={150} onChange={(e) => setNDumps(Number(e.target.value))} className="rounded px-2 py-1 text-sm" style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }} />
      </label>

      {/* Seed */}
      <label className="flex flex-col gap-1 font-mono text-[0.72rem] uppercase tracking-widest" style={{ color: "var(--text2)" }}>
        Seed
        <input type="number" value={seed} min={0} max={9999} onChange={(e) => setSeed(Number(e.target.value))} className="rounded px-2 py-1 text-sm" style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }} />
      </label>

      {/* ISO Threshold */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-center">
          <span className="font-mono text-[0.68rem] tracking-widest uppercase" style={{ color: "var(--muted)" }}>Iso Threshold</span>
          <span className="font-mono text-[0.78rem] font-bold px-2 py-0.5 rounded" style={{ color: "var(--acid)", background: "var(--panel)", border: "1px solid var(--border)" }}>{isoThreshold.toFixed(2)}</span>
        </div>
        <input type="range" min={0.5} max={0.99} step={0.01} value={isoThreshold}
          onChange={(e) => setIsoThreshold(parseFloat(e.target.value))}
          className="w-full" style={{ accentColor: "var(--acid)" }} />
      </div>

      {/* Min Dump Spacing */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-center">
          <span className="font-mono text-[0.68rem] tracking-widest uppercase" style={{ color: "var(--muted)" }}>Min Spacing</span>
          <span className="font-mono text-[0.78rem] font-bold px-2 py-0.5 rounded" style={{ color: "var(--acid)", background: "var(--panel)", border: "1px solid var(--border)" }}>{minDumpSpacing.toFixed(1)}</span>
        </div>
        <input type="range" min={0.5} max={10} step={0.5} value={minDumpSpacing}
          onChange={(e) => setMinDumpSpacing(parseFloat(e.target.value))}
          className="w-full" style={{ accentColor: "var(--acid)" }} />
      </div>

      {/* Policy */}
      <label className="flex flex-col gap-1 font-mono text-[0.72rem] uppercase tracking-widest" style={{ color: "var(--text2)" }}>
        Policy
        <select value={useML ? "ml" : "heuristic"} onChange={(e) => setUseML(e.target.value === "ml")} className="rounded px-2 py-1 text-sm" style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}>
          <option value="heuristic">Heuristic</option>
          <option value="ml">ML / Hybrid</option>
        </select>
      </label>

      {/* Zone Mode Toggle */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[0.68rem] tracking-widest uppercase" style={{ color: "var(--muted)" }}>Zone Mode</span>
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

      {/* Fleet Composition */}
      <div className="section-label mt-1">Fleet Composition</div>
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
                  <button onClick={() => setFleetCount(model, count - 1)} disabled={count <= 0}
                    className="w-6 h-6 rounded font-mono text-[0.8rem] leading-none border"
                    style={{ border: "1px solid var(--border)", color: "var(--muted)", cursor: count <= 0 ? "not-allowed" : "pointer", background: "transparent" }}>
                    −
                  </button>
                  <span className="font-mono text-[0.78rem] font-bold tabular-nums" style={{ color: "var(--acid)", minWidth: 18, textAlign: "center" }}>
                    {count}
                  </span>
                  <button onClick={() => setFleetCount(model, count + 1)} disabled={count >= 12}
                    className="w-6 h-6 rounded font-mono text-[0.8rem] leading-none border"
                    style={{ border: "1px solid var(--border)", color: "var(--muted)", cursor: count >= 12 ? "not-allowed" : "pointer", background: "transparent" }}>
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
        <div className="text-[0.62rem] font-mono" style={{ color: "var(--muted)" }}>
          Total fleet: <span style={{ color: "var(--acid)" }}>{selectedFleet.length}</span> truck{selectedFleet.length === 1 ? "" : "s"}
        </div>
      </div>

      {/* Run Simulation */}
      <button
        onClick={runSim}
        disabled={loading}
        className="rounded py-3 font-syncopate text-[0.72rem] uppercase tracking-[0.18em] font-bold"
        style={{
          background: loading ? "transparent" : "var(--acid)",
          color: loading ? "var(--acid)" : "#000",
          border: loading ? "2px solid var(--acid)" : "none",
          boxShadow: loading ? "none" : "0 0 18px rgba(255,205,17,0.35)",
          cursor: loading ? "not-allowed" : "pointer",
          width: "100%",
        }}
      >
        {loading ? "Simulating…" : "▶ Run Simulation"}
      </button>

      {simResult && (
        <>
          <div className="section-label mt-2">Playback</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCursor(0)}
              className="rounded px-3 py-1 font-mono text-[0.68rem] font-bold"
              style={{ background: "transparent", border: "1px solid var(--acid)", color: "var(--acid)", cursor: "pointer" }}
            >⏮ Start</button>
            <button
              onClick={() => setCursor((c) => Math.max(0, c - 1))}
              disabled={cursor === 0}
              className="rounded px-3 py-1 font-mono text-[0.68rem] font-bold"
              style={{ background: "transparent", border: "1px solid var(--acid)", color: cursor === 0 ? "var(--muted)" : "var(--acid)", cursor: cursor === 0 ? "not-allowed" : "pointer" }}
            >◀ Prev</button>
            <button
              onClick={() => setPlaying((p) => !p)}
              className="rounded px-4 py-1 font-mono text-[0.72rem] font-bold"
              style={{
                background: playing ? "var(--ore)" : "var(--acid)",
                color: "#000", border: "none", cursor: "pointer",
                boxShadow: playing ? "0 0 10px rgba(255,107,53,0.4)" : "0 0 14px rgba(255,205,17,0.4)",
              }}
            >{playing ? "⏸ Pause" : "▶ Play"}</button>
          </div>
          <button
            onClick={() => setCursor((c) => Math.min(simResult.log.length - 1, c + 1))}
            disabled={cursor === simResult.log.length - 1}
            className="rounded py-1.5 font-mono text-[0.68rem] font-bold w-full"
            style={{ background: "transparent", border: "1px solid var(--acid)", color: "var(--acid)", cursor: cursor === simResult.log.length - 1 ? "not-allowed" : "pointer" }}
          >Next ▶</button>
          <input type="range" min={0} max={simResult.log.length - 1} value={cursor} onChange={(e) => { setPlaying(false); setCursor(Number(e.target.value)); }} className="w-full accent-[#FFC000]" />
          <div className="h-1 rounded" style={{ background: "var(--border)" }}>
            <div className="h-full rounded transition-all" style={{ width: `${progressPct}%`, background: "var(--acid)" }} />
          </div>
        </>
      )}
    </div>
  );

  const logPanel = (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: "var(--surface)" }}>
      {currentEntry && (
        <div className="p-4 border-b" style={{ background: "var(--panel)", borderColor: "var(--border)" }}>
          <div className="font-syncopate text-[0.62rem] uppercase tracking-[0.18em] mb-3" style={{ color: "var(--muted)" }}>
            Decision at t={currentEntry.t}
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            {[
              ["Truck", currentEntry.truck],
              ["Cell", `(${currentEntry.r}, ${currentEntry.c})`],
              ["Payload", `${currentEntry.payload_t}t`],
              ["Reach", currentEntry.reach != null ? currentEntry.reach.toFixed(3) : "--"],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.08em]" style={{ color: "var(--muted)" }}>{k}</div>
                <div className="font-mono text-[0.78rem]" style={{ color: "var(--text)" }}>{v}</div>
              </div>
            ))}
          </div>
          <StatusBadge status={currentEntry.status} />
        </div>
      )}
      <div className="font-syncopate text-[0.55rem] uppercase tracking-[0.18em] px-4 py-2 border-b" style={{ color: "var(--muted)", borderColor: "var(--border)" }}>
        Decision Log ({simResult?.log.length ?? 0})
      </div>
      <div className="flex-1 overflow-y-auto">
        {simResult?.log.map((entry, idx) => (
          <button key={idx} onClick={() => setCursor(idx)} className="w-full text-left px-4 py-2 border-b transition-colors" style={{
            borderColor: "rgba(127,127,127,0.16)",
            background: idx === cursor ? "rgba(255,192,0,0.08)" : "transparent",
            borderLeft: idx === cursor ? "2px solid var(--acid)" : "2px solid transparent",
          }}>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[0.64rem] min-w-7" style={{ color: "var(--muted)" }}>#{idx}</span>
              <span className="font-mono text-[0.68rem] flex-1 truncate" style={{ color: "var(--text2)" }}>{`${entry.truck} -> (${entry.r},${entry.c})`}</span>
              <StatusBadge status={entry.status} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <PageShell
      leftTitle="Audit"
      leftSubtitle="Replay"
      leftContent={controlsPanel}
      leftRail={
        <>
          <RailItem label="Dump" value={String(nDumps)} accent />
          <RailItem label="Seed" value={String(seed)} />
          <RailItem label="Mat" value={material.slice(0, 3)} />
          <RailItem label="Fleet" value={String(selectedFleet.length)} />
        </>
      }
      rightTitle="Decision Log"
      rightSubtitle="Replay Events"
      rightContent={logPanel}
      rightRail={
        <>
          <RailItem label="Step" value={simResult ? `${cursor + 1}` : "--"} accent />
          <RailItem label="Ok" value={String(succeededSoFar)} />
          <RailItem label="Rej" value={String(rejectedSoFar)} />
        </>
      }
    >
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex items-center gap-4 px-4 lg:px-5 py-3 border-b" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <span className="font-syncopate text-[0.75rem] tracking-[0.2em] uppercase font-bold" style={{ color: "var(--acid)" }}>Audit Replay</span>
          <span className="ml-2 rounded px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.1em]" style={{ background: "rgba(255,192,0,0.15)", color: "var(--acid)", border: "1px solid var(--acid)" }}>
            {policyLabel(simResult?.summary?.policy)}
          </span>
          <div className="ml-auto flex items-center gap-3 font-mono text-[0.7rem] uppercase tracking-widest" style={{ color: "var(--text2)" }}>
            {simResult ? `${cursor + 1}/${simResult.log.length}` : loading ? "Simulating" : "Awaiting run"}
          </div>
        </div>

        {error && (
          <div className="px-5 py-2 border-b font-mono text-[0.75rem]" style={{ background: "rgba(255,51,102,0.08)", borderColor: "rgba(255,51,102,0.25)", color: "#FF3366" }}>
            {error} - Is the backend running at <span style={{ color: "var(--acid)" }}>{API}</span>?
          </div>
        )}

        <div className="relative flex-1 min-h-0 overflow-hidden" style={{ background: "#050A0F" }}>
          {replaySurface && simResult ? (
            <Scene3D surface={replaySurface} mask={simResult.mask} entry={simResult.entry} dumpMarkers={dumpMarkers} camPreset="iso" />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 font-mono" style={{ color: "var(--muted)" }}>
              {loading ? "Simulating terrain..." : "Run a simulation to replay"}
            </div>
          )}

          {currentEntry && (
            <div className="absolute top-4 left-4 flex gap-2 flex-wrap">
              <KPIOverlay label="Dump" val={`#${cursor}`} />
              <KPIOverlay label="Coverage" val={`${((currentEntry.coverage ?? 0) * 100).toFixed(1)}%`} />
              <KPIOverlay label="Volume" val={`${(currentEntry.volume ?? 0).toFixed(1)}m3`} />
              <KPIOverlay label="OK / REJ" val={`${succeededSoFar} / ${rejectedSoFar}`} />
            </div>
          )}
        </div>

        {simResult && (
          <div className="px-4 py-2 border-t flex gap-5 overflow-x-auto" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            {[
              ["Volume", `${Number(simResult.summary.total_volume ?? 0).toFixed(1)}m3`],
              ["Coverage", `${simResult.summary.coverage_pct}%`],
              ["Efficiency", `${simResult.summary.packing_efficiency}%`],
              ["Uniformity", `${(Number(simResult.summary.height_uniformity) * 100).toFixed(1)}%`],
              ["Iso Events", `${simResult.summary.isolation_events}`],
              ["Latency", `${simResult.summary.latency_ms}ms`],
              ["Policy", String(simResult.summary.policy ?? "--").toUpperCase()],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="font-mono text-[0.52rem] uppercase tracking-[0.1em]" style={{ color: "var(--muted)" }}>{k}</div>
                <div className="font-mono text-[0.82rem] font-bold" style={{ color: "var(--acid)" }}>{v}</div>
              </div>
            ))}
          </div>
        )}

        {simResult && (
          <div id="adios-print-report" className="p-10 font-sans text-black bg-white" style={{ display: "none" }}>
            {/* Header */}
            <div className="flex items-center justify-between border-b-4 border-black pb-4 mb-6" style={{ contentVisibility: "auto" }}>
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-black font-mono">
                  CATERPILLAR ADIOS — SYSTEM AUDIT REPORT
                </h1>
                <p className="text-sm text-gray-700 uppercase tracking-widest font-mono mt-1 font-semibold">
                  Adaptive Dump Intelligence &amp; Orchestration System
                </p>
              </div>
              <div className="text-right font-mono text-xs text-black font-semibold">
                <div>Date: {new Date().toLocaleDateString()}</div>
                <div>Status: OPERATIONAL</div>
              </div>
            </div>

            {/* Meta Info */}
            <div className="grid grid-cols-4 gap-4 p-4 bg-gray-100 rounded border border-gray-300 mb-6 font-mono text-xs text-black">
              <div>
                <span className="block text-gray-500 font-bold uppercase">Seed Value</span>
                <span className="text-sm font-bold">{seed}</span>
              </div>
              <div>
                <span className="block text-gray-500 font-bold uppercase">Material Zone</span>
                <span className="text-sm font-bold capitalize">{material}</span>
              </div>
              <div>
                <span className="block text-gray-500 font-bold uppercase">Budget Dumps</span>
                <span className="text-sm font-bold">{nDumps}</span>
              </div>
              <div>
                <span className="block text-gray-500 font-bold uppercase">Dispatch Policy</span>
                <span className="text-sm font-bold uppercase">{policyLabel(simResult.summary.policy)}</span>
              </div>
            </div>

            {/* KPI Summary */}
            <div className="mb-6">
              <h2 className="text-sm font-bold uppercase tracking-wider font-mono mb-3 text-black border-b border-gray-300 pb-1">
                Site Performance Scorecard
              </h2>
              <div className="grid grid-cols-3 gap-4 font-mono text-black">
                <div className="p-3 border border-gray-300 rounded text-center">
                  <span className="block text-[0.62rem] uppercase text-gray-500 font-bold">Total Deposited Volume</span>
                  <span className="text-lg font-extrabold text-black">{Number(simResult.summary.total_volume ?? 0).toFixed(1)} m³</span>
                </div>
                <div className="p-3 border border-gray-300 rounded text-center">
                  <span className="block text-[0.62rem] uppercase text-gray-500 font-bold">Spatial Footprint Coverage</span>
                  <span className="text-lg font-extrabold text-black">{simResult.summary.coverage_pct}%</span>
                </div>
                <div className="p-3 border border-gray-300 rounded text-center">
                  <span className="block text-[0.62rem] uppercase text-gray-500 font-bold">Packing Efficiency</span>
                  <span className="text-lg font-extrabold text-black">{simResult.summary.packing_efficiency}%</span>
                </div>
                <div className="p-3 border border-gray-300 rounded text-center">
                  <span className="block text-[0.62rem] uppercase text-gray-500 font-bold">Height Uniformity</span>
                  <span className="text-lg font-extrabold text-black">{(Number(simResult.summary.height_uniformity) * 100).toFixed(1)}%</span>
                </div>
                <div className="p-3 border border-gray-300 rounded text-center">
                  <span className="block text-[0.62rem] uppercase text-gray-500 font-bold">Isolation Constraints Rej</span>
                  <span className="text-lg font-extrabold text-black">{simResult.summary.rejected} / {simResult.summary.total_dispatched}</span>
                </div>
                <div className="p-3 border border-gray-300 rounded text-center">
                  <span className="block text-[0.62rem] uppercase text-gray-500 font-bold">Dispatch Latency (Avg)</span>
                  <span className="text-lg font-extrabold text-black">{simResult.summary.latency_ms} ms</span>
                </div>
              </div>
            </div>

            {/* Decision Log Table */}
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider font-mono mb-3 text-black border-b border-gray-300 pb-1">
                Detailed Dispatch Audit Log
              </h2>
              <table className="w-full text-left font-mono text-[0.68rem] text-black border-collapse">
                <thead>
                  <tr className="border-b-2 border-black bg-gray-100">
                    <th className="py-2 px-1">Step</th>
                    <th className="py-2 px-1">Truck Model</th>
                    <th className="py-2 px-1">Coords (R, C)</th>
                    <th className="py-2 px-1 text-right">Payload</th>
                    <th className="py-2 px-1 text-right">Reach</th>
                    <th className="py-2 px-1 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {simResult.log.map((entry, idx) => (
                    <tr key={idx} className="border-b border-gray-200">
                      <td className="py-1 px-1">#{idx}</td>
                      <td className="py-1 px-1 font-bold">{entry.truck}</td>
                      <td className="py-1 px-1">({entry.r}, {entry.c})</td>
                      <td className="py-1 px-1 text-right">{entry.payload_t}t</td>
                      <td className="py-1 px-1 text-right">{entry.reach != null ? entry.reach.toFixed(3) : "--"}</td>
                      <td className="py-1 px-1 text-center">
                        <span className="uppercase text-[0.6rem] px-2 py-0.5 rounded font-bold" style={{
                          border: `1px solid ${entry.status === "dumped" ? "#10B981" : "#EF4444"}`,
                          color: entry.status === "dumped" ? "#065F46" : "#991B1B",
                          backgroundColor: entry.status === "dumped" ? "#D1FAE5" : "#FEE2E2",
                        }}>
                          {entry.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="mt-12 pt-4 border-t border-gray-300 text-center font-mono text-[0.6rem] text-gray-500">
              <p>CONFIDENTIAL — FOR CATERPILLAR INTERNAL USE ONLY</p>
              <p className="mt-1">
                ADIOS System Version 3.0.
                {simResult.summary.policy === "maskable_ppo"
                  ? " Powered by constrained reinforcement learning."
                  : " Active policy artifact is reported exactly as loaded by the backend."}
              </p>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
