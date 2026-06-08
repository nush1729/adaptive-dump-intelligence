"use client";
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import GanttChart, { GanttEntry } from "@/components/scheduling/GanttChart";
import TruckQueue, { TruckQueueEntry } from "@/components/scheduling/TruckQueue";
import PageShell from "@/components/layout/PageShell";
import { RailItem } from "@/components/layout/CollapsedRail";
import { UI_DEFAULTS, STOCK_PAYLOADS_T } from "@/lib/config";

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

/* ── Simulation log entry from /simulate ──────────────────── */
interface SimLogEntry {
  t: number;
  truck: string;
  r: number;
  c: number;
  status: string;
  payload_t: number;
  reach?: number | null;
}

interface SimResult {
  entry: [number, number];
  log: SimLogEntry[];
  summary: Record<string, number | string>;
}

/**
 * Transform /simulate log entries into GanttEntry[] format.
 *
 * The /simulate log has: { t, truck, r, c, status, payload_t }
 * GanttChart expects:     { truck_id, payload_t, start_tick, end_tick, status, r, c, dump_seq }
 *
 * Since /simulate doesn't provide start_tick/end_tick, we derive them:
 *  - Each truck maintains a "free at" tick counter
 *  - Duration = travel_ticks + dump_time
 *  - travel_ticks = Manhattan distance from entry point to (r,c) / 2, clamped [1, 15]
 *  - dump_time = 3 ticks for successful dumps, 1 tick for rejections
 *  - After each event, the truck becomes free at end_tick + 1 (return travel gap)
 */
function buildGanttTimeline(
  log: SimLogEntry[],
  entryPoint: [number, number],
): { timeline: GanttEntry[]; totalTicks: number } {
  const truckFreeAt: Record<string, number> = {};
  const timeline: GanttEntry[] = [];

  for (let i = 0; i < log.length; i++) {
    const ev = log[i];
    const truckId = ev.truck;

    // Initialize truck if first appearance
    if (truckFreeAt[truckId] === undefined) {
      truckFreeAt[truckId] = 0;
    }

    const startTick = truckFreeAt[truckId];

    // Calculate duration based on Manhattan distance from entry to dump cell
    const manhattan = Math.abs(ev.r - entryPoint[0]) + Math.abs(ev.c - entryPoint[1]);
    const travelTicks = Math.max(1, Math.min(15, Math.floor(manhattan / 2)));
    const dumpTime = ev.status === "dumped" ? 3 : 1; // successful dumps take longer
    const duration = travelTicks + dumpTime;

    const endTick = startTick + duration;

    timeline.push({
      truck_id: truckId,
      payload_t: ev.payload_t,
      start_tick: startTick,
      end_tick: endTick,
      status: ev.status,
      r: ev.r,
      c: ev.c,
      dump_seq: i,
    });

    // Truck becomes free after end_tick + return gap (1–2 ticks)
    truckFreeAt[truckId] = endTick + 1;
  }

  const totalTicks = Math.max(
    ...timeline.map((e) => e.end_tick),
    0,
  ) + 5;

  return { timeline, totalTicks };
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
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [timeline, setTimeline] = useState<GanttEntry[]>([]);
  const [totalTicks, setTotalTicks] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedSeq(null);
    setPlaying(false);
    setTick(0);
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
      const d: SimResult = await r.json();
      setSimResult(d);

      // Transform log into GanttEntry[] timeline
      const { timeline: tl, totalTicks: tt } = buildGanttTimeline(d.log, d.entry);
      setTimeline(tl);
      setTotalTicks(tt);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [seed, material, nDumps, useML, selectedFleet, payloadOverrides, isoThreshold, minDumpSpacing, zoneMode]);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (playing && totalTicks > 0) {
      tickRef.current = setInterval(() => {
        setTick((t) => {
          if (t >= totalTicks) {
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
  }, [playing, totalTicks]);

  const selectedEntry = timeline.find((e) => e.dump_seq === selectedSeq) ?? null;
  const liveDispatches = timeline.filter((e) => e.status === "dumped" && e.end_tick <= tick).length;
  const visibleQueue = useMemo(() => {
    // Last known state per truck
    const queue: Record<string, GanttEntry> = {};
    for (const item of timeline) {
      queue[item.truck_id] = item;
    }
    return Object.values(queue)
      .sort((a, b) => a.truck_id.localeCompare(b.truck_id))
      .map((q) => ({
        ...q,
        status: q.end_tick <= tick ? q.status : tick >= q.start_tick ? "in_progress" : "waiting",
      }));
  }, [timeline, tick]);

  const totalDumped = timeline.filter((e) => e.status === "dumped").length;
  const totalRejected = timeline.length - totalDumped;

  const controlsPanel = (
    <div className="h-full overflow-y-auto p-4 flex flex-col gap-4">
      <div className="section-label">Dispatch Controls</div>

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
        {loading ? "Simulating…" : "▶ Run Simulation"}
      </button>
      {timeline.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <StatChip label="Trucks" value={new Set(timeline.map(e => e.truck_id)).size} />
          <StatChip label="Dispatches" value={timeline.length} />
          <StatChip label="Dumped" value={totalDumped} accent />
          <StatChip label="Rejected" value={totalRejected} />
          <StatChip label="Ticks" value={totalTicks} />
          <StatChip label="Policy" value={String(simResult?.summary?.policy ?? "--").toUpperCase()} />
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
          <RailItem label="Fleet" value={String(selectedFleet.length)} accent />
          <RailItem label="Dump" value={String(nDumps)} />
          <RailItem label="Seed" value={String(seed)} />
          <RailItem label="Mat" value={material.slice(0, 3)} />
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
          {simResult && (
            <span className="ml-2 rounded px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.1em]" style={{ background: "rgba(255,192,0,0.15)", color: "var(--acid)", border: "1px solid var(--acid)" }}>
              {String(simResult.summary?.policy ?? "heuristic").replace(/_/g, " ")}
            </span>
          )}
          <div className="ml-auto font-mono text-[0.7rem] uppercase tracking-widest" style={{ color: "var(--text2)" }}>
            {loading ? "Simulating" : timeline.length > 0 ? `${timeline.length} dispatches` : "Awaiting data"}
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
            {timeline.length > 0 && (
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
                  max={totalTicks}
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
            {timeline.length > 0 ? (
              <GanttChart timeline={timeline} totalTicks={totalTicks} selectedSeq={selectedSeq} onSelect={setSelectedSeq} currentTick={tick} />
            ) : (
              <div className="h-48 flex items-center justify-center font-mono text-[0.75rem] tracking-[0.1em]" style={{ color: "var(--muted)" }}>
                {loading ? "Running simulation..." : error ? "Backend offline" : "No data"}
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
