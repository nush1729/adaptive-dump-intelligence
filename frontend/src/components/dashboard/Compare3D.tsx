"use client";
/**
 * Compare3D — side-by-side Plotly surface comparison:
 *   Left panel:  ADIOS (heuristic or ML) final terrain
 *   Right panel: Static uniform-grid baseline
 *
 * Uses plotly.js loaded via CDN script tag (avoids 3 MB bundle hit).
 *
 * IMPORTANT: Both panels share the same zMax so z-axis scaling is
 * identical and the visual comparison is valid.
 */
import React, { useEffect, useRef, useState, useMemo } from "react";

declare global {
  interface Window { Plotly: any; }
}

interface Compare3DProps {
  adiosSurface: number[][] | null;
  staticSurface: number[][] | null;
  mask: boolean[][] | null;
  policy?: string;
}

const PLOTLY_CDN =
  "https://cdn.plot.ly/plotly-2.32.0.min.js";

function useScript(src: string): boolean {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (window.Plotly) {
      setLoaded(true);
      return;
    }
    
    let s = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement;
    if (!s) {
      s = document.createElement("script");
      s.src = src;
      s.async = true;
      document.head.appendChild(s);
    }
    
    const handleLoad = () => {
      if (window.Plotly) setLoaded(true);
    };
    
    s.addEventListener("load", handleLoad);
    
    // In case it's already loaded but event fired
    if (window.Plotly) setLoaded(true);

    return () => {
      s.removeEventListener("load", handleLoad);
    };
  }, [src]);
  return loaded;
}

/** Compute the maximum finite height across a 2D surface array. */
function surfaceZMax(surface: number[][] | null): number {
  if (!surface) return 0;
  let mx = 0;
  for (const row of surface) {
    for (const h of row) {
      if (h != null && isFinite(h) && h > mx) mx = h;
    }
  }
  return mx;
}

function PlotPanel({
  surface, mask, title, color, sharedZMax,
}: {
  surface: number[][] | null;
  mask: boolean[][] | null;
  title: string;
  color: string;
  sharedZMax: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ready = useScript(PLOTLY_CDN);

  useEffect(() => {
    if (!ready || !ref.current || !surface || !mask) return;
    const ROWS = surface.length;
    const COLS = surface[0].length;

    const z = surface.map((row, r) =>
      row.map((h, c) => (mask[r]?.[c] ? h : null))
    );

    // Use the shared zMax (computed from BOTH surfaces in the parent)
    // so both panels have identical z-axis scaling.
    const zMax = Math.max(1, sharedZMax);

    try {
      window.Plotly.react(
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
          // Pin the color scale to [0, sharedZMax] so colours are comparable
          cmin: 0,
          cmax: zMax,
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
            zaxis: {
              showgrid: false, zeroline: false, showticklabels: false,
              range: [0, zMax],          // lock z-axis to shared range
            },
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
  }, [ready, surface, mask, title, color, sharedZMax]);

  return (
    <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
      {(!surface || !ready) && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          fontFamily: "JetBrains Mono", fontSize: "0.72rem", color: "var(--muted)",
        }}>
          {!ready ? "Loading Plotly…" : "Run simulation first"}
        </div>
      )}
      <div ref={ref} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

export default function Compare3D({ adiosSurface, staticSurface, mask, policy }: Compare3DProps) {
  // Compute a SINGLE zMax from both surfaces so both panels
  // share an identical z-axis scale for a fair visual comparison.
  const sharedZMax = useMemo(() => {
    return Math.max(1, surfaceZMax(adiosSurface), surfaceZMax(staticSurface));
  }, [adiosSurface, staticSurface]);

  const adiosLabel =
    policy === "maskable_ppo" ? "ADIOS — Maskable PPO" :
    policy === "imitation_bc" ? "ADIOS — Imitation BC" :
    policy === "hybrid" ? "ADIOS — Hybrid Policy" :
    "ADIOS — Heuristic Pack";
  return (
    <div style={{
      display: "flex", height: "100%", gap: 2,
      background: "var(--void)",
    }}>
      <PlotPanel
        surface={adiosSurface}
        mask={mask}
        title={adiosLabel}
        color="#FFC000"
        sharedZMax={sharedZMax}
      />
      <div style={{ width: 1, background: "var(--border)" }} />
      <PlotPanel
        surface={staticSurface}
        mask={mask}
        title="Static Baseline — Grid"
        color="#FF5722"
        sharedZMax={sharedZMax}
      />
    </div>
  );
}
