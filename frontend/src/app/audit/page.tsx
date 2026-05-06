"use client";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import NavBar from "@/components/NavBar";

const Scene3D = dynamic(() => import("@/components/three/Scene3D"), { ssr: false });

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface AuditEntry {
  t:          number;
  truck:      string;
  r:          number;
  c:          number;
  status:     string;
  payload_t:  number;
  reach?:     number | null;
  volume?:    number;
  coverage?:  number;
}

interface SimSnapshot {
  dump_n:    number;
  truck:     string;
  r:         number;
  c:         number;
  volume:    number;
  coverage:  number;
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
  dumped:         "#FFC000",
  iso_rejected:   "#FF5722",
  slope_rejected: "#FF3366",
};
function sc(s: string) { return STATUS_COLOR[s] ?? "#7AA8BC"; }

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      background: sc(status) + "22",
      color: sc(status),
      fontFamily: "JetBrains Mono", fontSize: "0.65rem",
      letterSpacing: "0.1em", textTransform: "uppercase",
      padding: "2px 8px", borderRadius: 3,
      border: `1px solid ${sc(status)}44`,
    }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function KPIOverlay({ label, val }: { label: string; val: string }) {
  return (
    <div style={{
      background: "rgba(5,10,15,0.88)",
      border: "1px solid var(--border)",
      backdropFilter: "blur(8px)",
      padding: "6px 12px", borderRadius: 4,
    }}>
      <div style={{
        fontFamily: "JetBrains Mono", fontSize: "0.55rem",
        color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em",
        marginBottom: 2,
      }}>{label}</div>
      <div style={{
        fontFamily: "JetBrains Mono", fontSize: "0.95rem",
        color: "var(--acid)", fontWeight: 700,
      }}>{val}</div>
    </div>
  );
}

export default function AuditPage() {
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [cursor, setCursor]       = useState<number>(0);
  const [playing, setPlaying]     = useState(false);
  const [seed, setSeed]           = useState(42);
  const [material, setMaterial]   = useState("default");
  const [nDumps, setNDumps]       = useState(60);

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
          material, n_dumps: nDumps,
          fleet_models: ["Cat793", "Cat777", "Cat797", "Cat793"],
          iso_threshold: 0.85, seed, use_ml: false, auto_tune: false,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} — ${r.statusText}`);
      const d = await r.json();
      setSimResult(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [seed, material, nDumps]);

  useEffect(() => { runSim(); }, []);

  // Playback
  useEffect(() => {
    if (!playing || !simResult) return;
    const max = simResult.log.length - 1;
    if (cursor >= max) { setPlaying(false); return; }
    const id = setTimeout(() => setCursor((c) => Math.min(c + 1, max)), 300);
    return () => clearTimeout(id);
  }, [playing, cursor, simResult]);

  // Build progressive surface up to cursor — Gaussian spread for realistic terrain
  const { replaySurface, dumpMarkers } = useMemo(() => {
    if (!simResult) return { replaySurface: null, dumpMarkers: [] };
    const log = simResult.log.slice(0, cursor + 1);
    const ROWS = simResult.surface.length;
    const COLS = simResult.surface[0].length;
    const h: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    const markers: Array<{ r: number; c: number }> = [];

    for (const e of log) {
      if (e.status === "dumped" && e.r >= 0 && e.c >= 0 && e.r < ROWS && e.c < COLS) {
        // Use wider Gaussian spread for realistic dump pile shape
        const radius = 8;
        const sigma = radius * 0.45;
        const sigSq2 = 2 * sigma * sigma;
        const payload = (e.payload_t ?? 200) / 200; // normalise to ~1.0 for Cat793

        for (let dr = -radius; dr <= radius; dr++) {
          for (let dc = -radius; dc <= radius; dc++) {
            const nr = e.r + dr, nc = e.c + dc;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
            if (!simResult.mask[nr][nc]) continue;
            const distSq = dr * dr + dc * dc;
            if (distSq > radius * radius) continue;
            // Gaussian falloff — physically realistic mound shape
            const weight = Math.exp(-distSq / sigSq2) * 0.6 * payload;
            h[nr][nc] += weight;
          }
        }
        markers.push({ r: e.r, c: e.c });
      }
    }

    return { replaySurface: h, dumpMarkers: markers.slice(-6) };
  }, [simResult, cursor]);

  const currentEntry    = simResult?.log[cursor] ?? null;
  const succeededSoFar  = simResult
    ? simResult.log.slice(0, cursor + 1).filter(e => e.status === "dumped").length
    : 0;
  const rejectedSoFar   = cursor + 1 - succeededSoFar;
  const progressPct     = simResult ? Math.round(((cursor + 1) / simResult.log.length) * 100) : 0;

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-[var(--void)] text-[var(--text)]">
      <NavBar />

      <div className="flex flex-col flex-1 overflow-hidden pt-11">

        {/* ── Top control bar ── */}
        <div style={{
          padding: "10px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
          flexShrink: 0,
        }}>
          <span style={{
            fontFamily: "Syncopate", fontSize: "0.75rem",
            letterSpacing: "0.2em", color: "var(--acid)",
            textTransform: "uppercase", fontWeight: 700,
          }}>
            Audit Replay
          </span>

          {/* Config */}
          {[
            {
              label: "Material",
              el: (
                <select
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  style={{
                    background: "var(--panel)", border: "1px solid var(--border)",
                    color: "var(--text)", fontFamily: "JetBrains Mono",
                    fontSize: "0.72rem", padding: "3px 8px", borderRadius: 3,
                    outline: "none",
                  }}
                >
                  {["default", "rock", "ore", "overburden"].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ),
            },
            {
              label: "Dumps",
              el: (
                <input
                  type="number" value={nDumps} min={10} max={150}
                  onChange={(e) => setNDumps(Number(e.target.value))}
                  style={{
                    width: 64, background: "var(--panel)", border: "1px solid var(--border)",
                    color: "var(--text)", fontFamily: "JetBrains Mono",
                    fontSize: "0.75rem", padding: "3px 6px", borderRadius: 3,
                    outline: "none",
                  }}
                />
              ),
            },
            {
              label: "Seed",
              el: (
                <input
                  type="number" value={seed} min={0} max={9999}
                  onChange={(e) => setSeed(Number(e.target.value))}
                  style={{
                    width: 64, background: "var(--panel)", border: "1px solid var(--border)",
                    color: "var(--text)", fontFamily: "JetBrains Mono",
                    fontSize: "0.75rem", padding: "3px 6px", borderRadius: 3,
                    outline: "none",
                  }}
                />
              ),
            },
          ].map(({ label, el }) => (
            <label key={label} style={{
              fontFamily: "JetBrains Mono", fontSize: "0.72rem",
              color: "var(--text2)", display: "flex", gap: 5, alignItems: "center",
            }}>
              {label}
              {el}
            </label>
          ))}

          <button
            onClick={runSim}
            disabled={loading}
            style={{
              background: loading ? "var(--muted)" : "var(--acid)",
              border: "none", color: "#000",
              fontFamily: "Syncopate", fontSize: "0.65rem",
              letterSpacing: "0.15em", textTransform: "uppercase",
              padding: "6px 18px", borderRadius: 3,
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            {loading ? "SIMULATING…" : "▶ RUN SIM"}
          </button>

          {/* Playback controls */}
          {simResult && (
            <>
              <div style={{ flex: 1 }} />
              {/* Progress */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 80, height: 4, background: "var(--border)", borderRadius: 2,
                }}>
                  <div style={{
                    width: `${progressPct}%`, height: "100%",
                    background: "var(--acid)", borderRadius: 2,
                    transition: "width 0.3s",
                  }} />
                </div>
                <span style={{
                  fontFamily: "JetBrains Mono", fontSize: "0.72rem",
                  color: "var(--text2)",
                }}>
                  {cursor + 1}/{simResult.log.length}
                </span>
              </div>
              <button
                onClick={() => setCursor(0)}
                style={btnStyle}
              >↩ START</button>
              <button
                onClick={() => setCursor(c => Math.max(0, c - 1))}
                disabled={cursor === 0}
                style={btnStyle}
              >◀ PREV</button>
              <button
                onClick={() => setPlaying(p => !p)}
                style={{
                  ...btnStyle,
                  background: playing ? "var(--ore)" : "var(--acid)",
                  color: "#000", border: "none", fontWeight: 700,
                }}
              >{playing ? "⏸ PAUSE" : "▶ PLAY"}</button>
              <button
                onClick={() => setCursor(c => Math.min(simResult.log.length - 1, c + 1))}
                disabled={cursor === simResult.log.length - 1}
                style={btnStyle}
              >NEXT ▶</button>
              <input
                type="range" min={0} max={simResult.log.length - 1} value={cursor}
                onChange={(e) => { setPlaying(false); setCursor(Number(e.target.value)); }}
                style={{ width: 120, accentColor: "var(--acid)" }}
              />
            </>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            padding: "8px 20px",
            background: "rgba(255,51,102,0.08)",
            borderBottom: "1px solid rgba(255,51,102,0.25)",
            fontFamily: "JetBrains Mono", fontSize: "0.72rem",
            color: "#FF3366", flexShrink: 0,
          }}>
            ⚠ {error} — Is the backend running at{" "}
            <span style={{ color: "var(--acid)" }}>{API}</span>?
          </div>
        )}

        {/* ── Content grid ── */}
        <div style={{
          flex: 1, display: "grid",
          gridTemplateColumns: "1fr 340px",
          overflow: "hidden",
        }}>

          {/* ── 3D Terrain ── */}
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
              <div style={{
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                height: "100%", gap: 12,
                color: "var(--muted)", fontFamily: "JetBrains Mono",
              }}>
                {loading ? (
                  <>
                    <div style={{
                      width: 48, height: 48, borderRadius: "50%",
                      border: "3px solid var(--border)",
                      borderTopColor: "var(--acid)",
                      animation: "spin 1s linear infinite",
                    }} />
                    <span style={{ fontSize: "0.75rem", letterSpacing: "0.15em" }}>
                      SIMULATING TERRAIN…
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: "0.75rem", letterSpacing: "0.1em" }}>
                    RUN A SIMULATION TO REPLAY
                  </span>
                )}
              </div>
            )}

            {/* KPI Overlay */}
            {currentEntry && (
              <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <KPIOverlay label="Dump"     val={`#${cursor}`} />
                <KPIOverlay label="Coverage" val={`${((currentEntry.coverage ?? 0) * 100).toFixed(1)}%`} />
                <KPIOverlay label="Volume"   val={`${(currentEntry.volume ?? 0).toFixed(1)}m³`} />
                <KPIOverlay label="OK / REJ" val={`${succeededSoFar} / ${rejectedSoFar}`} />
              </div>
            )}
          </div>

          {/* ── Decision Log ── */}
          <div style={{
            borderLeft: "1px solid var(--border)",
            display: "flex", flexDirection: "column",
            background: "var(--surface)", overflow: "hidden",
          }}>
            {/* Current decision detail */}
            {currentEntry && (
              <div style={{
                padding: 14,
                borderBottom: "1px solid var(--border)",
                background: "var(--panel)",
                flexShrink: 0,
              }}>
                <div style={{
                  fontFamily: "Syncopate", fontSize: "0.65rem",
                  letterSpacing: "0.2em", color: "var(--muted)",
                  marginBottom: 10, textTransform: "uppercase",
                }}>
                  Decision at t={currentEntry.t}
                </div>
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr",
                  gap: "6px 12px", marginBottom: 10,
                }}>
                  {[
                    ["Truck",   currentEntry.truck],
                    ["Cell",    `(${currentEntry.r}, ${currentEntry.c})`],
                    ["Payload", `${currentEntry.payload_t}t`],
                    ["Reach",   currentEntry.reach != null ? currentEntry.reach.toFixed(3) : "—"],
                  ].map(([k, v]) => (
                    <div key={k as string}>
                      <div style={{
                        fontFamily: "JetBrains Mono", fontSize: "0.55rem",
                        color: "var(--muted)", textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}>{k}</div>
                      <div style={{
                        fontFamily: "JetBrains Mono", fontSize: "0.78rem",
                        color: "var(--text)", marginTop: 1,
                      }}>{v}</div>
                    </div>
                  ))}
                </div>
                <StatusBadge status={currentEntry.status} />
                {currentEntry.status !== "dumped" && (
                  <div style={{
                    marginTop: 8, fontFamily: "JetBrains Mono",
                    fontSize: "0.65rem", color: "var(--ore)", lineHeight: 1.6,
                  }}>
                    {currentEntry.status === "iso_rejected"
                      ? `⚠ Isolation check failed. Reachability = ${currentEntry.reach?.toFixed(3) ?? "?"}. Cell is isolated from haul-road network — dispatch blocked for safety.`
                      : currentEntry.status.includes("slope")
                      ? "⚠ Slope violation. Dump height would exceed safe angle-of-repose."
                      : "⚠ Dispatch skipped — no valid cell available."}
                  </div>
                )}
              </div>
            )}

            {/* Full log list */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              <div style={{
                padding: "8px 14px 4px",
                fontFamily: "Syncopate", fontSize: "0.55rem",
                letterSpacing: "0.18em", color: "var(--muted)",
                textTransform: "uppercase",
                borderBottom: "1px solid var(--border)",
                position: "sticky", top: 0,
                background: "var(--surface)",
                zIndex: 1,
              }}>
                Full Decision Log ({simResult?.log.length ?? 0} events)
              </div>
              {simResult?.log.map((entry, idx) => (
                <div
                  key={idx}
                  onClick={() => setCursor(idx)}
                  style={{
                    padding: "7px 14px",
                    borderBottom: "1px solid rgba(30,34,37,0.6)",
                    cursor: "pointer",
                    background: idx === cursor ? "rgba(255,192,0,0.05)" : "transparent",
                    borderLeft: idx === cursor ? "2px solid var(--acid)" : "2px solid transparent",
                    display: "flex", alignItems: "center", gap: 8,
                    transition: "background 0.15s",
                  }}
                >
                  <span style={{
                    fontFamily: "JetBrains Mono", fontSize: "0.65rem",
                    color: "var(--muted)", minWidth: 28,
                  }}>#{idx}</span>
                  <span style={{
                    fontFamily: "JetBrains Mono", fontSize: "0.68rem",
                    color: "var(--text2)", flex: 1,
                  }}>
                    {entry.truck} → ({entry.r},{entry.c})
                  </span>
                  <StatusBadge status={entry.status} />
                </div>
              ))}
              {!simResult && !loading && (
                <div style={{
                  padding: 20, textAlign: "center",
                  fontFamily: "JetBrains Mono", fontSize: "0.72rem",
                  color: "var(--muted)",
                }}>
                  Run a simulation to see the decision log.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Bottom Summary ── */}
        {simResult && (
          <div style={{
            padding: "8px 20px",
            borderTop: "1px solid var(--border)",
            background: "var(--surface)",
            display: "flex", gap: 24, alignItems: "center",
            flexWrap: "wrap", flexShrink: 0,
          }}>
            <span style={{
              fontFamily: "Syncopate", fontSize: "0.55rem",
              letterSpacing: "0.2em", color: "var(--muted)",
              textTransform: "uppercase",
            }}>
              Final Summary
            </span>
            {[
              ["Volume",     `${Number(simResult.summary.total_volume ?? 0).toFixed(1)}m³`],
              ["Coverage",   `${simResult.summary.coverage_pct}%`],
              ["Efficiency", `${simResult.summary.packing_efficiency}%`],
              ["Uniformity", `${simResult.summary.height_uniformity}`],
              ["Iso Events", `${simResult.summary.isolation_events}`],
              ["Latency",    `${simResult.summary.latency_ms}ms`],
              ["Policy",     String(simResult.summary.policy ?? "—").toUpperCase()],
            ].map(([k, v]) => (
              <div key={k as string}>
                <div style={{
                  fontFamily: "JetBrains Mono", fontSize: "0.52rem",
                  color: "var(--muted)", textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}>{k}</div>
                <div style={{
                  fontFamily: "JetBrains Mono", fontSize: "0.82rem",
                  color: "var(--acid)", fontWeight: 700,
                }}>{v}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Shared button style
const btnStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  color: "var(--text2)",
  padding: "4px 10px",
  fontFamily: "JetBrains Mono",
  fontSize: "0.72rem",
  cursor: "pointer",
  borderRadius: 3,
};
