"use client";
import React, { useMemo } from "react";

export interface GanttEntry {
  truck_id: string;
  payload_t: number;
  start_tick: number;
  end_tick: number;
  status: string;
  r: number;
  c: number;
  dump_seq: number;
}

interface GanttChartProps {
  timeline: GanttEntry[];
  totalTicks: number;
  selectedSeq?: number | null;
  onSelect?: (seq: number) => void;
}

const STATUS_COLOR: Record<string, string> = {
  dumped:          "#C8FF00",
  iso_rejected:    "#FF6B35",
  slope_rejected:  "#FF3366",
  skip:            "#3A6070",
};

const STATUS_LABEL: Record<string, string> = {
  dumped:          "DUMPED",
  iso_rejected:    "ISO REJ",
  slope_rejected:  "SLOPE REJ",
  skip:            "SKIP",
};

function statusColor(s: string): string {
  return STATUS_COLOR[s] ?? "#7AA8BC";
}

export default function GanttChart({
  timeline, totalTicks, selectedSeq, onSelect,
}: GanttChartProps) {
  const trucks = useMemo(
    () => Array.from(new Set(timeline.map((e) => e.truck_id))).sort(),
    [timeline]
  );

  if (!timeline.length) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
      height: "100%", color: "var(--muted)", fontFamily: "JetBrains Mono",
      fontSize: "0.7rem", letterSpacing: "0.1em" }}>
      NO DISPATCH DATA — RUN SIMULATION FIRST
    </div>
  );

  const ROW_H = 36;
  const LABEL_W = 70;
  const TICK_W = 14;
  const chartW = totalTicks * TICK_W;
  const chartH = trucks.length * ROW_H;

  // tick marks every 10
  const ticks = Array.from({ length: Math.ceil(totalTicks / 10) + 1 }, (_, i) => i * 10)
    .filter((t) => t <= totalTicks);

  return (
    <div style={{ overflowX: "auto", overflowY: "hidden", width: "100%" }}>
      {/* Legend */}
      <div style={{ display: "flex", gap: 16, padding: "8px 0 10px",
        fontFamily: "JetBrains Mono", fontSize: "0.55rem", letterSpacing: "0.1em",
        textTransform: "uppercase" }}>
        {Object.entries(STATUS_LABEL).map(([k, v]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, display: "inline-block",
              background: statusColor(k) }} />
            <span style={{ color: "var(--text2)" }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex" }}>
        {/* Truck labels */}
        <div style={{ flexShrink: 0, width: LABEL_W }}>
          {/* header spacer */}
          <div style={{ height: 20 }} />
          {trucks.map((tid) => (
            <div key={tid} style={{
              height: ROW_H, display: "flex", alignItems: "center",
              fontFamily: "JetBrains Mono", fontSize: "0.65rem",
              color: "var(--text)", letterSpacing: "0.08em",
              borderRight: "1px solid var(--border)",
              paddingRight: 8,
            }}>
              🚛 {tid}
            </div>
          ))}
        </div>

        {/* Chart area */}
        <div style={{ overflowX: "auto", flex: 1 }}>
          <svg
            width={chartW}
            height={chartH + 20}
            style={{ display: "block" }}
          >
            {/* Tick header */}
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={t * TICK_W} y1={0}
                  x2={t * TICK_W} y2={chartH + 20}
                  stroke="var(--border)" strokeWidth={0.5}
                />
                <text
                  x={t * TICK_W + 2} y={12}
                  fill="var(--muted)"
                  fontFamily="JetBrains Mono" fontSize={8}
                >
                  t{t}
                </text>
              </g>
            ))}

            {/* Row backgrounds */}
            {trucks.map((_, ri) => (
              <rect
                key={ri}
                x={0} y={20 + ri * ROW_H}
                width={chartW} height={ROW_H}
                fill={ri % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent"}
              />
            ))}

            {/* Bars */}
            {timeline.map((entry) => {
              const ri = trucks.indexOf(entry.truck_id);
              if (ri === -1) return null;
              const x = entry.start_tick * TICK_W;
              const bw = Math.max(4, (entry.end_tick - entry.start_tick) * TICK_W - 2);
              const y = 20 + ri * ROW_H + 5;
              const bh = ROW_H - 10;
              const col = statusColor(entry.status);
              const isSelected = selectedSeq === entry.dump_seq;
              return (
                <g
                  key={entry.dump_seq}
                  style={{ cursor: "pointer" }}
                  onClick={() => onSelect?.(entry.dump_seq)}
                >
                  <rect
                    x={x} y={y} width={bw} height={bh}
                    rx={3}
                    fill={col}
                    opacity={isSelected ? 1 : 0.72}
                    stroke={isSelected ? "#fff" : "transparent"}
                    strokeWidth={isSelected ? 1.5 : 0}
                  />
                  {bw > 24 && (
                    <text
                      x={x + 4} y={y + bh / 2 + 4}
                      fill={entry.status === "dumped" ? "#000" : "#fff"}
                      fontFamily="JetBrains Mono" fontSize={7}
                      fontWeight={600}
                    >
                      #{entry.dump_seq} · {entry.payload_t}t
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
