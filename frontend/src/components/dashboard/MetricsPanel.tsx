"use client";
import React, { useMemo } from "react";
import { useSimStore } from "@/store/simStore";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis } from "recharts";

// ── KPI Card — fixed height, no overflow, clean layout ─────────────────────
function KPICard({ label, value, sub, accent = false }: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div style={{
      background: "var(--panel)",
      border: "1px solid var(--border)",
      borderRadius: 4,
      padding: "10px 12px",
      position: "relative",
      overflow: "hidden",
      minHeight: 60,
    }}>
      {/* Top accent line */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, ${accent ? "var(--ore)" : "var(--acid)"}, transparent)`,
      }} />
      <div style={{
        fontFamily: "JetBrains Mono",
        fontSize: "0.62rem",
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        color: "var(--muted)",
        marginBottom: 4,
        lineHeight: 1,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: "JetBrains Mono",
        fontSize: "1.25rem",
        fontWeight: 700,
        lineHeight: 1.1,
        color: accent ? "var(--ore)" : "var(--acid)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: "0.6rem",
          color: "var(--text2)",
          marginTop: 3,
          fontFamily: "JetBrains Mono",
          lineHeight: 1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Delta comparison row ───────────────────────────────────────────────────────
function DeltaRow({ label, adios, stat, fmt = (v: number) => v.toFixed(1) }: {
  label: string; adios: number | null; stat: number | null;
  fmt?: (v: number) => string;
}) {
  if (adios == null || stat == null) return null;
  const delta = adios - stat;
  const better = delta > 0;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "50px 1fr auto",
      gap: 6,
      alignItems: "center",
      fontSize: "0.68rem",
      fontFamily: "JetBrains Mono",
      padding: "5px 0",
      borderBottom: "1px solid var(--border)",
    }}>
      <span style={{ color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </span>
      <div style={{
        display: "flex", gap: 4, alignItems: "center",
        justifyContent: "flex-end",
        overflow: "hidden",
      }}>
        <span style={{ color: "var(--acid)" }}>{fmt(adios)}</span>
        <span style={{ color: "var(--muted)", fontSize: "0.6rem" }}>vs</span>
        <span style={{ color: "var(--ore)" }}>{fmt(stat)}</span>
      </div>
      <span style={{
        color: better ? "var(--acid)" : "var(--ore)",
        fontWeight: 700,
        fontSize: "0.65rem",
        textAlign: "right",
        minWidth: 44,
      }}>
        {better ? "+" : ""}{fmt(delta)}
      </span>
    </div>
  );
}

// ── Log entry ──────────────────────────────────────────────────────────────────
function LogEntry({ e }: { e: { t: number; truck: string | null; r: number | null; c: number | null; status: string } }) {
  const ok = e.status === "dumped";
  const iso = e.status.includes("iso");
  const color = ok ? "var(--acid)" : iso ? "var(--ore)" : "var(--muted)";
  return (
    <div style={{
      fontSize: "0.65rem",
      fontFamily: "JetBrains Mono",
      padding: "3px 8px 3px 10px",
      background: "var(--panel)",
      borderLeft: `2px solid ${color}`,
      borderRadius: 2,
      display: "flex",
      gap: 4,
      alignItems: "center",
      overflow: "hidden",
      whiteSpace: "nowrap",
    }}>
      <span style={{ color: "var(--muted)", minWidth: 20 }}>t{e.t}</span>
      <span style={{ color: "var(--text2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
        {e.truck ?? "—"} ({e.r ?? "-"},{e.c ?? "-"})
      </span>
      <span style={{
        fontSize: "0.55rem",
        color,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        flexShrink: 0,
      }}>
        {ok ? "OK" : iso ? "REJ" : "SKIP"}
      </span>
    </div>
  );
}

// ── Main MetricsPanel ─────────────────────────────────────────────────────────
export default function MetricsPanel() {
  const { result, volumeHistory, liveLog, health, lastRunPolicy } = useSimStore();
  const summary = result?.summary;
  const staticS = result?.static_summary;

  const chartData = useMemo(() =>
    volumeHistory.map((v, i) => ({ i, v: Math.round(v) })),
    [volumeHistory]
  );

  const lastLog = liveLog.slice(0, 15);

  // Determine the ACTUAL policy used: prefer result's summary, then store tracking
  const actualPolicy = result?.summary?.policy ?? lastRunPolicy ?? health?.policy_type ?? "heuristic";
  const isPPO = actualPolicy === "ml_ppo" || actualPolicy === "ppo";

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      overflow: "hidden",
      background: "var(--surface)",
    }}>
      {/* ── Scrollable content ── */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        overflowX: "hidden",
        padding: "12px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}>
        {/* Model badge — shows ACTUAL last-run mode, not server config */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 0",
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: isPPO ? "var(--acid)" : "var(--ore)",
            boxShadow: isPPO ? "var(--glow-acid)" : "var(--glow-ore)",
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: "0.65rem",
            fontFamily: "JetBrains Mono",
            color: "var(--text2)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            whiteSpace: "nowrap",
          }}>
            {isPPO ? "ML Policy (PPO)" : "Heuristic Mode"}
            {result ? "" : " · awaiting run"}
          </span>
        </div>

        {/* Section: Live Metrics */}
        <div style={{
          fontFamily: "Syncopate",
          fontSize: "0.58rem",
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--muted)",
          paddingBottom: 4,
          borderBottom: "1px solid var(--border)",
        }}>Live Metrics</div>

        {/* KPI Grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
        }}>
          <KPICard
            label="Volume"
            value={summary ? Math.round(summary.total_volume).toLocaleString() : "—"}
            sub="cumulative m³"
          />
          <KPICard
            label="Coverage"
            value={summary ? `${summary.coverage_pct.toFixed(1)}%` : "—"}
            sub="polygon area"
          />
          <KPICard
            label="Uniformity"
            value={summary ? `${(summary.height_uniformity * 100).toFixed(1)}%` : "—"}
            sub="1 − σ/μ"
          />
          <KPICard
            label="Iso Events"
            value={summary ? String(summary.isolation_events) : "—"}
            sub="safety rej."
            accent
          />
          <KPICard
            label="Latency"
            value={summary ? `${summary.latency_ms}ms` : "—"}
            sub="end-to-end"
          />
        </div>

        {/* Comparison */}
        {summary && staticS && (
          <>
            <div style={{
              fontFamily: "Syncopate",
              fontSize: "0.58rem",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--muted)",
              paddingBottom: 4,
              borderBottom: "1px solid var(--border)",
              marginTop: 4,
            }}>ADIOS vs Static</div>
            <div style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "8px 10px",
            }}>
              <DeltaRow
                label="Vol"
                adios={summary.total_volume}
                stat={staticS.volume}
                fmt={(v) => Math.round(v).toLocaleString()}
              />
              <DeltaRow label="Cov%" adios={summary.coverage_pct} stat={staticS.coverage_pct} />
              <DeltaRow label="Uni%" adios={summary.packing_efficiency} stat={staticS.packing_efficiency} />
            </div>
          </>
        )}

        {/* Volume chart */}
        {chartData.length > 1 && (
          <>
            <div style={{
              fontFamily: "Syncopate",
              fontSize: "0.58rem",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--muted)",
              paddingBottom: 4,
              borderBottom: "1px solid var(--border)",
              marginTop: 4,
            }}>Volume Progress</div>
            <div style={{
              height: 68,
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: 4,
              flexShrink: 0,
            }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="i" hide />
                  <Tooltip
                    contentStyle={{
                      background: "var(--panel)",
                      border: "1px solid var(--border)",
                      fontFamily: "JetBrains Mono",
                      fontSize: "0.65rem",
                      color: "var(--text)",
                    }}
                    formatter={(v: number) => [v.toLocaleString(), "m³"]}
                    labelFormatter={() => ""}
                  />
                  <Line
                    type="monotone"
                    dataKey="v"
                    stroke="var(--acid)"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {/* Dispatch Log */}
        <div style={{
          fontFamily: "Syncopate",
          fontSize: "0.58rem",
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--muted)",
          paddingBottom: 4,
          borderBottom: "1px solid var(--border)",
          marginTop: 4,
        }}>Dispatch Log</div>

        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 3,
          maxHeight: 180,
          overflowY: "auto",
          overflowX: "hidden",
        }}>
          {lastLog.length === 0 && (
            <div style={{
              fontSize: "0.65rem",
              color: "var(--muted)",
              fontFamily: "JetBrains Mono",
              padding: "8px 0",
            }}>
              Awaiting simulation…
            </div>
          )}
          {lastLog.map((e, i) => (
            <LogEntry key={i} e={e} />
          ))}
        </div>
      </div>
    </div>
  );
}
