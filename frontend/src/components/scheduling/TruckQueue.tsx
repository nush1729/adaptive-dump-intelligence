"use client";
import React from "react";

export interface TruckQueueEntry {
  truck_id: string;
  payload_t: number;
  start_tick: number;
  end_tick: number;
  status: string;
  r: number;
  c: number;
  dump_seq: number;
}

interface TruckQueueProps {
  queue: TruckQueueEntry[];
  currentTick?: number;
  liveDispatches?: number;
}

const STATUS_CHIP: Record<string, { bg: string; label: string }> = {
  dumped:         { bg: "rgba(200,255,0,0.15)",   label: "DUMPED"    },
  iso_rejected:   { bg: "rgba(255,107,53,0.18)",  label: "ISO REJ"   },
  slope_rejected: { bg: "rgba(255,51,102,0.18)",  label: "SLOPE REJ" },
  skip:           { bg: "rgba(58,96,112,0.18)",   label: "SKIP"      },
};

function Chip({ status }: { status: string }) {
  const cfg = STATUS_CHIP[status] ?? { bg: "rgba(255,255,255,0.08)", label: status };
  return (
    <span style={{
      background: cfg.bg,
      padding: "2px 7px", borderRadius: 3,
      fontFamily: "JetBrains Mono", fontSize: "0.52rem",
      letterSpacing: "0.1em", textTransform: "uppercase",
      color: "var(--text)",
    }}>
      {cfg.label}
    </span>
  );
}

export default function TruckQueue({ queue, currentTick = 0, liveDispatches = 0 }: TruckQueueProps) {
  return (
    <div style={{
      background: "var(--panel)",
      border: "1px solid var(--border)",
      borderRadius: 4,
      display: "flex", flexDirection: "column", height: "100%",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{
          fontFamily: "Syncopate", fontSize: "0.7rem",
          letterSpacing: "0.2em", textTransform: "uppercase",
          color: "var(--text2)",
        }}>
          Truck Queue
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontFamily: "JetBrains Mono", fontSize: "0.75rem",
            color: "var(--muted)",
          }}>
            t = {currentTick}
          </span>
          <span style={{
            background: "rgba(200,255,0,0.12)",
            color: "var(--acid)",
            fontFamily: "JetBrains Mono", fontSize: "0.75rem",
            padding: "2px 8px", borderRadius: 3,
          }}>
            {liveDispatches} dispatched
          </span>
        </div>
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {queue.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center",
            fontFamily: "JetBrains Mono", fontSize: "0.75rem",
            color: "var(--muted)" }}>
            awaiting dispatch data…
          </div>
        ) : queue.map((entry) => (
          <div key={entry.truck_id} style={{
            padding: "8px 14px",
            borderBottom: "1px solid rgba(26,48,64,0.5)",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            {/* Truck icon */}
            <span style={{ fontSize: "1.1rem" }}>🚛</span>

            {/* Truck info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: "JetBrains Mono", fontSize: "0.68rem",
                fontWeight: 600, color: "var(--text)",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                {entry.truck_id}
                <Chip status={entry.status} />
              </div>
              <div style={{
                fontFamily: "JetBrains Mono", fontSize: "0.75rem",
                color: "var(--text2)", marginTop: 2,
                display: "flex", gap: 12,
              }}>
                <span>{entry.payload_t}t payload</span>
                <span>→ ({entry.r},{entry.c})</span>
                <span>t{entry.start_tick}–{entry.end_tick}</span>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ width: 48, height: 4, background: "var(--border)", borderRadius: 2 }}>
              <div style={{
                height: "100%", borderRadius: 2,
                background: entry.status === "dumped" ? "var(--acid)" : "var(--ore)",
                width: `${Math.min(100, ((currentTick - entry.start_tick) /
                  Math.max(1, entry.end_tick - entry.start_tick)) * 100)}%`,
                transition: "width 0.4s",
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
