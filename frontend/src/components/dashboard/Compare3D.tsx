"use client";
/**
 * Compare3D — 3-way Plotly surface comparison of dump strategies:
 *   Panel 1: Staffed/manual operator pattern (tight, organic spacing)
 *   Panel 2: Autonomous fixed-grid baseline (sparse, rigid lattice)
 *   Panel 3: ADIOS (heuristic or ML) adaptive terrain
 *
 * Plotly is bundled locally (plotly.js-dist-min) and lazy-loaded via dynamic
 * import on first render of this view — avoids both the ~3MB main-bundle hit
 * and the brittleness of an external CDN <script> tag (which is vulnerable to
 * network blocks, outages, and edge-cache poisoning serving non-JS payloads).
 */
import React, { useEffect, useRef, useState } from "react";

type PlotlyModule = (typeof import("plotly.js-dist-min"))["default"];

interface Compare3DProps {
  adiosSurface: number[][] | null;
  staticSurface: number[][] | null;
  staffedSurface?: number[][] | null;
  mask: boolean[][] | null;
  policy?: string;
}

let plotlyModulePromise: Promise<PlotlyModule> | null = null;

function loadPlotly(): Promise<PlotlyModule> {
  if (!plotlyModulePromise) {
    plotlyModulePromise = import("plotly.js-dist-min").then((m) => m.default);
  }
  return plotlyModulePromise;
}

function usePlotly(): PlotlyModule | null {
  const [mod, setMod] = useState<PlotlyModule | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadPlotly().then((m) => {
      if (!cancelled) setMod(m);
    });
    return () => { cancelled = true; };
  }, []);
  return mod;
}

function PlotPanel({
  surface, mask, title, color, plotly,
}: {
  surface: number[][] | null;
  mask: boolean[][] | null;
  title: string;
  color: string;
  plotly: PlotlyModule | null;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!plotly || !ref.current || !surface || !mask) return;
    const ROWS = surface.length;
    const COLS = surface[0].length;

    const z = surface.map((row, r) =>
      row.map((h, c) => (mask[r]?.[c] ? h : null))
    );

    // Auto-scale Z based on actual height range
    let zMax = 1;
    for (const row of surface) {
      for (const h of row) {
        if (h != null && isFinite(h) && h > zMax) zMax = h;
      }
    }

    try {
      plotly.react(
        ref.current,
        [{
          type: "surface",
          z,
          colorscale: [
            [0,    "#051420"],
            [0.15, "#00A3B3"],
            [0.35, "#00CC66"],
            [0.55, "#88DD00"],
            [0.70, "#FFC000"],
            [0.85, "#FF5722"],
            [1.0,  "#FFFFFF"],
          ],
          showscale: false,
          opacity: 0.96,
          contours: {
            z: { show: true, usecolormap: true, highlightcolor: "#FFC000", project: { z: false } },
          },
        }],
        {
          paper_bgcolor: "#050A0F",
          plot_bgcolor:  "#050A0F",
          margin: { l: 0, r: 0, t: 32, b: 0 },
          title: {
            text: title,
            font: { family: "JetBrains Mono", size: 11, color },
            x: 0.5,
          },
          scene: {
            bgcolor: "#050A0F",
            xaxis: { showgrid: false, zeroline: false, showticklabels: false },
            yaxis: { showgrid: false, zeroline: false, showticklabels: false },
            zaxis: { showgrid: false, zeroline: false, showticklabels: false },
            aspectmode: "manual",
            aspectratio: { x: 1.4, y: 1.4, z: Math.max(0.3, Math.min(0.8, zMax / Math.max(ROWS, COLS) * 8)) },
            camera: { eye: { x: 1.5, y: 1.5, z: 1.0 } },
          },
        },
        { responsive: true, displayModeBar: false }
      );
    } catch (err) {
      console.error("Plotly render failed:", err);
    }
  }, [plotly, surface, mask, title, color]);

  return (
    <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
      {(!surface || !plotly) && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          fontFamily: "JetBrains Mono", fontSize: "0.72rem", color: "var(--muted)",
        }}>
          {!plotly ? "Loading Plotly…" : "Run simulation first"}
        </div>
      )}
      <div ref={ref} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

export default function Compare3D({ adiosSurface, staticSurface, staffedSurface, mask, policy }: Compare3DProps) {
  const plotly = usePlotly();
  const adiosLabel =
    policy === "maskable_ppo" ? "ADIOS — Maskable PPO" :
    policy === "imitation_bc" ? "ADIOS — Imitation BC" :
    policy === "hybrid" ? "ADIOS — Hybrid Policy" :
    "ADIOS — Heuristic Pack";
  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%", gap: 2,
      background: "var(--void)",
    }}>
      <div style={{ display: "flex", flex: 1, minHeight: 0, gap: 2 }}>
        <PlotPanel
          surface={staffedSurface ?? null}
          mask={mask}
          title="Staffed — Manual Pattern"
          color="#00A3B3"
          plotly={plotly}
        />
        <div style={{ width: 1, background: "var(--border)" }} />
        <PlotPanel
          surface={staticSurface}
          mask={mask}
          title="Autonomous — Fixed Grid"
          color="#FF5722"
          plotly={plotly}
        />
      </div>
      <div style={{ height: 1, background: "var(--border)" }} />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <PlotPanel
          surface={adiosSurface}
          mask={mask}
          title={adiosLabel}
          color="#FFC000"
          plotly={plotly}
        />
      </div>
    </div>
  );
}
