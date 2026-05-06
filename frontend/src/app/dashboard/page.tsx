"use client";
import React, { useEffect, useState, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSimStore } from "@/store/simStore";
import BenchmarkPanel from "@/components/dashboard/BenchmarkPanel";
import Compare3D from "@/components/dashboard/Compare3D";
import ControlPanel from "@/components/dashboard/ControlPanel";
import MetricsPanel from "@/components/dashboard/MetricsPanel";
import NavBar from "@/components/NavBar";
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
            img.data[idx] = Math.round(255 * (1-f)); img.data[idx+1] = 0; img.data[idx+2] = 0;
          } else {
            const f = (t - 0.5) / 0.5;
            img.data[idx] = Math.round(245 * f); img.data[idx+1] = Math.round(166 * f); img.data[idx+2] = Math.round(35 * f);
          }
          img.data[idx+3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [scoreMap, mask]);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-[#050608]">
      {scoreMap ? (
        <canvas ref={canvasRef} className="w-[min(90vw,90vh)] h-[min(90vw,90vh)] [image-rendering:pixelated]" />
      ) : (
        <span className="text-[#6b7280] font-mono text-sm">Run simulation to see score heatmap</span>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const {
    material, nDumps, isoThreshold, seed, selectedFleet, weights,
    useML, isRunning, result, liveSurface, liveLog,
    health, setHealth, setResult, setIsRunning, setProgress, resetLive,
    setLiveSurface, appendLog, appendVolume, appendSnapshot,
    activeView, setActiveView, showStatic, setWeights,
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

    const cfg = {
      material, n_dumps: nDumps, iso_threshold: isoThreshold, seed,
      fleet_models: selectedFleet, weights, use_ml: useML,
    };

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

    if (!wsOk || useML) {
      try {
        const data = await runSimulation(cfg);
        setResult(data);
        data.snapshots?.forEach((s: DumpSnapshot) => appendSnapshot(s));
        data.log?.forEach((e: DumpEvent) => appendLog(e));
        data.snapshots?.forEach((s: DumpSnapshot) => appendVolume(s.volume));
        setProgress(100);
      } catch (err) {
        console.error("Simulation failed:", err);
      }
    }

    setIsRunning(false);
  }, [isRunning, material, nDumps, isoThreshold, seed, selectedFleet, weights,
      useML, setIsRunning, resetLive, appendVolume, appendLog, appendSnapshot,
      setLiveSurface, setProgress, setResult]);

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
    <div className="flex flex-col h-[100dvh] overflow-hidden font-sans selection:bg-[#FFC000] selection:text-black" style={{ background: "var(--void)", color: "var(--text)" }}>
      <NavBar />
      {/* Content below nav */}
      <div className="flex flex-1 overflow-hidden pt-11">
      
      {/* LEFT SIDEBAR: Control Panel */}
      <aside className="w-[280px] h-full flex flex-col shadow-2xl z-20" style={{ background: "var(--surface)", borderRight: "1px solid var(--border)" }}>
        <div className="p-5" style={{ borderBottom: "1px solid var(--border)" }}>
          <h1 className="font-syncopate font-bold tracking-widest text-xl flex items-center gap-2" style={{ color: "var(--text)" }}>
            ADI<span className="text-[#FFC000]">O</span>S
          </h1>
          <p className="font-mono text-[0.7rem] text-[#6b7280] uppercase tracking-widest mt-1">
            Industrial Intelligence
          </p>
        </div>
        
        {/* Scrollable controls wrapper managed inside ControlPanel now */}
        <div className="flex-1 overflow-hidden min-h-0">
           <ControlPanel onRun={handleRun} onTune={handleTune} isTuning={isTuning} />
        </div>
      </aside>

      {/* MAIN VIEWPORT */}
      <main className="flex-1 flex flex-col relative h-full">
        {/* Top Navigation */}
        <header className="h-14 flex items-center justify-between px-6 backdrop-blur-md z-10 shrink-0"
          style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
          <div className="flex gap-6">
            {['3d', 'heatmap', 'compare', 'plotly'].map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveView(tab as any)}
                className={`font-mono uppercase tracking-widest text-[0.85rem] transition-all duration-300 pb-1 border-b-2 
                  ${activeView === tab ? 'border-[#FFC000] text-[#FFC000]' : 'border-transparent text-[#6b7280] hover:text-black dark:text-white'}`}
              >
                {tab === '3d' ? 'Live Terrain' : tab === 'heatmap' ? 'Score Map' : tab === 'compare' ? 'Benchmark VS' : 'Plotly 3D'}
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-4">
            {(["iso","top","front"] as const).map((p) => (
              <button key={p} onClick={() => setCamPreset(p)}
                className={`font-mono px-2 py-1 text-[0.7rem] uppercase rounded border ${
                  camPreset === p ? 'border-[#FFC000] text-[#FFC000]' : 'border-gray-200 dark:border-[#2a2d35] text-[#6b7280]'
                }`}
              >
                {p}
              </button>
            ))}
            {/* Wireframe Toggle */}
            <button 
              onClick={() => setWireframe(w => !w)}
              className={`font-mono px-2 py-1 text-[0.7rem] uppercase rounded border ${
                wireframe ? 'border-[#FFC000] text-[#FFC000]' : 'border-gray-200 dark:border-[#2a2d35] text-[#6b7280] hover:text-black dark:hover:text-white transition-colors'
              }`}
            >
              Wire
            </button>

            <div className={`px-3 py-1 rounded-sm font-mono text-[0.7rem] tracking-widest uppercase border ${
              isRunning ? 'bg-[#FF5722]/10 border-[#FF5722] text-[#FF5722]' : 'bg-[#FFC000]/10 border-[#FFC000] text-[#FFC000]'
            }`}>
              {isRunning ? 'System Active' : 'Standby'}
            </div>
            <div className="px-3 py-1 rounded-sm font-mono text-[0.7rem] tracking-widest uppercase" style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text2)" }}>
              {health?.policy_type === "ppo" ? "ML-PPO" : "HEURISTIC"}
            </div>
          </div>
        </header>

        {/* Cinematic Workspace */}
        <div className="flex-1 relative min-h-0" style={{ background: "var(--void)" }}>
          
          {/* Subtle Grid Overlay */}
          <div className="absolute inset-0 pointer-events-none bg-[url('/grid.svg')] opacity-5" />

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
             <div className="h-full w-full bg-white dark:bg-[#111317]/90 backdrop-blur-xl border border-gray-200 dark:border-[#2a2d35] rounded-sm overflow-hidden shadow-2xl">
               <BenchmarkPanel />
             </div>
          </div>

          {/* Plotly Layer */}
          <div className={`absolute inset-0 p-6 transition-opacity duration-700 ${activeView === 'plotly' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 -z-10 pointer-events-none'}`}>
             <div className="h-full w-full bg-white dark:bg-[#111317]/90 backdrop-blur-xl border border-gray-200 dark:border-[#2a2d35] rounded-sm overflow-hidden shadow-2xl">
               <Compare3D
                 adiosSurface={result?.surface ?? null}
                 staticSurface={result?.static_surface ?? null}
                 mask={result?.mask ?? null}
               />
             </div>
          </div>

        </div>
      </main>

      {/* RIGHT SIDEBAR: Live Metrics */}
      <aside className="w-[280px] h-full flex flex-col z-20" style={{ background: "var(--surface)", borderLeft: "1px solid var(--border)" }}>
        <MetricsPanel />
      </aside>

      </div>{/* end content row */}
    </div>
  );
}

