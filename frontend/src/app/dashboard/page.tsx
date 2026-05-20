"use client";
import React, { useEffect, useState, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSimStore } from "@/store/simStore";
import BenchmarkPanel from "@/components/dashboard/BenchmarkPanel";
import Compare3D from "@/components/dashboard/Compare3D";
import ControlPanel from "@/components/dashboard/ControlPanel";
import MetricsPanel from "@/components/dashboard/MetricsPanel";
import PageShell from "@/components/layout/PageShell";
import { RailItem } from "@/components/layout/CollapsedRail";
import { runSimulation, tuneWeights, fetchHealth, createWebSocket } from "@/lib/api";
import type { WsMessage, DumpSnapshot, DumpEvent } from "@/types/adios";

// Dynamic import to avoid SSR issues with Three.js
const Scene3D = dynamic(() => import("@/components/three/Scene3D"), { ssr: false });

function HeatmapView({ scoreMap, mask }: { scoreMap: (number | null)[][] | null; mask: boolean[][] | null }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!scoreMap || !mask || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ROWS = scoreMap.length, COLS = scoreMap[0].length;
    canvas.width = COLS; canvas.height = ROWS;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(COLS, ROWS);
    let mn = Infinity, mx = -Infinity;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const v = scoreMap[r][c];
        if (v != null && isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; }
      }
    const rng = mx - mn || 1;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = (r * COLS + c) * 4;
        const v = scoreMap[r][c];
        if (v == null || !mask[r][c]) {
          img.data[idx] = 10; img.data[idx+1] = 12; img.data[idx+2] = 15; img.data[idx+3] = 255;
        } else {
          const t = (v - mn) / rng;
          if (t < 0.5) {
            const f = t / 0.5;
            img.data[idx] = 255; img.data[idx+1] = Math.round(255 * f); img.data[idx+2] = 0;
          } else {
            const f = (t - 0.5) / 0.5;
            img.data[idx] = Math.round(255 * (1-f)); img.data[idx+1] = 255; img.data[idx+2] = 0;
          }
          img.data[idx+3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [scoreMap, mask]);

  return (
    <div className="absolute inset-0 flex flex-col bg-[#050608]">
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b" style={{ background: "rgba(10,12,15,0.78)", borderColor: "var(--border)" }}>
        <div>
          <div className="font-syncopate text-[0.68rem] uppercase tracking-[0.2em]" style={{ color: "var(--acid)" }}>
            Score Map
          </div>
          <div className="font-mono text-[0.68rem] mt-1" style={{ color: "var(--text2)" }}>
            Higher intensity cells indicate stronger dispatch candidates.
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 font-mono text-[0.58rem] uppercase tracking-[0.1em]" style={{ color: "var(--muted)" }}>
          <span>Low</span>
          <span className="h-2 w-32 rounded-full" style={{ background: "linear-gradient(90deg, #101820, #FF5722, #FFC000, #E8FFF1)" }} />
          <span>High</span>
        </div>
      </div>
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 adios-grid-overlay opacity-10" />
        <div className="absolute inset-10 rounded" style={{ background: "radial-gradient(circle at center, rgba(255,192,0,0.08), transparent 58%)" }} />
      {scoreMap ? (
          <div className="relative rounded border p-3 shadow-2xl" style={{ background: "rgba(14,17,21,0.82)", borderColor: "rgba(255,192,0,0.24)", boxShadow: "0 24px 80px rgba(0,0,0,0.42)" }}>
            <canvas ref={canvasRef} className="block w-[min(68vw,70vh)] h-[min(68vw,70vh)] rounded [image-rendering:pixelated]" style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }} />
          </div>
      ) : (
          <div className="adios-panel px-6 py-5 text-center">
            <span className="text-[#6b7280] font-mono text-sm">Run simulation to see score heatmap</span>
          </div>
      )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const {
    material, nDumps, isoThreshold, seed, selectedFleet, weights,
    useML, isRunning, result, liveSurface, liveLog,
    health, setHealth, setResult, setIsRunning, setProgress, resetLive,
    setLiveSurface, appendLog, appendVolume, appendSnapshot,
    activeView, setActiveView, showStatic, setWeights, lastRunPolicy, setLastRunPolicy,
  } = useSimStore();

  const [isTuning, setIsTuning] = useState(false);
  const [camPreset, setCamPreset] = useState<"iso" | "top" | "front">("iso");
  const [wireframe, setWireframe] = useState(false);

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => {});
  }, [setHealth]);

  const currentSurface = liveSurface
    ?? (showStatic ? result?.static_surface : result?.surface)
    ?? null;
  const currentMask = result?.mask ?? null;
  const currentEntry = result?.entry ?? null;

  const handleRun = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    resetLive();
    setLastRunPolicy(null);

    const cfg = {
      material, n_dumps: nDumps, iso_threshold: isoThreshold, seed,
      fleet_models: selectedFleet, weights, use_ml: useML,
    };

    // Step 1: Stream via WebSocket for live terrain updates
    let wsOk = false;
    try {
      await new Promise<void>((resolve, reject) => {
        const ws = createWebSocket((msg: WsMessage) => {
          if (msg.type === "dump") {
            appendVolume(msg.volume!);
            if (msg.full_surface) setLiveSurface(msg.full_surface);
            appendSnapshot({ dump_n: msg.dump!, truck: msg.truck!, r: msg.r!,
              c: msg.c!, volume: msg.volume!, coverage: msg.coverage!,
              efficiency: msg.efficiency!, policy: msg.policy });
            appendLog({ t: msg.dump!, truck: msg.truck!, r: msg.r!, c: msg.c!,
              status: "dumped", payload_t: msg.payload_t!, volume: msg.volume!,
              coverage: msg.coverage! });
            setProgress((msg.dump! + 1) / nDumps * 100);
          } else if (msg.type === "rejected") {
            appendLog({ t: msg.dump!, truck: "—", r: msg.r!, c: msg.c!,
              status: `iso_rejected(${msg.reach?.toFixed(2)})`,
              payload_t: 0, volume: 0, coverage: 0 });
          } else if (msg.type === "done") {
            wsOk = true;
            resolve();
          } else if (msg.type === "error") {
            reject(new Error(msg.msg));
          }
        });
        setTimeout(() => { if (!wsOk) { ws.close(); reject(new Error("timeout")); } }, 30000);
      });
    } catch (_) {}

    // Step 2: Always call HTTP for authoritative final result
    // (includes surfaces, summary, static baseline — the complete package)
    try {
      const data = await runSimulation(cfg);
      setResult(data);
      // Set the ACTUAL policy that was used (from backend response)
      const actualPolicy = data?.summary?.policy;
      if (actualPolicy === "ml_ppo" || actualPolicy === "heuristic") {
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
  }, [isRunning, material, nDumps, isoThreshold, seed, selectedFleet, weights,
      useML, setIsRunning, resetLive, appendVolume, appendLog, appendSnapshot,
      setLiveSurface, setProgress, setResult, setLastRunPolicy]);

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
            {['3d', 'heatmap', 'compare', 'plotly'].map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveView(tab as any)}
                className={`font-mono uppercase tracking-widest text-[0.85rem] transition-all duration-300 pb-1 border-b-2 
                  ${activeView === tab ? 'border-[#FFC000] text-[#FFC000]' : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'}`}
              >
                {tab === '3d' ? 'Live Terrain' : tab === 'heatmap' ? 'Score Map' : tab === 'compare' ? 'Benchmark VS' : 'Plotly 3D'}
              </button>
            ))}
          </div>
          
          {activeView === '3d' && (
          <div className="flex items-center gap-3">
            {(["iso","top","front"] as const).map((p) => (
              <button key={p} onClick={() => setCamPreset(p)}
                className={`font-mono px-2 py-1 text-[0.7rem] uppercase rounded border ${
                  camPreset === p ? 'border-[#FFC000] text-[#FFC000]' : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                {p}
              </button>
            ))}
            {/* Wireframe Toggle */}
            <button 
              onClick={() => setWireframe(w => !w)}
              className={`font-mono px-2 py-1 text-[0.7rem] uppercase rounded border ${
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
                showWireframe={wireframe}
                camPreset={camPreset}
              />
            </Suspense>
          </div>

          {/* Heatmap Layer */}
          <div className={`absolute inset-0 transition-opacity duration-700 ${activeView === 'heatmap' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 -z-10 pointer-events-none'}`}>
            <HeatmapView scoreMap={result?.score_map ?? null} mask={result?.mask ?? null} />
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
                 mask={result?.mask ?? null}
                 policy={result?.summary?.policy}
               />
             </div>
          </div>

        </div>
      </div>
    </PageShell>
  );
}

