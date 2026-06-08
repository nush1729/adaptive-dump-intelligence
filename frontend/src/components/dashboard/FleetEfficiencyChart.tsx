"use client";
import React, { useMemo } from "react";
import type { DumpEvent } from "@/types/adios";

interface FleetEfficiencyChartProps {
  log: DumpEvent[];
  height?: number;
}

const BAR_COLORS = ["#FFC000", "#4FD1C5", "#FF5722", "#9B6BFF", "#5CE65C", "#FF6BD6", "#5C9CE6", "#E6C95C"];

/** Horizontal bar chart of total tonnage successfully dumped, aggregated per truck ID. */
export default function FleetEfficiencyChart({ log, height = 220 }: FleetEfficiencyChartProps) {
  const rows = useMemo(() => {
    const totals = new Map<string, { tonnage: number; dumps: number }>();
    for (const e of log) {
      if (e.status !== "dumped" || !e.truck || e.truck === "—") continue;
      const cur = totals.get(e.truck) ?? { tonnage: 0, dumps: 0 };
      cur.tonnage += e.payload_t || 0;
      cur.dumps += 1;
      totals.set(e.truck, cur);
    }
    return [...totals.entries()]
      .map(([truck, v]) => ({ truck, ...v }))
      .sort((a, b) => b.tonnage - a.tonnage);
  }, [log]);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full font-mono text-[1.01rem] uppercase tracking-widest"
        style={{ color: "var(--muted)" }}>
        Run a simulation to see fleet efficiency
      </div>
    );
  }

  const maxTonnage = Math.max(...rows.map((r) => r.tonnage), 1);
  const rowH = Math.max(22, Math.min(34, Math.floor((height - 24) / rows.length)));

  return (
    <div className="font-mono" style={{ width: "100%" }}>
      <div className="flex items-center justify-between mb-2 text-[0.66rem] uppercase tracking-[0.1em]" style={{ color: "var(--muted)" }}>
        <span>Truck ID</span>
        <span>Tonnage dumped (dumps)</span>
      </div>
      <div className="flex flex-col gap-1.5" style={{ maxHeight: height, overflowY: "auto" }}>
        {rows.map((r, i) => {
          const pct = Math.max(4, (r.tonnage / maxTonnage) * 100);
          const color = BAR_COLORS[i % BAR_COLORS.length];
          return (
            <div key={r.truck} className="flex items-center gap-2" style={{ height: rowH }}>
              <span className="text-[0.7rem] shrink-0 w-20 truncate" style={{ color: "var(--text)" }} title={r.truck}>
                {r.truck}
              </span>
              <div className="flex-1 rounded-sm overflow-hidden" style={{ background: "var(--raised)", height: 12 }}>
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: color,
                    boxShadow: `0 0 8px ${color}80`,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
              <span className="text-[0.68rem] shrink-0 tabular-nums" style={{ color, minWidth: 92, textAlign: "right" }}>
                {Math.round(r.tonnage).toLocaleString()}t ({r.dumps})
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
