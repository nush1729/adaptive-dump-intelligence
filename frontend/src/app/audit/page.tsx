"use client";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import PageShell from "@/components/layout/PageShell";
import { RailItem } from "@/components/layout/CollapsedRail";

const Scene3D = dynamic(() => import("@/components/three/Scene3D"), { ssr: false });
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

export default function AuditPage() {
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [seed, setSeed] = useState(42);
  const [material, setMaterial] = useState("default");
  const [nDumps, setNDumps] = useState(60);

  const runSim = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPlaying(false);
    setCursor(0);
    try {
      const r = await fetch(`${API}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material,
          n_dumps: nDumps,
          fleet_models: ["Cat793", "Cat777", "Cat797", "Cat793"],
          iso_threshold: 0.85,
          seed,
          use_ml: false,
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
  }, [seed, material, nDumps]);

  useEffect(() => { runSim(); }, []);

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
    const rows = simResult.surface.length;
    const cols = simResult.surface[0].length;
    const h: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
    const markers: Array<{ r: number; c: number }> = [];

    for (const e of log) {
      if (e.status !== "dumped" || e.r < 0 || e.c < 0 || e.r >= rows || e.c >= cols) continue;
      const radius = 8;
      const sigma = radius * 0.45;
      const sigSq2 = 2 * sigma * sigma;
      const payload = (e.payload_t ?? 200) / 200;
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const nr = e.r + dr;
          const nc = e.c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || !simResult.mask[nr][nc]) continue;
          const distSq = dr * dr + dc * dc;
          if (distSq > radius * radius) continue;
          h[nr][nc] += Math.exp(-distSq / sigSq2) * 0.6 * payload;
        }
      }
      markers.push({ r: e.r, c: e.c });
    }

    return { replaySurface: h, dumpMarkers: markers.slice(-6) };
  }, [simResult, cursor]);

  const currentEntry = simResult?.log[cursor] ?? null;
  const succeededSoFar = simResult ? simResult.log.slice(0, cursor + 1).filter((e) => e.status === "dumped").length : 0;
  const rejectedSoFar = cursor + 1 - succeededSoFar;
  const progressPct = simResult ? Math.round(((cursor + 1) / simResult.log.length) * 100) : 0;

  const controlsPanel = (
    <div className="h-full overflow-y-auto p-4 flex flex-col gap-4">
      <div className="section-label">Replay Controls</div>
      <label className="flex flex-col gap-1 font-mono text-[0.72rem] uppercase tracking-widest" style={{ color: "var(--text2)" }}>
        Material
        <select value={material} onChange={(e) => setMaterial(e.target.value)} className="rounded px-2 py-1 text-sm" style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}>
          {["default", "rock", "ore", "overburden"].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 font-mono text-[0.72rem] uppercase tracking-widest" style={{ color: "var(--text2)" }}>
        Dumps
        <input type="number" value={nDumps} min={10} max={150} onChange={(e) => setNDumps(Number(e.target.value))} className="rounded px-2 py-1 text-sm" style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }} />
      </label>
      <label className="flex flex-col gap-1 font-mono text-[0.72rem] uppercase tracking-widest" style={{ color: "var(--text2)" }}>
        Seed
        <input type="number" value={seed} min={0} max={9999} onChange={(e) => setSeed(Number(e.target.value))} className="rounded px-2 py-1 text-sm" style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }} />
      </label>
      <button onClick={runSim} disabled={loading} className="rounded py-3 font-syncopate text-[0.72rem] uppercase tracking-[0.18em] font-bold disabled:opacity-60" style={{ background: loading ? "var(--muted)" : "var(--acid)", color: "#000" }}>
        {loading ? "Simulating..." : "Run Simulation"}
      </button>

      {simResult && (
        <>
          <div className="section-label mt-2">Playback</div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCursor(0)} className="adios-icon-button !w-auto px-3 font-mono text-[0.68rem]">Start</button>
            <button onClick={() => setCursor((c) => Math.max(0, c - 1))} disabled={cursor === 0} className="adios-icon-button !w-auto px-3 font-mono text-[0.68rem]">Prev</button>
            <button onClick={() => setPlaying((p) => !p)} className="rounded px-3 py-1 font-mono text-[0.72rem] font-bold" style={{ background: playing ? "var(--ore)" : "var(--acid)", color: "#000" }}>{playing ? "Pause" : "Play"}</button>
          </div>
          <button onClick={() => setCursor((c) => Math.min(simResult.log.length - 1, c + 1))} disabled={cursor === simResult.log.length - 1} className="adios-icon-button !w-full font-mono text-[0.68rem]">Next</button>
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
          <div className="ml-auto font-mono text-[0.7rem] uppercase tracking-widest" style={{ color: "var(--text2)" }}>
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
              ["Uniformity", `${simResult.summary.height_uniformity}`],
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
      </div>
    </PageShell>
  );
}
