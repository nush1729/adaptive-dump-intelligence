"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import NavBar from "@/components/NavBar";
import GanttChart, { GanttEntry } from "@/components/scheduling/GanttChart";
import TruckQueue, { TruckQueueEntry } from "@/components/scheduling/TruckQueue";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface SchedulePayload {
  timeline:    GanttEntry[];
  queue:       TruckQueueEntry[];
  n_trucks:    number;
  total_ticks: number;
}

function StatChip({ label, value, accent = false }: {
  label: string; value: string | number; accent?: boolean;
}) {
  return (
    <div style={{
      background: "var(--panel)",
      border: "1px solid var(--border)",
      borderRadius: 4,
      padding: "8px 14px",
      minWidth: 100,
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, ${accent ? "var(--acid)" : "var(--muted)"}, transparent)`,
      }} />
      <div style={{
        fontFamily: "JetBrains Mono", fontSize: "0.6rem",
        letterSpacing: "0.15em", textTransform: "uppercase",
        color: "var(--muted)", marginBottom: 4,
      }}>{label}</div>
      <div style={{
        fontFamily: "JetBrains Mono", fontSize: "1.2rem",
        fontWeight: 700,
        color: accent ? "var(--acid)" : "var(--text)",
      }}>{value}</div>
    </div>
  );
}

export default function SchedulingPage() {
  const [data, setData]               = useState<SchedulePayload | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const [nTrucks, setNTrucks]         = useState(4);
  const [nDumps, setNDumps]           = useState(40);
  const [seed, setSeed]               = useState(42);
  const [tick, setTick]               = useState(0);
  const tickRef                       = useRef<ReturnType<typeof setInterval> | null>(null);
  const [playing, setPlaying]         = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedSeq(null);
    setPlaying(false);
    setTick(0);
    try {
      const r = await fetch(
        `${API}/schedule?n_trucks=${nTrucks}&n_dumps=${nDumps}&seed=${seed}`
      );
      if (!r.ok) throw new Error(`HTTP ${r.status} — ${r.statusText}`);
      const d: SchedulePayload = await r.json();
      setData(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [nTrucks, nDumps, seed]);

  useEffect(() => { load(); }, []);

  // Play/pause ticker
  useEffect(() => {
    if (playing && data) {
      tickRef.current = setInterval(() => {
        setTick((t) => {
          if (t >= data.total_ticks) { setPlaying(false); return t; }
          return t + 1;
        });
      }, 80);
    } else {
      if (tickRef.current) clearInterval(tickRef.current);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [playing, data]);

  const selectedEntry = data?.timeline.find((e) => e.dump_seq === selectedSeq) ?? null;

  const liveDispatches = data
    ? data.timeline.filter((e) => e.status === "dumped" && e.end_tick <= tick).length
    : 0;

  const visibleQueue = data
    ? data.queue.map((q) => ({
        ...q,
        status: q.end_tick <= tick ? q.status : tick >= q.start_tick ? "in_progress" : "waiting",
      }))
    : [];

  const totalDumped   = data?.timeline.filter(e => e.status === "dumped").length ?? 0;
  const totalRejected = (data?.timeline.length ?? 0) - totalDumped;

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-[var(--void)] text-[var(--text)]">
      <NavBar />

      {/* Page content below nav */}
      <div className="flex flex-col flex-1 overflow-hidden pt-11">

        {/* ── Top control bar ── */}
        <div style={{
          padding: "10px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
          flexShrink: 0,
        }}>
          <span style={{
            fontFamily: "Syncopate", fontSize: "0.75rem",
            letterSpacing: "0.2em", color: "var(--acid)",
            textTransform: "uppercase", fontWeight: 700,
          }}>
            Dispatch Scheduler
          </span>

          {/* Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {[
              { label: "Trucks", min: 2, max: 8,    val: nTrucks, set: setNTrucks },
              { label: "Dumps",  min: 10, max: 80,  val: nDumps,  set: setNDumps },
              { label: "Seed",   min: 0,  max: 9999, val: seed,   set: setSeed },
            ].map(({ label, min, max, val, set }) => (
              <label key={label} style={{
                fontFamily: "JetBrains Mono", fontSize: "0.72rem", color: "var(--text2)",
                display: "flex", alignItems: "center", gap: 5,
              }}>
                {label}
                <input
                  type="number" min={min} max={max} value={val}
                  onChange={(e) => set(Number(e.target.value))}
                  style={{
                    width: 60, background: "var(--panel)", border: "1px solid var(--border)",
                    color: "var(--text)", fontFamily: "JetBrains Mono", fontSize: "0.75rem",
                    padding: "3px 6px", borderRadius: 3, textAlign: "right",
                    outline: "none",
                  }}
                />
              </label>
            ))}
            <button
              onClick={load}
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
              {loading ? "LOADING…" : "▶ LOAD"}
            </button>
          </div>

          {/* Stats */}
          {data && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
              <StatChip label="Trucks"     value={data.n_trucks} />
              <StatChip label="Dispatches" value={data.timeline.length} />
              <StatChip label="Dumped"     value={totalDumped}    accent />
              <StatChip label="Rejected"   value={totalRejected} />
              <StatChip label="Ticks"      value={data.total_ticks} />
            </div>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            padding: "8px 20px",
            background: "rgba(255,51,102,0.1)",
            borderBottom: "1px solid rgba(255,51,102,0.3)",
            fontFamily: "JetBrains Mono", fontSize: "0.75rem", color: "#FF3366",
            flexShrink: 0,
          }}>
            ⚠ API Error: {error} — Is the backend running at{" "}
            <span style={{ color: "var(--acid)" }}>{API}</span>?
          </div>
        )}

        {/* ── Main content ── */}
        <div style={{
          flex: 1, display: "grid",
          gridTemplateColumns: "1fr 280px",
          overflow: "hidden",
        }}>

          {/* ── Gantt panel ── */}
          <div style={{
            display: "flex", flexDirection: "column",
            borderRight: "1px solid var(--border)",
            overflow: "hidden",
          }}>
            {/* Gantt toolbar */}
            <div style={{
              padding: "10px 16px",
              borderBottom: "1px solid var(--border)",
              display: "flex", alignItems: "center",
              justifyContent: "space-between", gap: 10,
              background: "var(--surface)", flexShrink: 0,
            }}>
              <span style={{
                fontFamily: "Syncopate", fontSize: "0.6rem",
                letterSpacing: "0.2em", textTransform: "uppercase",
                color: "var(--muted)",
              }}>
                Gantt — Dispatch Timeline
              </span>

              {data && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    onClick={() => { setTick(0); setPlaying(false); }}
                    style={{
                      background: "var(--panel)", border: "1px solid var(--border)",
                      color: "var(--text2)", padding: "3px 10px",
                      fontFamily: "JetBrains Mono", fontSize: "0.72rem", cursor: "pointer",
                      borderRadius: 3,
                    }}
                  >↩ RESET</button>
                  <button
                    onClick={() => setPlaying((p) => !p)}
                    style={{
                      background: playing ? "var(--ore)" : "var(--acid)",
                      border: "none", color: "#000", padding: "3px 14px",
                      fontFamily: "JetBrains Mono", fontSize: "0.72rem",
                      fontWeight: 700, cursor: "pointer", borderRadius: 3,
                    }}
                  >{playing ? "⏸ PAUSE" : "▶ PLAY"}</button>
                  <span style={{
                    fontFamily: "JetBrains Mono", fontSize: "0.72rem",
                    color: "var(--acid)", minWidth: 52,
                  }}>
                    t = {tick}
                  </span>
                  <input
                    type="range" min={0} max={data.total_ticks} value={tick}
                    onChange={(e) => { setTick(Number(e.target.value)); setPlaying(false); }}
                    style={{ width: 120, accentColor: "var(--acid)" }}
                  />
                </div>
              )}
            </div>

            {/* Gantt chart */}
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px" }}>
              {data ? (
                <GanttChart
                  timeline={data.timeline}
                  totalTicks={data.total_ticks}
                  selectedSeq={selectedSeq}
                  onSelect={setSelectedSeq}
                />
              ) : (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  height: 200, color: "var(--muted)", fontFamily: "JetBrains Mono",
                  fontSize: "0.75rem", letterSpacing: "0.1em",
                }}>
                  {loading ? "LOADING SCHEDULE…" : error ? "BACKEND OFFLINE" : "NO DATA"}
                </div>
              )}
            </div>

            {/* Detail panel */}
            <div style={{
              borderTop: "1px solid var(--border)",
              background: "var(--surface)",
              padding: "10px 16px",
              minHeight: 72,
              display: "flex", alignItems: "center", gap: 20,
              flexShrink: 0,
            }}>
              {selectedEntry ? (
                <>
                  <span style={{
                    fontFamily: "Syncopate", fontSize: "0.6rem",
                    letterSpacing: "0.2em", color: "var(--muted)", textTransform: "uppercase",
                  }}>Selected</span>
                  {[
                    ["Truck",   selectedEntry.truck_id],
                    ["Seq",     `#${selectedEntry.dump_seq}`],
                    ["Payload", `${selectedEntry.payload_t}t`],
                    ["Cell",    `(${selectedEntry.r}, ${selectedEntry.c})`],
                    ["Window",  `t${selectedEntry.start_tick}→t${selectedEntry.end_tick}`],
                    ["Status",  selectedEntry.status.toUpperCase()],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div style={{
                        fontFamily: "JetBrains Mono", fontSize: "0.52rem",
                        color: "var(--muted)", textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}>{k}</div>
                      <div style={{
                        fontFamily: "JetBrains Mono", fontSize: "0.78rem",
                        color: selectedEntry.status === "dumped" ? "var(--acid)" : "var(--ore)",
                        fontWeight: 600,
                      }}>{v}</div>
                    </div>
                  ))}
                </>
              ) : (
                <span style={{
                  fontFamily: "JetBrains Mono", fontSize: "0.72rem",
                  color: "var(--muted)",
                }}>
                  Click any bar in the Gantt chart to inspect a dispatch event.
                </span>
              )}
            </div>
          </div>

          {/* ── Truck Queue Sidebar ── */}
          <div style={{
            padding: "10px 12px",
            overflowY: "auto",
            background: "var(--surface)",
          }}>
            <TruckQueue
              queue={visibleQueue}
              currentTick={tick}
              liveDispatches={liveDispatches}
            />
          </div>

        </div>
      </div>
    </div>
  );
}
