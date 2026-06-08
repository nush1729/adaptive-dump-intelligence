"use client";
import React, { useEffect, useState, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSimStore } from "@/store/simStore";
import BenchmarkPanel from "@/components/dashboard/BenchmarkPanel";
import Compare3D from "@/components/dashboard/Compare3D";
import ControlPanel from "@/components/dashboard/ControlPanel";
import MetricsPanel from "@/components/dashboard/MetricsPanel";
import TrendChart from "@/components/dashboard/TrendChart";
import FleetEfficiencyChart from "@/components/dashboard/FleetEfficiencyChart";
import ROIPanel from "@/components/dashboard/ROIPanel";
import PageShell from "@/components/layout/PageShell";
import Toaster from "@/components/ui/Toaster";
import { RailItem } from "@/components/layout/CollapsedRail";
import { runSimulation, tuneWeights, fetchHealth, createWebSocket, uploadTerrainCsv } from "@/lib/api";
import type { WsMessage, DumpSnapshot, DumpEvent } from "@/types/adios";

// Dynamic import to avoid SSR issues with Three.js
const Scene3D = dynamic(() => import("@/components/three/Scene3D"), { ssr: false });

/* Score colour ramp shared by the canvas renderer and the legend swatches —
   keeping one source of truth means the legend always matches what's drawn. */
const SCORE_RAMP: [number, [number, number, number]][] = [
  [0.0,  [255, 87, 34]],   // red-orange  — penalised / avoid
  [0.5,  [255, 192, 0]],   // amber       — marginal
  [1.0,  [128, 255, 0]],   // green       — top candidate
];
function rampColor(t: number): [number, number, number] {
  const tt = Math.max(0, Math.min(1, t));
  for (let i = 0; i < SCORE_RAMP.length - 1; i++) {
    const [t0, c0] = SCORE_RAMP[i];
    const [t1, c1] = SCORE_RAMP[i + 1];
    if (tt >= t0 && tt <= t1) {
      const f = (tt - t0) / (t1 - t0 || 1);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return SCORE_RAMP[SCORE_RAMP.length - 1][1];
}

const SCORE_BANDS = [
  { label: "Penalised / Avoid", lo: 0.0, hi: 0.33, color: "#FF5722", desc: "Far from entry, already tall, or near a constraint violation" },
  { label: "Marginal", lo: 0.33, hi: 0.66, color: "#FFC000", desc: "Acceptable but not optimal — usable as fallback cells" },
  { label: "Top Candidate", lo: 0.66, hi: 1.0, color: "#80FF00", desc: "Near entry, low accumulated height — the planner's preferred dispatch target" },
];

function HeatmapView({ scoreMap, mask }: { scoreMap: (number | null)[][] | null; mask: boolean[][] | null }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ r: number; c: number; v: number; x: number; y: number } | null>(null);
  const [stats, setStats] = useState<{ min: number; max: number; median: number; bandCounts: number[]; total: number } | null>(null);

  useEffect(() => {
    if (!scoreMap || !mask || !canvasRef.current) { setStats(null); return; }
    const canvas = canvasRef.current;
    const ROWS = scoreMap.length, COLS = scoreMap[0].length;
    canvas.width = COLS; canvas.height = ROWS;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(COLS, ROWS);
    let mn = Infinity, mx = -Infinity;
    const values: number[] = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const v = scoreMap[r][c];
        if (v != null && isFinite(v) && mask[r][c]) {
          if (v < mn) mn = v;
          if (v > mx) mx = v;
          values.push(v);
        }
      }
    const rng = mx - mn || 1;
    const bandCounts = [0, 0, 0];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = (r * COLS + c) * 4;
        const v = scoreMap[r][c];
        if (v == null || !mask[r][c]) {
          img.data[idx] = 10; img.data[idx+1] = 12; img.data[idx+2] = 15; img.data[idx+3] = 255;
        } else {
          const t = (v - mn) / rng;
          const [rr, gg, bb] = rampColor(t);
          img.data[idx] = rr; img.data[idx+1] = gg; img.data[idx+2] = bb; img.data[idx+3] = 255;
          bandCounts[t < 0.33 ? 0 : t < 0.66 ? 1 : 2]++;
        }
      }
    }
    ctx.putImageData(img, 0, 0);

    values.sort((a, b) => a - b);
    const median = values.length ? values[Math.floor(values.length / 2)] : 0;
    setStats({ min: mn, max: mx, median, bandCounts, total: values.length });
  }, [scoreMap, mask]);

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!scoreMap || !mask) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const ROWS = scoreMap.length, COLS = scoreMap[0].length;
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * COLS);
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * ROWS);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) { setHover(null); return; }
    const v = scoreMap[r][c];
    if (v == null || !mask[r][c]) { setHover(null); return; }
    const wrapRect = wrapRef.current?.getBoundingClientRect();
    setHover({
      r, c, v,
      x: e.clientX - (wrapRect?.left ?? 0),
      y: e.clientY - (wrapRect?.top ?? 0),
    });
  };

  return (
    <div className="h-full flex flex-col bg-[#050608]">
      <div className="flex flex-col gap-3 px-6 py-4 border-b" style={{ background: "rgba(10,12,15,0.78)", borderColor: "var(--border)" }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-syncopate text-[1.13rem] uppercase tracking-[0.2em]" style={{ color: "var(--acid)" }}>
              Score Map — Dispatch Suitability
            </div>
            <div className="font-mono text-[1.0rem] mt-1 max-w-2xl leading-relaxed" style={{ color: "var(--text2)" }}>
              Each cell shows the planner's computed score for dumping there next: a weighted blend of
              proximity to the haul-road entry, accumulated pile height, slope/uniformity penalties, and
              isolation-safety constraints. <strong style={{ color: "var(--text)" }}>Brighter green = higher score = preferred target.</strong> Hover
              any cell to inspect its exact value and grid coordinates.
            </div>
          </div>
        </div>

        {/* Legend: gradient bar with numeric tick labels + discrete band breakdown */}
        {stats && (
          <div className="flex flex-col gap-2.5 mt-1">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[0.86rem] uppercase tracking-[0.08em] shrink-0" style={{ color: "var(--muted)" }}>Score scale</span>
              <div className="relative flex-1 max-w-md h-3 rounded-full overflow-hidden" style={{ background: "linear-gradient(90deg, #FF5722 0%, #FFC000 50%, #80FF00 100%)" }} />
              <div className="flex items-center gap-4 font-mono text-[0.86rem] shrink-0" style={{ color: "var(--text2)" }}>
                <span>min <strong style={{ color: "#FF5722" }}>{stats.min.toFixed(2)}</strong></span>
                <span>median <strong style={{ color: "#FFC000" }}>{stats.median.toFixed(2)}</strong></span>
                <span>max <strong style={{ color: "#80FF00" }}>{stats.max.toFixed(2)}</strong></span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
              {SCORE_BANDS.map((b, i) => (
                <div key={b.label} className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: b.color, boxShadow: `0 0 8px ${b.color}66` }} />
                  <span className="font-mono text-[0.86rem]" style={{ color: "var(--text)" }}>
                    {b.label} <span style={{ color: "var(--muted)" }}>— {b.desc}</span>
                  </span>
                  <span className="font-mono text-[0.86rem] font-bold" style={{ color: b.color }}>
                    {stats.total > 0 ? ((stats.bandCounts[i] / stats.total) * 100).toFixed(0) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div ref={wrapRef} className="relative flex-1 flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 adios-grid-overlay opacity-10" />
        <div className="absolute inset-10 rounded" style={{ background: "radial-gradient(circle at center, rgba(255,192,0,0.08), transparent 58%)" }} />
      {scoreMap ? (
          <div className="relative rounded border p-3 shadow-2xl" style={{ background: "rgba(14,17,21,0.82)", borderColor: "rgba(255,192,0,0.24)", boxShadow: "0 24px 80px rgba(0,0,0,0.42)" }}>
            <canvas
              ref={canvasRef}
              onMouseMove={handleMove}
              onMouseLeave={() => setHover(null)}
              className="block w-[min(68vw,70vh)] h-[min(68vw,70vh)] rounded [image-rendering:pixelated] cursor-crosshair"
              style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }}
            />
          </div>
      ) : (
          <div className="adios-panel px-6 py-5 text-center">
            <span className="text-[#6b7280] font-mono text-sm">Run simulation to see score heatmap</span>
          </div>
      )}
        {/* Hover tooltip — exact score + coordinates, follows cursor */}
        {hover && (
          <div
            className="absolute pointer-events-none rounded border px-3 py-2 font-mono text-[0.86rem] z-30 shadow-xl"
            style={{
              left: Math.min(hover.x + 16, (wrapRef.current?.clientWidth ?? 0) - 190),
              top: Math.max(hover.y - 56, 8),
              background: "rgba(10,12,16,0.96)",
              border: "1px solid rgba(255,192,0,0.35)",
              color: "var(--text)",
              minWidth: 170,
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: `rgb(${rampColor((hover.v - (stats?.min ?? 0)) / ((stats ? stats.max - stats.min : 1) || 1)).join(",")})` }} />
              <span style={{ color: "var(--acid)", fontWeight: 700 }}>score {hover.v.toFixed(3)}</span>
            </div>
            <div style={{ color: "var(--muted)" }}>cell (row {hover.r}, col {hover.c})</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const {
    material, nDumps, isoThreshold, minDumpSpacing, seed, selectedFleet, payloadOverrides, customTrucks, weights,
    useML, zoneMode, dataSource, setDataSource, terrainCsvId, terrainCsvMeta, setTerrainCsv, isRunning, result, liveSurface, liveLog,
    health, setHealth, setResult, setIsRunning, setProgress, resetLive,
    setLiveSurface, appendLog, appendVolume, appendSnapshot, appendAnomaly, liveAnomalies, setLiveWhy, liveWhy, setLiveDumpStage,
    liveZones, setLiveZones, pushToast,
    supervisorPaused, setSupervisorPaused, supervisorStepDelay, setSupervisorStepDelay,
    activeView, setActiveView, showStatic, setWeights, lastRunPolicy, setLastRunPolicy,
  } = useSimStore();

  const [isTuning, setIsTuning] = useState(false);
  const [camPreset, setCamPreset] = useState<"iso" | "top" | "front">("iso");
  const [wireframe, setWireframe] = useState(false);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const csvInputRef = React.useRef<HTMLInputElement>(null);
  const liveWsRef = React.useRef<WebSocket | null>(null);

  const handleCsvUpload = useCallback(async (file: File) => {
    setCsvUploading(true);
    setCsvError(null);
    try {
      const meta = await uploadTerrainCsv(file);
      setTerrainCsv(meta.terrain_id, meta);
      setDataSource("live_csv");
      pushToast({ level: "info", title: "Terrain CSV staged",
        detail: `${meta.rows}×${meta.cols} grid · ${meta.active_cells} active cells · height ${meta.height_range_m[0].toFixed(1)}–${meta.height_range_m[1].toFixed(1)}m` });
    } catch (err: any) {
      const msg = err?.message || "upload failed";
      setCsvError(msg);
      pushToast({ level: "error", title: "CSV upload failed", detail: msg });
    } finally {
      setCsvUploading(false);
    }
  }, [setTerrainCsv, setDataSource, pushToast]);

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => {});
  }, [setHealth]);

  const currentSurface = liveSurface
    ?? (showStatic ? result?.static_surface : result?.surface)
    ?? null;
  const currentMask = result?.mask ?? null;
  const currentEntry = result?.entry ?? null;
  const currentZones = liveZones ?? result?.zone_layout?.zones ?? null;

  const handleRun = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    resetLive();
    setLastRunPolicy(null);

    const cfg = {
      material, n_dumps: nDumps, iso_threshold: isoThreshold, min_dump_spacing: minDumpSpacing, seed,
      fleet_models: selectedFleet,
      payload_overrides: Object.keys(payloadOverrides).length > 0 ? payloadOverrides : null,
      custom_truck_specs: Object.keys(customTrucks).length > 0 ? customTrucks : null,
      weights, use_ml: useML, zone_mode: zoneMode,
      terrain_csv_id: dataSource === "live_csv" ? terrainCsvId : null,
    };

    // Step 1: Stream via WebSocket for live terrain updates
    let wsOk = false;
    try {
      await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>;
        const finish = (fn: () => void) => {
          clearTimeout(timer);
          ws.close();
          liveWsRef.current = null;
          setSupervisorPaused(false);
          fn();
        };
        const ws = createWebSocket(cfg, (msg: WsMessage) => {
          if (msg.type === "dump") {
            appendVolume(msg.volume!);
            if (msg.full_surface) setLiveSurface(msg.full_surface);
            appendSnapshot({ dump_n: msg.dump!, truck: msg.truck!, r: msg.r!,
              c: msg.c!, volume: msg.volume!, coverage: msg.coverage!,
              efficiency: msg.efficiency!, policy: msg.policy });
            appendLog({ t: msg.dump!, truck: msg.truck!, r: msg.r!, c: msg.c!,
              status: "dumped", payload_t: msg.payload_t!, volume: msg.volume!,
              coverage: msg.coverage!, gps_fix: msg.gps_fix, dump_stage: msg.dump_stage, why: msg.why });
            if (msg.why) setLiveWhy(msg.why);
            if (msg.dump_stage) setLiveDumpStage(msg.dump_stage);
            setProgress((msg.dump! + 1) / nDumps * 100);
          } else if (msg.type === "rejected") {
            appendLog({ t: msg.dump!, truck: "—", r: msg.r!, c: msg.c!,
              status: `iso_rejected(${msg.reach?.toFixed(2)})`,
              payload_t: 0, volume: 0, coverage: 0 });
            pushToast({ level: "warn", title: "Isolation rejected",
              detail: `dump #${msg.dump} at (${msg.r},${msg.c}) — reachability ${msg.reach?.toFixed(2)} below threshold` });
          } else if (msg.type === "deadlock") {
            pushToast({ level: "error", title: "Deadlock resolved",
              detail: `scheduler broke a reservation cycle — force-released ${msg.trucks?.join(", ") || "stuck truck(s)"}` });
          } else if (msg.type === "anomaly") {
            appendAnomaly({ tick: msg.tick!, metric: msg.metric!, value: msg.value!,
              zscore: msg.zscore!, message: msg.message! });
            if (Math.abs(msg.zscore ?? 0) >= 3) {
              pushToast({ level: "warn", title: "Anomaly detected",
                detail: msg.message || `${msg.metric} z-score ${msg.zscore?.toFixed(2)}` });
            }
          } else if (msg.type === "zone_layout") {
            if (msg.zones) setLiveZones(msg.zones);
          } else if (msg.type === "control_ack") {
            if (msg.action === "pause") setSupervisorPaused(true);
            else if (msg.action === "resume") setSupervisorPaused(false);
          } else if (msg.type === "done") {
            wsOk = true;
            finish(resolve);
          } else if (msg.type === "error") {
            finish(() => reject(new Error(msg.msg)));
          }
        });
        ws.onerror = () => finish(() => reject(new Error("ws_error")));
        timer = setTimeout(() => { if (!wsOk) finish(() => reject(new Error("timeout"))); }, 30000);
        liveWsRef.current = ws;
      });
    } catch (_) {}

    // Step 2: Always call HTTP for authoritative final result
    // (includes surfaces, summary, static baseline — the complete package)
    try {
      const data = await runSimulation(cfg);
      setResult(data);
      // Set the ACTUAL policy that was used (from backend response)
      const actualPolicy = data?.summary?.policy;
      if (typeof actualPolicy === "string") {
        setLastRunPolicy(actualPolicy);
      }
      // Only append snapshots/logs if WS didn't already stream them
      if (!wsOk) {
        data.snapshots?.forEach((s: DumpSnapshot) => appendSnapshot(s));
        data.log?.forEach((e: DumpEvent) => appendLog(e));
        data.snapshots?.forEach((s: DumpSnapshot) => appendVolume(s.volume));
      }
      setProgress(100);
    } catch (err) {
      console.error("Simulation failed:", err);
    }

    setIsRunning(false);
  }, [isRunning, material, nDumps, isoThreshold, minDumpSpacing, seed, selectedFleet,
      payloadOverrides, customTrucks, weights, useML, zoneMode, dataSource, terrainCsvId, setIsRunning, resetLive,
      appendVolume, appendLog, appendSnapshot, appendAnomaly, setLiveSurface, setLiveWhy,
      setLiveZones, setLiveDumpStage, setProgress, setResult, setLastRunPolicy, pushToast, setSupervisorPaused]);

  const handleTune = useCallback(async () => {
    setIsTuning(true);
    try {
      const data = await tuneWeights({ material, n_trials: 25, seed });
      if (data.weights) setWeights(data.weights);
    } catch (err) {}
    setIsTuning(false);
  }, [material, seed, setWeights]);

  const dumpMarkers = liveLog
    .filter((e) => e.status === "dumped" && e.r != null)
    .slice(0, 10)
    .map((e) => ({ r: e.r!, c: e.c! }));



  return (
    <>
    <Toaster />
    <PageShell
      leftTitle="ADIOS"
      leftSubtitle="Industrial Intelligence"
      leftContent={<ControlPanel onRun={handleRun} onTune={handleTune} isTuning={isTuning} />}
      leftRail={
        <>
          <RailItem label="Dumps" value={String(nDumps)} accent />
          <RailItem label="Iso" value={isoThreshold.toFixed(2)} />
          <RailItem label="Fleet" value={String(selectedFleet.length)} />
          <RailItem label="ML" value={useML ? "On" : "Off"} />
          <RailItem label="Zone" value={zoneMode ? "Geofenced" : "Free-form"} />
        </>
      }
      rightTitle="Live Metrics"
      rightContent={<MetricsPanel />}
      rightRail={
        <>
          <RailItem label="Vol" value={result ? `${Math.round(result.summary.total_volume / 1000)}k` : "--"} accent />
          <RailItem label="Cov" value={result ? `${Math.round(result.summary.coverage_pct)}%` : "--"} />
          <RailItem label="Run" value={isRunning ? "On" : "Idle"} />
        </>
      }
    >
      <div className="flex flex-col relative h-full">
        {/* Top Navigation */}
        <header className="h-14 flex items-center justify-between gap-4 px-4 lg:px-6 backdrop-blur-md z-10 shrink-0 overflow-x-auto"
          style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
          <div className="flex gap-3 lg:gap-6">
            {['3d', 'heatmap', 'trend', 'compare', 'plotly'].map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveView(tab as any)}
                className={`font-mono uppercase tracking-widest text-[0.92rem] transition-all duration-300 pb-1 border-b-2
                  ${activeView === tab ? 'border-[#FFC000] text-[#FFC000]' : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'}`}
              >
                {tab === '3d' ? 'Live Terrain' : tab === 'heatmap' ? 'Score Map' : tab === 'trend' ? 'Trend' : tab === 'compare' ? 'Benchmark VS' : 'Plotly 3D'}
              </button>
            ))}
          </div>

          {/* Data Source toggle — Simulation always available; Live CSV unlocks once
              a terrain grid has been uploaded via /upload_terrain and staged in the store. */}
          <div className="flex items-center gap-1.5 shrink-0" title="Choose where the terrain comes from. Live CSV requires uploading a height-map grid first.">
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.12em] mr-1" style={{ color: "var(--muted)" }}>Source</span>
            {(["simulation", "live_csv"] as const).map((src) => {
              const locked = src === "live_csv" && !terrainCsvId;
              return (
                <button
                  key={src}
                  disabled={locked}
                  onClick={() => setDataSource(src)}
                  className={`font-mono px-2 py-1 text-[0.74rem] uppercase rounded border transition-colors ${
                    dataSource === src
                      ? "border-[#FFC000] text-[#FFC000]"
                      : locked
                        ? "border-[var(--border)] text-[var(--muted)] opacity-50 cursor-not-allowed"
                        : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {src === "simulation" ? "Simulation" : locked ? "Live CSV (upload first)" : "Live CSV"}
                </button>
              );
            })}
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleCsvUpload(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => csvInputRef.current?.click()}
              disabled={csvUploading}
              className="font-mono px-2 py-1 text-[0.7rem] uppercase rounded border transition-colors border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-50"
              title="Upload a CSV height-map grid (rows × cols of metre heights; blank/negative = outside boundary) to use as the live terrain source"
            >
              {csvUploading ? "Uploading…" : terrainCsvId ? "Replace CSV" : "Upload CSV"}
            </button>
            {terrainCsvMeta && (
              <span className="font-mono text-[0.62rem]" style={{ color: "var(--muted)" }}
                title={`${terrainCsvMeta.active_cells} active cells · height ${terrainCsvMeta.height_range_m[0].toFixed(1)}–${terrainCsvMeta.height_range_m[1].toFixed(1)}m`}>
                {terrainCsvMeta.rows}×{terrainCsvMeta.cols}
              </span>
            )}
            {csvError && (
              <span className="font-mono text-[0.62rem]" style={{ color: "#FF5722" }} title={csvError}>
                upload failed
              </span>
            )}
          </div>

          {/* Human override / supervisory control layer — lets an operator
              pause, resume, or throttle a live run mid-flight via WS control
              messages handled server-side in /ws/simulate's _poll_controls. */}
          {isRunning && (
            <div className="flex items-center gap-1.5 shrink-0" title="Supervisory control — pause, resume, or slow down the live dispatch loop">
              <span className="font-mono text-[0.7rem] uppercase tracking-[0.12em] mr-1" style={{ color: "var(--muted)" }}>Operator</span>
              <button
                onClick={() => {
                  const ws = liveWsRef.current;
                  if (!ws || ws.readyState !== WebSocket.OPEN) return;
                  ws.send(JSON.stringify({ type: supervisorPaused ? "resume" : "pause" }));
                }}
                className={`font-mono px-2 py-1 text-[0.74rem] uppercase rounded border transition-colors ${
                  supervisorPaused
                    ? "border-[var(--green)] text-[var(--green)]"
                    : "border-[#FFC000] text-[#FFC000]"
                }`}
              >
                {supervisorPaused ? "▸ Resume" : "Ⅱ Pause"}
              </button>
              <span className="font-mono text-[0.62rem]" style={{ color: "var(--muted)" }}>Pace</span>
              <input
                type="range" min={0} max={2} step={0.25}
                value={supervisorStepDelay}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setSupervisorStepDelay(v);
                  const ws = liveWsRef.current;
                  if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: "set_speed", step_delay_s: v }));
                  }
                }}
                className="w-20 accent-[#FFC000]"
                title="Throttle dispatch — adds a delay (seconds) between each truck's decision so an operator can observe in real time"
              />
              <span className="font-mono text-[0.62rem] tabular-nums" style={{ color: "var(--muted)", minWidth: 28 }}>
                {supervisorStepDelay.toFixed(2)}s
              </span>
              {supervisorPaused && (
                <span className="font-mono text-[0.62rem] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded" style={{ color: "var(--void)", background: "var(--green)" }}>
                  Paused by operator
                </span>
              )}
            </div>
          )}

          {activeView === '3d' && (
          <div className="flex items-center gap-3">
            {(["iso","top","front"] as const).map((p) => (
              <button key={p} onClick={() => setCamPreset(p)}
                className={`font-mono px-2 py-1 text-[0.78rem] uppercase rounded border ${
                  camPreset === p ? 'border-[#FFC000] text-[#FFC000]' : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                {p}
              </button>
            ))}
            {/* Wireframe Toggle */}
            <button 
              onClick={() => setWireframe(w => !w)}
              className={`font-mono px-2 py-1 text-[0.78rem] uppercase rounded border ${
                wireframe ? 'border-[#FFC000] text-[#FFC000]' : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] transition-colors'
              }`}
            >
              Wire
            </button>
          </div>
          )}
        </header>

        {/* Cinematic Workspace */}
        <div className="flex-1 relative min-h-0" style={{ background: "var(--void)" }}>

          {/* Predictive-maintenance anomaly alert banner */}
          {liveAnomalies.length > 0 && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col gap-1.5 max-w-[min(90%,560px)]">
              {liveAnomalies.slice(0, 2).map((a, i) => (
                <div key={`${a.tick}-${a.metric}-${i}`}
                  className="px-3 py-2 rounded font-mono text-[0.84rem] backdrop-blur-md flex items-center gap-2"
                  style={{
                    background: "rgba(255,68,0,0.12)",
                    border: "1px solid rgba(255,68,0,0.5)",
                    color: "#FF6A3D",
                  }}>
                  <span className="uppercase tracking-widest text-[0.74rem] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(255,68,0,0.25)" }}>
                    Anomaly
                  </span>
                  <span>{a.message}</span>
                  <span className="ml-auto opacity-60">t={a.tick}</span>
                </div>
              ))}
            </div>
          )}

          {/* Subtle Grid Overlay */}
          <div className="absolute inset-0 pointer-events-none adios-grid-overlay opacity-10" />

          {/* 3D Scene Layer */}
          <div className={`absolute inset-0 transition-opacity duration-700 ${activeView === '3d' ? 'opacity-100 z-10' : 'opacity-0 -z-10'}`}>
            <Suspense fallback={<div className="flex h-full items-center justify-center text-[#6b7280] font-mono text-sm tracking-widest uppercase">Initializing WebGL...</div>}>
              <Scene3D
                surface={currentSurface}
                mask={currentMask}
                entry={currentEntry}
                dumpMarkers={dumpMarkers}
                zones={zoneMode ? currentZones : null}
                showWireframe={wireframe}
                camPreset={camPreset}
              />
            </Suspense>

            {/* Idle state — shown when no simulation has been run yet */}
            {!currentSurface && !isRunning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none">
                {/* Animated concentric rings */}
                <div className="relative flex items-center justify-center mb-8">
                  {[80, 112, 144].map((size, i) => (
                    <div
                      key={size}
                      className="absolute rounded-full border"
                      style={{
                        width: size, height: size,
                        borderColor: `rgba(255,192,0,${0.18 - i * 0.04})`,
                        animation: `spin ${6 + i * 2}s linear infinite ${i % 2 ? "reverse" : ""}`,
                      }}
                    />
                  ))}
                  {/* Center dot */}
                  <div className="w-4 h-4 rounded-full" style={{ background: "#FFC000", boxShadow: "0 0 20px rgba(255,192,0,0.6), 0 0 40px rgba(255,192,0,0.3)" }} />
                </div>
                <div className="font-syncopate text-[1.16rem] uppercase tracking-[0.3em] mb-3" style={{ color: "var(--acid)" }}>
                  Ready to Simulate
                </div>
                <div className="font-mono text-[1.07rem] uppercase tracking-[0.18em] mb-6" style={{ color: "var(--muted)" }}>
                  Configure parameters and press Execute
                </div>
                <div className="flex items-center gap-4">
                  {[
                    { label: "PPO Policy", sub: "constrained RL" },
                    { label: "A* Pathfinding", sub: "haul routes" },
                    { label: "IoT Telemetry", sub: "fleet context" },
                  ].map(({ label, sub }) => (
                    <div key={label} className="text-center px-4 py-2" style={{ border: "1px solid rgba(255,192,0,0.1)", borderRadius: 4, background: "rgba(255,192,0,0.04)" }}>
                      <div className="font-mono text-[1.01rem] uppercase tracking-[0.12em]" style={{ color: "#FFC000" }}>{label}</div>
                      <div className="font-mono text-[0.96rem] mt-0.5" style={{ color: "#4B5563" }}>{sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Loading spinner overlay */}
            {isRunning && !liveSurface && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none"
                style={{ background: "rgba(5,6,8,0.75)", backdropFilter: "blur(4px)" }}>
                <div className="relative w-16 h-16 mb-4">
                  <div className="absolute inset-0 rounded-full border-2 border-transparent"
                    style={{ borderTopColor: "var(--acid)", animation: "spin 1s linear infinite" }} />
                  <div className="absolute inset-2 rounded-full border-2 border-transparent"
                    style={{ borderBottomColor: "var(--ore)", animation: "spin 1.5s linear infinite reverse" }} />
                </div>
                <div className="font-syncopate text-[1.16rem] uppercase tracking-[0.25em]"
                  style={{ color: "var(--acid)", animation: "pulse 2s ease-in-out infinite" }}>
                  Simulating Terrain
                </div>
                <div className="font-mono text-[1.04rem] uppercase tracking-widest mt-2" style={{ color: "var(--muted)" }}>
                  Streaming dump decisions…
                </div>
              </div>
            )}
          </div>

          {/* Heatmap Layer */}
          <div className={`absolute inset-0 transition-opacity duration-700 ${activeView === 'heatmap' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 -z-10 pointer-events-none'}`}>
            <HeatmapView scoreMap={result?.score_map ?? null} mask={result?.mask ?? null} />
          </div>

          {/* Trend Chart Layer */}
          <div className={`absolute inset-0 p-6 transition-opacity duration-700 ${activeView === 'trend' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 -z-10 pointer-events-none'}`}>
             <div className="h-full w-full flex flex-col gap-4">
               <div className="flex-1 adios-panel backdrop-blur-xl overflow-hidden shadow-2xl p-2">
                 <TrendChart
                   snapshots={(result?.snapshots ?? []).map((s: any, i: number) => ({
                     dump: s.dump_n ?? i,
                     volume: s.volume ?? 0,
                     coverage: s.coverage ?? 0,
                     efficiency: s.efficiency ?? 0,
                   }))}
                 />
               </div>
               <div className="flex gap-4" style={{ flexBasis: 300, flexShrink: 0 }}>
                 <div className="flex-1 adios-panel backdrop-blur-xl overflow-hidden shadow-2xl p-4">
                   <FleetEfficiencyChart log={(result?.log ?? liveLog) as DumpEvent[]} height={250} />
                 </div>
                 <div className="flex-1 adios-panel backdrop-blur-xl overflow-hidden shadow-2xl p-4">
                   <ROIPanel log={(result?.log ?? liveLog) as DumpEvent[]} result={result} />
                 </div>
               </div>
             </div>
          </div>

          {/* Benchmark Panel Layer */}
          <div className={`absolute inset-0 p-6 transition-opacity duration-700 ${activeView === 'compare' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 -z-10 pointer-events-none'}`}>
             <div className="h-full w-full adios-panel backdrop-blur-xl overflow-hidden shadow-2xl">
               <BenchmarkPanel />
             </div>
          </div>

          {/* Plotly Layer */}
          <div className={`absolute inset-0 p-6 transition-opacity duration-700 ${activeView === 'plotly' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 -z-10 pointer-events-none'}`}>
             <div className="h-full w-full adios-panel backdrop-blur-xl overflow-hidden shadow-2xl">
               <Compare3D
                 adiosSurface={result?.surface ?? null}
                 staticSurface={result?.static_surface ?? null}
                 staffedSurface={result?.staffed_surface ?? null}
                 mask={result?.mask ?? null}
                 policy={result?.summary?.policy}
               />
             </div>
          </div>

        </div>
      </div>
    </PageShell>
    </>
  );
}
