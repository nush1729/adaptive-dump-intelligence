"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import GanttChart, { GanttEntry } from "@/components/scheduling/GanttChart";
import TruckQueue, { TruckQueueEntry } from "@/components/scheduling/TruckQueue";
import PageShell from "@/components/layout/PageShell";
import { RailItem } from "@/components/layout/CollapsedRail";
import { useSimStore } from "@/store/simStore";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface SchedulePayload {
  timeline: GanttEntry[];
  queue: TruckQueueEntry[];
  n_trucks: number;
  total_ticks: number;
}

function StatChip({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="adios-panel px-3 py-2 min-w-[96px]">
      <div className="font-mono text-[1.01rem] uppercase tracking-[0.14em]" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="font-mono text-[1.52rem] font-bold" style={{ color: accent ? "var(--acid)" : "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}

export default function SchedulingPage() {
  // Pull the dashboard's shared sim configuration so dispatch runs reflect
  // the same fleet/material/scoring setup the user configured (mirrors the
  // `dash` selector pattern in audit/page.tsx).
  const dash = useSimStore((s) => ({
    material: s.material,
    isoThreshold: s.isoThreshold,
    minDumpSpacing: s.minDumpSpacing,
    selectedFleet: s.selectedFleet,
    payloadOverrides: s.payloadOverrides,
    customTrucks: s.customTrucks,
    weights: s.weights,
    zoneMode: s.zoneMode,
  }));

  const [data, setData] = useState<SchedulePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const [nDumps, setNDumps] = useState(40);
  const [seed, setSeed] = useState(42);
  const [tick, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [playing, setPlaying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedSeq(null);
    setPlaying(false);
    setTick(0);
    try {
      const r = await fetch(`${API}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material: dash.material,
          n_dumps: nDumps,
          fleet_models: dash.selectedFleet,
          payload_overrides: Object.keys(dash.payloadOverrides).length > 0 ? dash.payloadOverrides : null,
          custom_truck_specs: Object.keys(dash.customTrucks).length > 0 ? dash.customTrucks : null,
          iso_threshold: dash.isoThreshold,
          min_dump_spacing: dash.minDumpSpacing,
          weights: dash.weights,
          zone_mode: dash.zoneMode,
          seed,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} - ${r.statusText}`);
      const d: SchedulePayload = await r.json();
      setData(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [nDumps, seed, dash.material, dash.selectedFleet, dash.payloadOverrides, dash.customTrucks,
      dash.isoThreshold, dash.minDumpSpacing, dash.weights, dash.zoneMode]);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (playing && data) {
      tickRef.current = setInterval(() => {
        setTick((t) => {
          if (t >= data.total_ticks) {
            setPlaying(false);
            return t;
          }
          return t + 1;
        });
      }, 80);
    } else if (tickRef.current) {
      clearInterval(tickRef.current);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [playing, data]);

  const selectedEntry = data?.timeline.find((e) => e.dump_seq === selectedSeq) ?? null;
  const liveDispatches = data ? data.timeline.filter((e) => e.status === "dumped" && e.end_tick <= tick).length : 0;
  const visibleQueue = data
    ? data.queue.map((q) => ({
        ...q,
        status: q.end_tick <= tick ? q.status : tick >= q.start_tick ? "in_progress" : "waiting",
      }))
    : [];
  const totalDumped = data?.timeline.filter((e) => e.status === "dumped").length ?? 0;
  const totalRejected = (data?.timeline.length ?? 0) - totalDumped;

  const controlsPanel = (
    <div className="h-full overflow-y-auto p-4 flex flex-col gap-4">
      <div className="section-label">Dispatch Controls</div>
      <div className="font-mono text-[0.96rem] uppercase tracking-widest" style={{ color: "var(--muted)" }}>
        Fleet, material &amp; scoring synced from Dashboard
      </div>
      <div className="flex flex-col gap-3">
        {[
          { label: "Dumps", min: 10, max: 80, val: nDumps, set: setNDumps },
          { label: "Seed", min: 0, max: 9999, val: seed, set: setSeed },
        ].map(({ label, min, max, val, set }) => (
          <label key={label} className="flex flex-col gap-1 font-mono text-[1.19rem] uppercase tracking-widest" style={{ color: "var(--text2)" }}>
            {label}
            <input
              type="number"
              min={min}
              max={max}
              value={val}
              onChange={(e) => set(Number(e.target.value))}
              className="rounded px-2 py-1 text-sm"
              style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
          </label>
        ))}
      </div>
      <button
        onClick={load}
        disabled={loading}
        className="w-full rounded py-3 text-[1.1rem] font-syncopate tracking-[0.18em] uppercase font-bold transition-all"
        style={{
          background: loading ? "transparent" : "var(--acid)",
          color: loading ? "var(--acid)" : "#000",
          border: loading ? "2px solid var(--acid)" : "none",
          boxShadow: loading ? "none" : "0 0 18px rgba(255,205,17,0.35)",
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Loading…" : "▶ Load Schedule"}
      </button>
      {data && (
        <div className="grid grid-cols-2 gap-2">
          <StatChip label="Trucks" value={data.n_trucks} />
          <StatChip label="Dispatches" value={data.timeline.length} />
          <StatChip label="Dumped" value={totalDumped} accent />
          <StatChip label="Rejected" value={totalRejected} />
          <StatChip label="Ticks" value={data.total_ticks} />
        </div>
      )}
    </div>
  );

  return (
    <PageShell
      leftTitle="Dispatch"
      leftSubtitle="Scheduler"
      leftContent={controlsPanel}
      leftRail={
        <>
          <RailItem label="Truck" value={String(dash.selectedFleet.length)} accent />
          <RailItem label="Dump" value={String(nDumps)} />
          <RailItem label="Seed" value={String(seed)} />
        </>
      }
      rightTitle="Queue"
      rightSubtitle="Truck State"
      rightContent={<TruckQueue queue={visibleQueue} currentTick={tick} liveDispatches={liveDispatches} />}
      rightRail={
        <>
          <RailItem label="Tick" value={String(tick)} accent />
          <RailItem label="Done" value={String(liveDispatches)} />
          <RailItem label="Reject" value={String(totalRejected)} />
        </>
      }
    >
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-4 px-4 lg:px-5 py-3 border-b" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <span className="font-syncopate text-[1.09rem] tracking-[0.2em] uppercase font-bold" style={{ color: "var(--acid)" }}>
            Dispatch Scheduler
          </span>
          <div className="ml-auto font-mono text-[1.16rem] uppercase tracking-widest" style={{ color: "var(--text2)" }}>
            {loading ? "Loading" : data ? `${data.timeline.length} dispatches` : "Awaiting data"}
          </div>
        </div>

        {error && (
          <div className="px-5 py-2 border-b font-mono text-[1.09rem]" style={{ background: "rgba(255,51,102,0.1)", borderColor: "rgba(255,51,102,0.3)", color: "#FF3366" }}>
            API Error: {error} - Is the backend running at <span style={{ color: "var(--acid)" }}>{API}</span>?
          </div>
        )}

        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-2 border-b" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <span className="font-syncopate text-[1.01rem] tracking-[0.18em] uppercase" style={{ color: "var(--muted)" }}>
              Gantt - Dispatch Timeline
            </span>
            {data && (
              <div className="flex items-center gap-2 overflow-x-auto">
                <button
                  onClick={() => { setTick(0); setPlaying(false); }}
                  className="rounded px-3 py-1 font-mono text-[1.13rem] font-bold"
                  style={{ background: "transparent", border: "1px solid var(--acid)", color: "var(--acid)", cursor: "pointer" }}
                >
                  Reset
                </button>
                <button
                  onClick={() => setPlaying((p) => !p)}
                  className="rounded px-4 py-1 font-mono text-[1.19rem] font-bold"
                  style={{
                    background: playing ? "var(--ore)" : "var(--acid)",
                    color: "#000",
                    border: "none",
                    cursor: "pointer",
                    boxShadow: playing ? "0 0 10px rgba(255,107,53,0.4)" : "0 0 14px rgba(255,205,17,0.4)",
                  }}
                >
                  {playing ? "⏸ Pause" : "▶ Play"}
                </button>
                <span className="font-mono text-[1.19rem] min-w-[52px]" style={{ color: "var(--acid)" }}>
                  t = {tick}
                </span>
                <input
                  type="range"
                  min={0}
                  max={data.total_ticks}
                  value={tick}
                  onChange={(e) => { setTick(Number(e.target.value)); setPlaying(false); }}
                  className="w-[120px] accent-[#FFC000]"
                />
              </div>
            )}
          </div>

          <div className="px-4 pt-3">
            {selectedEntry ? (
              <div className="dispatch-detail-card rounded px-4 py-3">
                <div className="text-center font-syncopate text-[1.01rem] tracking-[0.2em] uppercase mb-3" style={{ color: "var(--acid)" }}>
                  Selected Dispatch Event
                </div>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-center">
                  {[
                    ["Truck", selectedEntry.truck_id],
                    ["Seq", `#${selectedEntry.dump_seq}`],
                    ["Payload", `${selectedEntry.payload_t}t`],
                    ["Cell", `(${selectedEntry.r}, ${selectedEntry.c})`],
                    ["Window", `t${selectedEntry.start_tick}->t${selectedEntry.end_tick}`],
                    ["Status", selectedEntry.status.toUpperCase()],
                  ].map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <div className="font-mono text-[0.96rem] uppercase tracking-[0.1em]" style={{ color: "var(--muted)" }}>{k}</div>
                      <div className="font-mono text-[1.33rem] font-bold truncate" style={{ color: selectedEntry.status === "dumped" ? "var(--acid)" : "var(--ore)" }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="adios-panel rounded px-4 py-3 text-center font-mono text-[1.19rem]" style={{ color: "var(--text2)" }}>
                Click any Gantt chart block to inspect dispatch event.
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {data ? (
              <GanttChart timeline={data.timeline} totalTicks={data.total_ticks} selectedSeq={selectedSeq} onSelect={setSelectedSeq} currentTick={tick} />
            ) : (
              <div className="h-48 flex items-center justify-center font-mono text-[1.09rem] tracking-[0.1em]" style={{ color: "var(--muted)" }}>
                {loading ? "Loading schedule..." : error ? "Backend offline" : "No data"}
              </div>
            )}
          </div>

          <div className="border-t px-4 py-2 min-h-[42px] flex items-center justify-center text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <span className="font-mono text-[1.19rem]" style={{ color: "var(--muted)" }}>
              Click any Gantt chart block to inspect dispatch event.
            </span>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
