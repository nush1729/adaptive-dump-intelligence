"use client";
import React, { useMemo } from "react";

interface TrendPoint {
  dump: number;
  volume: number;
  coverage: number;
  efficiency: number;
}

interface TrendChartProps {
  snapshots: TrendPoint[];
  height?: number;
}

/** Inline SVG sparkline chart for coverage, volume, and efficiency trends. */
export default function TrendChart({ snapshots, height = 200 }: TrendChartProps) {
  const W = 600;
  const H = height;
  const PAD = { top: 24, right: 60, bottom: 32, left: 50 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const { volPath, covPath, effPath, xLabels, yLabelsLeft, yLabelsRight } = useMemo(() => {
    if (!snapshots || snapshots.length < 2) {
      return { volPath: "", covPath: "", effPath: "", xLabels: [] as any[], yLabelsLeft: [] as any[], yLabelsRight: [] as any[] };
    }

    const n = snapshots.length;
    const maxVol = Math.max(...snapshots.map((s) => s.volume), 1);

    const xScale = (i: number) => PAD.left + (i / (n - 1)) * plotW;
    const yScaleVol = (v: number) => PAD.top + plotH - (v / maxVol) * plotH;
    const yScalePct = (p: number) => PAD.top + plotH - (p / 100) * plotH;

    const toSvgPath = (points: [number, number][]) => {
      return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
    };

    const volPts: [number, number][] = snapshots.map((s, i) => [xScale(i), yScaleVol(s.volume)]);
    const covPts: [number, number][] = snapshots.map((s, i) => [xScale(i), yScalePct(s.coverage * 100)]);
    const effPts: [number, number][] = snapshots.map((s, i) => [xScale(i), yScalePct(s.efficiency * 100)]);

    // X labels (every ~10 dumps)
    const step = Math.max(1, Math.floor(n / 6));
    const xLbls = [];
    for (let i = 0; i < n; i += step) {
      xLbls.push({ x: xScale(i), label: `${snapshots[i].dump}` });
    }
    xLbls.push({ x: xScale(n - 1), label: `${snapshots[n - 1].dump}` });

    // Y labels — left (volume)
    const yLeft = [0, maxVol * 0.25, maxVol * 0.5, maxVol * 0.75, maxVol].map((v) => ({
      y: yScaleVol(v),
      label: `${Math.round(v)}`,
    }));

    // Y labels — right (percentage)
    const yRight = [0, 25, 50, 75, 100].map((p) => ({
      y: yScalePct(p),
      label: `${p}%`,
    }));

    return {
      volPath: toSvgPath(volPts),
      covPath: toSvgPath(covPts),
      effPath: toSvgPath(effPts),
      xLabels: xLbls,
      yLabelsLeft: yLeft,
      yLabelsRight: yRight,
    };
  }, [snapshots, plotW, plotH]);

  if (!snapshots || snapshots.length < 2) {
    return (
      <div className="flex items-center justify-center h-full font-mono text-[1.01rem] uppercase tracking-widest"
        style={{ color: "var(--muted)" }}>
        Run a simulation to see trends
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Legend */}
      <div className="flex items-center gap-5 px-4 py-2 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="font-syncopate text-[1.01rem] uppercase tracking-[0.2em]" style={{ color: "var(--muted)" }}>
          Performance Trend
        </div>
        <div className="ml-auto flex items-center gap-4">
          {[
            { color: "#FFC000", label: "Volume (m³)" },
            { color: "#80FF00", label: "Coverage (%)" },
            { color: "#FF5722", label: "Efficiency (%)" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 rounded-full" style={{ background: color }} />
              <span className="font-mono text-[0.96rem] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* SVG Chart */}
      <div className="flex-1 min-h-0 p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          {/* Grid lines */}
          {yLabelsRight.map(({ y }, i) => (
            <line key={i} x1={PAD.left} x2={W - PAD.right} y1={y} y2={y}
              stroke="var(--border)" strokeWidth={0.5} strokeDasharray="3 3" />
          ))}

          {/* Y axis labels — left (volume) */}
          {yLabelsLeft.map(({ y, label }, i) => (
            <text key={`yl-${i}`} x={PAD.left - 6} y={y + 3} textAnchor="end"
              fill="var(--muted)" fontSize={8} fontFamily="JetBrains Mono, monospace">
              {label}
            </text>
          ))}

          {/* Y axis labels — right (pct) */}
          {yLabelsRight.map(({ y, label }, i) => (
            <text key={`yr-${i}`} x={W - PAD.right + 6} y={y + 3} textAnchor="start"
              fill="var(--muted)" fontSize={8} fontFamily="JetBrains Mono, monospace">
              {label}
            </text>
          ))}

          {/* X axis labels */}
          {xLabels.map(({ x, label }, i) => (
            <text key={`x-${i}`} x={x} y={H - 8} textAnchor="middle"
              fill="var(--muted)" fontSize={8} fontFamily="JetBrains Mono, monospace">
              #{label}
            </text>
          ))}

          {/* Volume line */}
          <path d={volPath} fill="none" stroke="#FFC000" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />

          {/* Coverage line */}
          <path d={covPath} fill="none" stroke="#80FF00" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.8} />

          {/* Efficiency line */}
          <path d={effPath} fill="none" stroke="#FF5722" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.8} strokeDasharray="4 2" />

          {/* Axis labels */}
          <text x={PAD.left - 6} y={12} textAnchor="start" fill="#FFC000" fontSize={7}
            fontFamily="JetBrains Mono, monospace" opacity={0.7}>
            VOL
          </text>
          <text x={W - PAD.right + 6} y={12} textAnchor="start" fill="#80FF00" fontSize={7}
            fontFamily="JetBrains Mono, monospace" opacity={0.7}>
            PCT
          </text>
        </svg>
      </div>
    </div>
  );
}
