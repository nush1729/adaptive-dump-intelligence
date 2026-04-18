"use client";
import React, { useEffect, useState, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSimStore } from "@/store/simStore";
import BenchmarkPanel from "@/components/dashboard/BenchmarkPanel";
import Compare3D from "@/components/dashboard/Compare3D";
import { runSimulation, tuneWeights, fetchHealth, createWebSocket } from "@/lib/api";
import ControlPanel from "@/components/dashboard/ControlPanel";
import MetricsPanel from "@/components/dashboard/MetricsPanel";
import type { WsMessage } from "@/types/adios";

// Dynamic import to avoid SSR issues with Three.js
const Scene3D = dynamic(() => import("@/components/three/Scene3D"), { ssr: false });

const TABS = ["3d", "heatmap", "plotly", "compare"] as const;
type TabType = typeof TABS[number];

function TabBar() {
  const { activeView, setActiveView } = useSimStore();
  const labels: Record<TabType, string> = {
    "3d": "3D Terrain",
    heatmap: "Score Heatmap",
    plotly: "Plotly 3D",
    compare: "vs Static",
  };
  return (
    <div style={{ display: "flex", background: "var(--surface)",
      borderBottom: "1px solid var(--border)" }}>
      {TABS.map((t) => (
        <button key={t} onClick={() => setActiveView(t)}
          style={{
            padding: "10px 18px",
            fontFamily: "JetBrains Mono", fontSize: "0.7rem",
            letterSpacing: "0.08em", textTransform: "uppercase",
            cursor: "pointer", background: "transparent", border: "none",
            borderBottom: activeView === t ? "2px solid var(--acid)" : "2px solid transparent",
            color: activeView === t ? "var(--acid)" : "var(--text2)",
            transition: "all 0.15s",
          }}>
          {labels[t]}
        </button>
      ))}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center",
        paddingRight: 16, gap: 8 }}>
        <ProgressBar />
      </div>
    </div>
  );
}

function ProgressBar() {
  const { isRunning, progress, nDumps } = useSimStore();
  if (!isRunning && progress === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 120, height: 3, background: "var(--border)", borderRadius: 2 }}>
        <div style={{ width: `${progress}%`, height: "100%",
          background: "var(--acid)", borderRadius: 2, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.6rem",
        color: "var(--text2)" }}>
        {Math.round(progress)}%
      </span>
    </div>
  );
}

function HeatmapView({ scoreMap, mask }: { scoreMap: (number | null)[][] | null; mask: boolean[][] | null }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!scoreMap || !mask || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ROWS = scoreMap.length, COLS = scoreMap[0].length;
    canvas.width = COLS; canvas.height = ROWS;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(COLS, ROWS);
    // compute range
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
          img.data[idx] = 5; img.data[idx+1] = 10; img.data[idx+2] = 15; img.data[idx+3] = 255;
        } else {
          const t = (v - mn) / rng; // 0=low, 1=high
          // red → black → acid green
          if (t < 0.5) {
            const f = t / 0.5;
            img.data[idx] = Math.round(255 * (1-f)); img.data[idx+1] = 0; img.data[idx+2] = 0;
          } else {
            const f = (t - 0.5) / 0.5;
            img.data[idx] = 0; img.data[idx+1] = Math.round(200 * f); img.data[idx+2] = 0;
          }
          img.data[idx+3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [scoreMap, mask]);

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex",
      alignItems: "center", justifyContent: "center", background: "#050A0F" }}>
      {scoreMap ? (
        <canvas ref={canvasRef}
          style={{ width: "min(90vw, 90vh)", height: "min(90vw, 90vh)",
            imageRendering: "pixelated" }} />
      ) : (
        <span style={{ color: "var(--muted)", fontFamily: "JetBrains Mono",
          fontSize: "0.8rem" }}>Run simulation to see score heatmap</span>
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
    activeView, showStatic, setWeights,
  } = useSimStore();

  const [isTuning, setIsTuning] = useState(false);
  const [camPreset, setCamPreset] = useState<"iso" | "top" | "front">("iso");
  const [wireframe, setWireframe] = useState(false);

  // health check
  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => {});
  }, [setHealth]);

  const currentSurface = liveSurface
    ?? (showStatic ? result?.static_surface : result?.surface)
    ?? null;
  const currentMask = result?.mask ?? null;
  const currentEntry = result?.entry ?? null;

  // ── run simulation ──────────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    resetLive();

    const cfg = {
      material, n_dumps: nDumps, iso_threshold: isoThreshold, seed,
      fleet_models: selectedFleet, weights, use_ml: useML,
    };

    // try WebSocket first
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
    } catch (_) {
      // WS failed, fall through to REST
    }

    // REST fallback (also used for ML policy which needs full result)
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

  // ── auto-tune ───────────────────────────────────────────────────────────────
  const handleTune = useCallback(async () => {
    setIsTuning(true);
    try {
      const data = await tuneWeights({ material, n_trials: 25, seed });
      if (data.weights) setWeights(data.weights);
    } catch (err) {
      console.error("Tune failed:", err);
    }
    setIsTuning(false);
  }, [material, seed, setWeights]);

  // ── live dump markers ───────────────────────────────────────────────────────
  const dumpMarkers = liveLog
    .filter((e) => e.status === "dumped" && e.r != null)
    .slice(0, 10)
    .map((e) => ({ r: e.r!, c: e.c! }));

  return (
    <div style={{ display: "grid", height: "100vh",
      gridTemplateRows: "48px 1fr",
      gridTemplateColumns: "280px 1fr 240px",
      gridTemplateAreas: `"hdr hdr hdr" "ctrl main side"` }}>

      {/* Header */}
      <header style={{ gridArea: "hdr", display: "flex", alignItems: "center",
        gap: 20, padding: "0 24px", background: "var(--surface)",
        borderBottom: "1px solid var(--border)", zIndex: 10 }}>
        <div style={{ fontFamily: "Syncopate", fontSize: "1.6rem",
          letterSpacing: "0.25em", color: "var(--acid)" }}>
          ADI<span style={{ color: "var(--ore)" }}>O</span>S
        </div>
        <div style={{ fontSize: "0.6rem", letterSpacing: "0.2em",
          color: "var(--muted)", textTransform: "uppercase",
          borderLeft: "1px solid var(--border)", paddingLeft: 16 }}>
          Adaptive Dump Intelligence & Orchestration System
        </div>
        
        {/* Navigation tabs */}
        <div style={{ marginLeft: 24, display: "flex", gap: 2, alignItems: "center",
          borderLeft: "1px solid var(--border)", paddingLeft: 16 }}>
          {[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Audit Log", href: "/audit" },
            { label: "Scheduling", href: "/scheduling" },
          ].map((link) => (
            <a key={link.href} href={link.href}
              style={{
                padding: "6px 14px",
                fontFamily: "JetBrains Mono",
                fontSize: "0.65rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                textDecoration: "none",
                color: activeView === link.href.split("/")[1] ? "var(--acid)" : "var(--text2)",
                borderBottom: activeView === link.href.split("/")[1] ? "2px solid var(--acid)" : "2px solid transparent",
                cursor: "pointer",
                transition: "all 0.15s",
                background: "transparent",
                border: "none",
              }}
            >
              {link.label}
            </a>
          ))}
        </div>
        
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {/* Camera controls */}
          {(["iso","top","front"] as const).map((p) => (
            <button key={p} onClick={() => setCamPreset(p)}
              style={{ padding: "3px 10px", background: "transparent",
                border: `1px solid ${camPreset === p ? "var(--acid)" : "var(--border)"}`,
                color: camPreset === p ? "var(--acid)" : "var(--text2)",
                fontFamily: "JetBrains Mono", fontSize: "0.62rem",
                cursor: "pointer", borderRadius: 2, textTransform: "uppercase" }}>
              {p}
            </button>
          ))}
          <button onClick={() => setWireframe((w) => !w)}
            style={{ padding: "3px 10px", background: "transparent",
              border: `1px solid ${wireframe ? "var(--ore)" : "var(--border)"}`,
              color: wireframe ? "var(--ore)" : "var(--text2)",
              fontFamily: "JetBrains Mono", fontSize: "0.62rem",
              cursor: "pointer", borderRadius: 2, textTransform: "uppercase" }}>
            Wire
          </button>

          {/* Status */}
          <div style={{ padding: "3px 12px", borderRadius: 20, fontSize: "0.6rem",
            fontFamily: "JetBrains Mono", letterSpacing: "0.1em", textTransform: "uppercase",
            background: isRunning ? "rgba(255,107,53,0.1)" : "rgba(200,255,0,0.08)",
            border: `1px solid ${isRunning ? "var(--ore)" : "var(--acid)"}`,
            color: isRunning ? "var(--ore)" : "var(--acid)" }}>
            {isRunning ? "RUNNING" : "READY"}
          </div>
          <div style={{ padding: "3px 12px", borderRadius: 20, fontSize: "0.6rem",
            fontFamily: "JetBrains Mono", letterSpacing: "0.1em",
            background: "rgba(200,255,0,0.05)",
            border: "1px solid var(--border)", color: "var(--text2)" }}>
            {health?.policy_type === "ppo" ? "ML-PPO" : "HEURISTIC"}
          </div>
        </div>
      </header>

      {/* Control panel */}
      <div style={{ gridArea: "ctrl" }}>
        <ControlPanel onRun={handleRun} onTune={handleTune} isTuning={isTuning} />
      </div>

      {/* Main viewport */}
      <main style={{ gridArea: "main", display: "flex", flexDirection: "column",
        overflow: "hidden" }}>
        <TabBar />
        <div style={{ flex: 1, position: "relative" }}>

          {/* 3D Canvas — Always mounted, never unmounts to preserve renderer state */}
          <div style={{ 
            position: "absolute", 
            inset: 0,
            visibility: activeView === "3d" ? "visible" : "hidden",
            pointerEvents: activeView === "3d" ? "auto" : "none",
            zIndex: activeView === "3d" ? 1 : -1,
          }}>
            <Suspense fallback={
              <div style={{ display: "flex", alignItems: "center",
                justifyContent: "center", height: "100%", color: "var(--muted)",
                fontFamily: "JetBrains Mono", fontSize: "0.8rem" }}>
                Loading 3D engine…
              </div>
            }>
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

          {/* Heatmap view — Always mounted */}
          <div style={{ 
            position: "absolute", 
            inset: 0,
            visibility: activeView === "heatmap" ? "visible" : "hidden",
            pointerEvents: activeView === "heatmap" ? "auto" : "none",
          }}>
            <HeatmapView
              scoreMap={result?.score_map ?? null}
              mask={result?.mask ?? null}
            />
          </div>

          {/* Compare / Plotly placeholder — Always mounted */}
          <div style={{ 
            position: "absolute", 
            inset: 0,
            visibility: (activeView === "compare" || activeView === "plotly") ? "visible" : "hidden",
            pointerEvents: (activeView === "compare" || activeView === "plotly") ? "auto" : "none",
            display: "flex",
            alignItems: "center", 
            justifyContent: "center",
            flexDirection: "column", 
            gap: 12 
          }}>
            <div style={{ color: "var(--muted)", fontFamily: "JetBrains Mono",
              fontSize: "0.75rem" }}>
              {activeView === "compare" && (
              <div style={{ position: "absolute", inset: 0 }}>
                <BenchmarkPanel />
              </div>
            )}
            {activeView === "plotly" && (
              <div style={{ position: "absolute", inset: 0 }}>
                <Compare3D
                  adiosSurface={result?.surface ?? null}
                  staticSurface={result?.static_surface ?? null}
                  mask={result?.mask ?? null}
                />
              </div>
            )}
            {""}
            </div>
          </div>
        </div>
      </main>

      {/* Metrics panel */}
      <div style={{ gridArea: "side", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <MetricsPanel />
      </div>
    </div>
  );
}
