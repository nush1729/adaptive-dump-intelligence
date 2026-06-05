"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import GanttChart, { GanttEntry } from "@/components/scheduling/GanttChart";
import TruckQueue, { TruckQueueEntry } from "@/components/scheduling/TruckQueue";
import PageShell from "@/components/layout/PageShell";
import { RailItem } from "@/components/layout/CollapsedRail";

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
      <div className="font-mono text-[0.58rem] uppercase tracking-[0.14em]" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="font-mono text-[1.05rem] font-bold" style={{ color: accent ? "var(--acid)" : "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}

export default function SchedulingPage() {
  const [data, setData] = useState<SchedulePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const [nTrucks, setNTrucks] = useState(4);
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
      const r = await fetch(`${API}/schedule?n_trucks=${nTrucks}&n_dumps=${nDumps}&seed=${seed}`);
      if (!r.ok) throw new Error(`HTTP ${r.status} - ${r.statusText}`);
      const d: SchedulePayload = await r.json();
      setData(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [nTrucks, nDumps, seed]);

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
      <div className="flex flex-col gap-3">
        {[
          { label: "Trucks", min: 2, max: 8, val: nTrucks, set: setNTrucks },
          { label: "Dumps", min: 10, max: 80, val: nDumps, set: setNDumps },
          { label: "Seed", min: 0, max: 9999, val: seed, set: setSeed },
        ].map(({ label, min, max, val, set }) => (
          <label key={label} className="flex flex-col gap-1 font-mono text-[0.72rem] uppercase tracking-widest" style={{ color: "var(--text2)" }}>
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
        className="w-full rounded py-3 text-[0.76rem] font-syncopate tracking-[0.18em] uppercase font-bold transition-all"
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
          <RailItem label="Truck" value={String(nTrucks)} accent />
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
          <span className="font-syncopate text-[0.75rem] tracking-[0.2em] uppercase font-bold" style={{ color: "var(--acid)" }}>
            Dispatch Scheduler
          </span>
          <div className="ml-auto font-mono text-[0.7rem] uppercase tracking-widest" style={{ color: "var(--text2)" }}>
            {loading ? "Loading" : data ? `${data.timeline.length} dispatches` : "Awaiting data"}
          </div>
        </div>

        {error && (
          <div className="px-5 py-2 border-b font-mono text-[0.75rem]" style={{ background: "rgba(255,51,102,0.1)", borderColor: "rgba(255,51,102,0.3)", color: "#FF3366" }}>
            API Error: {error} - Is the backend running at <span style={{ color: "var(--acid)" }}>{API}</span>?
          </div>
        )}

        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-2 border-b" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <span className="font-syncopate text-[0.58rem] tracking-[0.18em] uppercase" style={{ color: "var(--muted)" }}>
              Gantt - Dispatch Timeline
            </span>
            {data && (
              <div className="flex items-center gap-2 overflow-x-auto">
                <button
                  onClick={() => { setTick(0); setPlaying(false); }}
                  className="rounded px-3 py-1 font-mono text-[0.68rem] font-bold"
                  style={{ background: "transparent", border: "1px solid var(--acid)", color: "var(--acid)", cursor: "pointer" }}
                >
                  Reset
                </button>
                <button
                  onClick={() => setPlaying((p) => !p)}
                  className="rounded px-4 py-1 font-mono text-[0.72rem] font-bold"
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
                <span className="font-mono text-[0.72rem] min-w-[52px]" style={{ color: "var(--acid)" }}>
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
                <div className="text-center font-syncopate text-[0.58rem] tracking-[0.2em] uppercase mb-3" style={{ color: "var(--acid)" }}>
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
                      <div className="font-mono text-[0.52rem] uppercase tracking-[0.1em]" style={{ color: "var(--muted)" }}>{k}</div>
                      <div className="font-mono text-[0.86rem] font-bold truncate" style={{ color: selectedEntry.status === "dumped" ? "var(--acid)" : "var(--ore)" }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="adios-panel rounded px-4 py-3 text-center font-mono text-[0.72rem]" style={{ color: "var(--text2)" }}>
                Click any Gantt chart block to inspect dispatch event.
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {data ? (
              <GanttChart timeline={data.timeline} totalTicks={data.total_ticks} selectedSeq={selectedSeq} onSelect={setSelectedSeq} currentTick={tick} />
            ) : (
              <div className="h-48 flex items-center justify-center font-mono text-[0.75rem] tracking-[0.1em]" style={{ color: "var(--muted)" }}>
                {loading ? "Loading schedule..." : error ? "Backend offline" : "No data"}
              </div>
            )}
          </div>

          <div className="border-t px-4 py-2 min-h-[42px] flex items-center justify-center text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <span className="font-mono text-[0.72rem]" style={{ color: "var(--muted)" }}>
              Click any Gantt chart block to inspect dispatch event.
            </span>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
