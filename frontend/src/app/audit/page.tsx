"use client";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";

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
  surface:   number[][];
  mask:      boolean[][];
  entry:     [number, number];
  summary:   Record<string, number | string>;
  log:       AuditEntry[];
  snapshots: SimSnapshot[];
}

const STATUS_COLOR: Record<string, string> = {
  dumped:         "#C8FF00",
  iso_rejected:   "#FF6B35",
  slope_rejected: "#FF3366",
};
function sc(s: string) { return STATUS_COLOR[s] ?? "#7AA8BC"; }

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      background: sc(status) + "22",
      color: sc(status),
      fontFamily: "JetBrains Mono", fontSize: "0.52rem",
      letterSpacing: "0.1em", textTransform: "uppercase",
      padding: "2px 6px", borderRadius: 3,
    }}>{status.replace("_", " ")}</span>
  );
}

export default function AuditPage() {
  const [simResult, setSimResult]     = useState<SimResult | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [cursor, setCursor]           = useState<number>(0);   // index into log
  const [playing, setPlaying]         = useState(false);
  const [seed, setSeed]               = useState(42);
  const [material, setMaterial]       = useState("default");

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
          material, n_dumps: 60,
          fleet_models: ["Cat793","Cat777","Cat797","Cat793"],
          iso_threshold: 0.85, seed, use_ml: false, auto_tune: false,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setSimResult(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [seed, material]);

  useEffect(() => { runSim(); }, []);

  // playback
  useEffect(() => {
    if (!playing || !simResult) return;
    const max = simResult.log.length - 1;
    if (cursor >= max) { setPlaying(false); return; }
    const id = setTimeout(() => setCursor((c) => Math.min(c + 1, max)), 350);
    return () => clearTimeout(id);
  }, [playing, cursor, simResult]);

  // build progressive surface up to cursor
  const { replaySurface, dumpMarkers } = useMemo(() => {
    if (!simResult) return { replaySurface: null, dumpMarkers: [] };
    const log = simResult.log.slice(0, cursor + 1);
    const ROWS = simResult.surface.length;
    const COLS = simResult.surface[0].length;
    const h: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    const markers: Array<{ r: number; c: number }> = [];
    for (const e of log) {
      if (e.status === "dumped" && e.r >= 0 && e.c >= 0 && e.r < ROWS && e.c < COLS) {
        const radius = 5;
        for (let dr = -radius; dr <= radius; dr++) {
          for (let dc = -radius; dc <= radius; dc++) {
            const nr = e.r + dr, nc = e.c + dc;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
            if (!simResult.mask[nr][nc]) continue;
            const d = Math.sqrt(dr * dr + dc * dc);
            h[nr][nc] += Math.max(0, 1 - d / radius) * 0.8;
          }
        }
        markers.push({ r: e.r, c: e.c });
      }
    }
    return { replaySurface: h, dumpMarkers: markers.slice(-8) };
  }, [simResult, cursor]);

  const currentEntry = simResult?.log[cursor] ?? null;
  const succeededSoFar = simResult
    ? simResult.log.slice(0, cursor + 1).filter((e) => e.status === "dumped").length
    : 0;
  const rejectedSoFar = cursor + 1 - succeededSoFar;

  return (
    <div style={{
      height: "calc(100vh - 44px)",
      background: "var(--void)",
      display: "grid",
      gridTemplateColumns: "1fr 340px",
      gridTemplateRows: "auto 1fr auto",
    }}>
      {/* ── Top control bar ── */}
      <div style={{
        gridColumn: "1 / -1",
        padding: "10px 20px",
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
      }}>
        <span style={{ fontFamily: "Syncopate", fontSize: "0.65rem",
          letterSpacing: "0.2em", color: "var(--acid)", textTransform: "uppercase" }}>
          Audit Replay
        </span>

        {/* Sim config */}
        <label style={{ fontFamily: "JetBrains Mono", fontSize: "0.6rem",
          color: "var(--text2)", display: "flex", gap: 5, alignItems: "center" }}>
          Material
          <select value={material} onChange={(e) => setMaterial(e.target.value)}
            style={{ background: "var(--panel)", border: "1px solid var(--border)",
              color: "var(--text)", fontFamily: "JetBrains Mono",
              fontSize: "0.6rem", padding: "3px 8px", borderRadius: 3 }}>
            {["default","rock","ore","overburden"].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
        <label style={{ fontFamily: "JetBrains Mono", fontSize: "0.6rem",
          color: "var(--text2)", display: "flex", gap: 5, alignItems: "center" }}>
          Seed
          <input type="number" value={seed} min={0} max={9999}
            onChange={(e) => setSeed(Number(e.target.value))}
            style={{ width: 64, background: "var(--panel)", border: "1px solid var(--border)",
              color: "var(--text)", fontFamily: "JetBrains Mono",
              fontSize: "0.65rem", padding: "3px 6px", borderRadius: 3 }} />
        </label>
        <button className="btn-primary" style={{ width: "auto", padding: "6px 16px" }}
          onClick={runSim} disabled={loading}>
          {loading ? "SIMULATING…" : "RUN SIM"}
        </button>

        {/* Playback */}
        {simResult && (
          <>
            <div style={{ flex: 1 }} />
            <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.62rem",
              color: "var(--text2)" }}>
              Step {cursor + 1} / {simResult.log.length}
            </span>
            <button onClick={() => setCursor(0)}
              style={{ background: "var(--panel)", border: "1px solid var(--border)",
                color: "var(--text2)", padding: "4px 10px",
                fontFamily: "JetBrains Mono", fontSize: "0.55rem", cursor: "pointer",
                borderRadius: 3 }}>
              ↩ START
            </button>
            <button onClick={() => setCursor((c) => Math.max(0, c - 1))}
              disabled={cursor === 0}
              style={{ background: "var(--panel)", border: "1px solid var(--border)",
                color: "var(--text2)", padding: "4px 10px",
                fontFamily: "JetBrains Mono", fontSize: "0.55rem", cursor: "pointer",
                borderRadius: 3 }}>
              ◀ PREV
            </button>
            <button onClick={() => setPlaying((p) => !p)}
              style={{ background: playing ? "var(--ore)" : "var(--acid)",
                border: "none", color: "#000", padding: "4px 16px",
                fontFamily: "JetBrains Mono", fontSize: "0.6rem",
                fontWeight: 600, cursor: "pointer", borderRadius: 3 }}>
              {playing ? "⏸ PAUSE" : "▶ PLAY"}
            </button>
            <button
              onClick={() => setCursor((c) => Math.min(simResult.log.length - 1, c + 1))}
              disabled={cursor === simResult.log.length - 1}
              style={{ background: "var(--panel)", border: "1px solid var(--border)",
                color: "var(--text2)", padding: "4px 10px",
                fontFamily: "JetBrains Mono", fontSize: "0.55rem", cursor: "pointer",
                borderRadius: 3 }}>
              NEXT ▶
            </button>
            <input type="range" min={0} max={simResult.log.length - 1} value={cursor}
              onChange={(e) => { setPlaying(false); setCursor(Number(e.target.value)); }}
              style={{ width: 120, accentColor: "var(--acid)" }} />
          </>
        )}
      </div>

      {error && (
        <div style={{ gridColumn: "1 / -1",
          padding: "8px 20px", background: "rgba(255,51,102,0.08)",
          borderBottom: "1px solid rgba(255,51,102,0.25)",
          fontFamily: "JetBrains Mono", fontSize: "0.63rem", color: "#FF3366" }}>
          ⚠ {error}
        </div>
      )}

      {/* ── 3D Terrain Replay ── */}
      <div style={{ position: "relative", overflow: "hidden", background: "#050A0F" }}>
        {replaySurface && simResult ? (
          <Scene3D
            surface={replaySurface}
            mask={simResult.mask}
            entry={simResult.entry}
            dumpMarkers={dumpMarkers}
            camPreset="iso"
          />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", color: "var(--muted)", fontFamily: "JetBrains Mono",
            fontSize: "0.65rem" }}>
            {loading ? "SIMULATING…" : "RUN A SIMULATION TO REPLAY"}
          </div>
        )}

        {/* Overlay KPIs */}
        {currentEntry && (
          <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 8 }}>
            {[
              { label: "Dump",     val: `#${cursor}` },
              { label: "Coverage", val: `${((currentEntry.coverage ?? 0) * 100).toFixed(1)}%` },
              { label: "Volume",   val: `${(currentEntry.volume ?? 0).toFixed(1)}m³` },
              { label: "OK/REJ",   val: `${succeededSoFar}/${rejectedSoFar}` },
            ].map(({ label, val }) => (
              <div key={label} style={{
                background: "rgba(5,10,15,0.85)",
                border: "1px solid var(--border)",
                backdropFilter: "blur(8px)",
                padding: "5px 10px", borderRadius: 4,
              }}>
                <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.5rem",
                  color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  {label}
                </div>
                <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.85rem",
                  color: "var(--acid)", fontWeight: 600 }}>
                  {val}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Decision Log sidebar ── */}
      <div style={{
        borderLeft: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        background: "var(--surface)", overflow: "hidden",
      }}>
        {/* Current decision */}
        {currentEntry && (
          <div style={{
            padding: 14, borderBottom: "1px solid var(--border)",
            background: "var(--panel)",
          }}>
            <div style={{ fontFamily: "Syncopate", fontSize: "0.55rem",
              letterSpacing: "0.2em", color: "var(--muted)", marginBottom: 8,
              textTransform: "uppercase" }}>
              Decision at t={currentEntry.t}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
              {[
                ["Truck",   currentEntry.truck],
                ["Cell",    `(${currentEntry.r},${currentEntry.c})`],
                ["Payload", `${currentEntry.payload_t}t`],
                ["Reach",   currentEntry.reach != null ? currentEntry.reach.toFixed(3) : "—"],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.5rem",
                    color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {k}
                  </div>
                  <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.72rem",
                    color: "var(--text)", marginTop: 1 }}>
                    {v}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10 }}>
              <StatusBadge status={currentEntry.status} />
              {currentEntry.status !== "dumped" && (
                <div style={{ marginTop: 6, fontFamily: "JetBrains Mono",
                  fontSize: "0.58rem", color: "var(--ore)", lineHeight: 1.5 }}>
                  {currentEntry.status === "iso_rejected"
                    ? `⚠ Isolation check failed. Reachability = ${currentEntry.reach?.toFixed(3) ?? "?"}. Cell isolated from haul-road network — truck dispatch blocked for safety.`
                    : currentEntry.status.includes("slope")
                    ? "⚠ Slope violation. Dump height would exceed safe angle-of-repose for this material."
                    : "⚠ Dispatch skipped — no valid cell in scorer output."}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Full log list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div style={{ padding: "8px 14px 4px",
            fontFamily: "Syncopate", fontSize: "0.5rem",
            letterSpacing: "0.18em", color: "var(--muted)", textTransform: "uppercase",
            borderBottom: "1px solid var(--border)" }}>
            Full Decision Log
          </div>
          {simResult?.log.map((entry, idx) => (
            <div
              key={idx}
              onClick={() => setCursor(idx)}
              style={{
                padding: "7px 14px",
                borderBottom: "1px solid rgba(26,48,64,0.4)",
                cursor: "pointer",
                background: idx === cursor
                  ? "rgba(200,255,0,0.06)"
                  : "transparent",
                borderLeft: idx === cursor
                  ? "2px solid var(--acid)"
                  : "2px solid transparent",
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.55rem",
                color: "var(--muted)", minWidth: 24 }}>
                #{idx}
              </span>
              <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.6rem",
                color: "var(--text2)", flex: 1 }}>
                {entry.truck} → ({entry.r},{entry.c})
              </span>
              <StatusBadge status={entry.status} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom summary bar ── */}
      {simResult && (
        <div style={{
          gridColumn: "1 / -1",
          padding: "8px 20px",
          borderTop: "1px solid var(--border)",
          background: "var(--surface)",
          display: "flex", gap: 24, alignItems: "center",
        }}>
          <span style={{ fontFamily: "Syncopate", fontSize: "0.5rem",
            letterSpacing: "0.2em", color: "var(--muted)", textTransform: "uppercase" }}>
            Final Summary
          </span>
          {[
            ["Volume",      `${simResult.summary.total_volume?.toFixed(1)}m³`],
            ["Coverage",    `${simResult.summary.coverage_pct}%`],
            ["Efficiency",  `${simResult.summary.packing_efficiency}%`],
            ["Uniformity",  `${simResult.summary.height_uniformity}`],
            ["Iso Events",  `${simResult.summary.isolation_events}`],
            ["Latency",     `${simResult.summary.latency_ms}ms`],
            ["Policy",      String(simResult.summary.policy).toUpperCase()],
          ].map(([k, v]) => (
            <div key={k as string}>
              <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.48rem",
                color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                {k}
              </div>
              <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.72rem",
                color: "var(--acid)", fontWeight: 600 }}>
                {v}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
