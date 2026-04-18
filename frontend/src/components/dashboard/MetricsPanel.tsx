"use client";
import React, { useMemo } from "react";
import { useSimStore } from "@/store/simStore";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis } from "recharts";

function KPICard({ label, value, sub, accent = false }: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-val" style={{ color: accent ? "var(--ore)" : "var(--acid)" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: "0.6rem", color: "var(--text2)", marginTop: 2,
        fontFamily: "JetBrains Mono" }}>{sub}</div>}
    </div>
  );
}

function DeltaBadge({ adios, static: stat, label, fmt = (v: number) => v.toFixed(1) }: {
  adios: number | null; static: number | null; label: string; fmt?: (v: number) => string;
}) {
  if (adios == null || stat == null) return null;
  const delta = adios - stat;
  const better = delta > 0;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
      fontSize: "0.65rem", fontFamily: "JetBrains Mono", padding: "4px 0",
      borderBottom: "1px solid var(--border)" }}>
      <span style={{ color: "var(--text2)" }}>{label}</span>
      <span style={{ color: "var(--acid)" }}>{fmt(adios)}</span>
      <span style={{ color: "var(--text2)" }}>vs</span>
      <span style={{ color: "var(--ore)" }}>{fmt(stat)}</span>
      <span style={{ color: better ? "var(--acid)" : "var(--ore)",
        fontSize: "0.6rem" }}>
        {better ? "+" : ""}{fmt(delta)}
      </span>
    </div>
  );
}

export default function MetricsPanel() {
  const { result, volumeHistory, liveLog, liveDumps, health } = useSimStore();
  const summary = result?.summary;
  const staticS = result?.static_summary;

  const chartData = useMemo(() =>
    volumeHistory.map((v, i) => ({ i, v: Math.round(v) })),
    [volumeHistory]
  );

  const lastLog = liveLog.slice(0, 20);

  return (
    <aside className="flex flex-col gap-3 overflow-y-auto p-3 h-full"
      style={{ background: "var(--surface)", borderLeft: "1px solid var(--border)",
        minWidth: 240 }}>

      {/* Model badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%",
          background: health?.policy_type === "ppo" ? "var(--acid)" : "var(--ore)",
          boxShadow: health?.policy_type === "ppo" ? "var(--glow-acid)" : "var(--glow-ore)"}} />
        <span style={{ fontSize: "0.6rem", fontFamily: "JetBrains Mono",
          color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          {health?.policy_type === "ppo" ? "PPO Policy Active" : "Heuristic Mode"}
        </span>
      </div>

      <div className="section-label">Live Metrics</div>

      <KPICard label="Volume" value={summary ? Math.round(summary.total_volume).toLocaleString() : "—"}
        sub="cumulative m³" />
      <KPICard label="Coverage"
        value={summary ? `${summary.coverage_pct.toFixed(1)}%` : "—"}
        sub="polygon area used" />
      <KPICard label="Packing Efficiency"
        value={summary ? `${summary.packing_efficiency.toFixed(1)}%` : "—"} />
      <KPICard label="Height Uniformity"
        value={summary ? `${(summary.height_uniformity * 100).toFixed(1)}%` : "—"}
        sub="1 − σ/μ" />
      <KPICard label="Isolation Events"
        value={summary ? String(summary.isolation_events) : "—"}
        sub="safety rejections" accent />
      <KPICard label="Latency"
        value={summary ? `${summary.latency_ms}ms` : "—"}
        sub="end-to-end planning" />

      {/* Comparison */}
      {summary && staticS && (
        <>
          <div className="section-label" style={{ marginTop: 4 }}>ADIOS vs Static</div>
          <div style={{ background: "var(--panel)", border: "1px solid var(--border)",
            borderRadius: 4, padding: "10px 12px" }}>
            <DeltaBadge label="Vol" adios={summary.total_volume}
              static={staticS.volume} fmt={(v) => Math.round(v).toLocaleString()} />
            <DeltaBadge label="Cov%" adios={summary.coverage_pct}
              static={staticS.coverage_pct} />
            <DeltaBadge label="Eff%" adios={summary.packing_efficiency}
              static={staticS.packing_efficiency} />
          </div>
        </>
      )}

      {/* Volume chart */}
      {chartData.length > 1 && (
        <>
          <div className="section-label">Volume Progress</div>
          <div style={{ height: 72, background: "var(--panel)",
            border: "1px solid var(--border)", borderRadius: 4, padding: "4px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="i" hide />
                <Tooltip
                  contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)",
                    fontFamily: "JetBrains Mono", fontSize: "0.65rem" }}
                  formatter={(v: number) => [v.toLocaleString(), "m³"]}
                  labelFormatter={() => ""}
                />
                <Line type="monotone" dataKey="v" stroke="var(--acid)"
                  strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Log */}
      <div className="section-label">Dispatch Log</div>
      <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: 160 }}>
        {lastLog.length === 0 && (
          <div style={{ fontSize: "0.62rem", color: "var(--muted)",
            fontFamily: "JetBrains Mono" }}>Awaiting simulation…</div>
        )}
        {lastLog.map((e, i) => {
          const ok = e.status === "dumped";
          const iso = e.status.includes("iso");
          const color = ok ? "var(--acid)" : iso ? "var(--ore)" : "var(--muted)";
          return (
            <div key={i} style={{ fontSize: "0.6rem", fontFamily: "JetBrains Mono",
              padding: "2px 6px", background: "var(--panel)",
              borderLeft: `2px solid ${color}`, borderRadius: 2 }}>
              t{e.t} {e.truck ?? "—"} ({e.r ?? "-"},{e.c ?? "-"}) {e.status}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
