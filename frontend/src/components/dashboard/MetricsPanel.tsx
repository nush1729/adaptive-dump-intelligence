"use client";
import React, { useMemo, useEffect, useState } from "react";
import { useSimStore } from "@/store/simStore";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { fetchFleetIntelligence } from "@/lib/api";
import type { FleetIntelligence, SpacingAnalysis } from "@/types/adios";

/* ── KPI Card ─────────────────────────────────────────────────── */
function KPICard({ label, value, sub, color = "var(--cat)", hint }: {
  label: string; value: string; sub?: string; color?: string; hint?: string;
}) {
  return (
    <div
      title={hint}
      style={{
        background: "var(--panel)", border: "1px solid var(--border)",
        borderRadius: 4, padding: "9px 11px", position: "relative", overflow: "hidden",
        cursor: hint ? "help" : undefined,
      }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, ${color}, transparent)` }} />
      <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.82rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 4 }}>
        {label}
        {hint && <span style={{ fontSize: "0.7rem", opacity: 0.6, fontWeight: 700 }}>ⓘ</span>}
      </div>
      <div style={{ fontFamily: "JetBrains Mono", fontSize: "1.2rem", fontWeight: 700, color, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      {sub && <div style={{ fontSize: "0.68rem", color: "var(--text2)", marginTop: 2, fontFamily: "JetBrains Mono", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
    </div>
  );
}

/* ── IoT Gauge ────────────────────────────────────────────────── */
function IoTGauge({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <div style={{ position: "relative", width: 44, height: 44 }}>
        <svg width={44} height={44} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={22} cy={22} r={17} fill="none" stroke={`${color}20`} strokeWidth={3} />
          <circle
            cx={22} cy={22} r={17} fill="none"
            stroke={color} strokeWidth={3}
            strokeDasharray={`${2 * Math.PI * 17}`}
            strokeDashoffset={`${2 * Math.PI * 17 * (1 - value)}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.74rem", fontWeight: 700, color }}>{pct}</span>
        </div>
      </div>
      <span style={{ fontSize: "0.62rem", fontFamily: "JetBrains Mono", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", lineHeight: 1.25 }}>{label}</span>
    </div>
  );
}

/* ── Section header ───────────────────────────────────────────── */
function SectionHeader({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
    <div style={{
      fontFamily: "Syncopate", fontSize: "0.72rem", letterSpacing: "0.18em",
      textTransform: "uppercase", color: accent ? "var(--cyan)" : "var(--muted)",
      paddingBottom: 4, borderBottom: `1px solid ${accent ? "rgba(0,212,255,0.2)" : "var(--border)"}`,
    }}>{label}</div>
  );
}

/* ── Delta row ────────────────────────────────────────────────── */
function DeltaRow({ label, adios, stat, fmt = (v: number) => v.toFixed(1) }: {
  label: string; adios: number | null; stat: number | null; fmt?: (v: number) => string;
}) {
  if (adios == null || stat == null) return null;
  const delta = adios - stat;
  const better = delta > 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 6, alignItems: "center", fontSize: "0.73rem", fontFamily: "JetBrains Mono", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
      <div style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "flex-end", overflow: "hidden" }}>
        <span style={{ color: "var(--cat)" }}>{fmt(adios)}</span>
        <span style={{ color: "var(--muted)", fontSize: "0.68rem" }}>vs</span>
        <span style={{ color: "var(--ore)" }}>{fmt(stat)}</span>
      </div>
      <span style={{ color: better ? "var(--green)" : "var(--ore)", fontWeight: 700, fontSize: "0.7rem", textAlign: "right", minWidth: 40 }}>
        {better ? "+" : ""}{fmt(delta)}
      </span>
    </div>
  );
}

/* ── Log entry ────────────────────────────────────────────────── */
function LogEntry({ e }: { e: { t: number; truck: string | null; r: number | null; c: number | null; status: string } }) {
  const ok = e.status === "dumped";
  const iso = e.status.includes("iso");
  const color = ok ? "var(--green)" : iso ? "var(--ore)" : "var(--muted)";
  return (
    <div style={{ fontSize: "0.7rem", fontFamily: "JetBrains Mono", padding: "3px 8px 3px 10px", background: "var(--panel)", borderLeft: `2px solid ${color}`, borderRadius: 2, display: "flex", gap: 4, alignItems: "center", overflow: "hidden", whiteSpace: "nowrap" }}>
      <span style={{ color: "var(--muted)", minWidth: 20 }}>t{e.t}</span>
      <span style={{ color: "var(--text2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{e.truck ?? "—"} ({e.r ?? "-"},{e.c ?? "-"})</span>
      <span style={{ fontSize: "0.6rem", color, letterSpacing: "0.05em", textTransform: "uppercase", flexShrink: 0 }}>{ok ? "OK" : iso ? "REJ" : "SKIP"}</span>
    </div>
  );
}

/* ── Spacing bar ──────────────────────────────────────────────── */
function SpacingBar({ value, target, baseline }: { value: number; target: number; baseline: number }) {
  const pct = Math.min(100, Math.max(0, ((baseline - value) / (baseline - target)) * 100));
  const color = pct > 66 ? "var(--green)" : pct > 33 ? "var(--cat)" : "var(--ore)";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: "0.66rem", fontFamily: "JetBrains Mono", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Mean Spacing</span>
        <span style={{ fontSize: "0.7rem", fontFamily: "JetBrains Mono", color, fontWeight: 700 }}>{value.toFixed(1)}m</span>
      </div>
      <div style={{ height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        <span style={{ fontSize: "0.58rem", color: "var(--muted)", fontFamily: "JetBrains Mono" }}>{value.toFixed(1)}m achieved</span>
        <span style={{ fontSize: "0.58rem", color, fontFamily: "JetBrains Mono" }}>{pct.toFixed(0)}% gap closed</span>
      </div>
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────────────── */
export default function MetricsPanel() {
  const { result, volumeHistory, liveLog, health, lastRunPolicy, liveWhy, liveDumpStage, selectedFleet, customTrucks } = useSimStore();
  const [fleetIntel, setFleetIntel] = useState<FleetIntelligence | null>(null);

  useEffect(() => {
    let stale = false;
    fetchFleetIntelligence(42, selectedFleet.length || 4, selectedFleet, customTrucks)
      .then((d) => { if (!stale && d?.trucks) setFleetIntel(d); }).catch(() => {});
    return () => { stale = true; };
  }, [selectedFleet, customTrucks, result]);

  const summary = result?.summary;
  const staticS = result?.static_summary;
  const chartData = useMemo(() => volumeHistory.map((v, i) => ({ i, v: Math.round(v) })), [volumeHistory]);
  const lastLog = liveLog.slice(0, 14);
  const actualPolicy = result?.summary?.policy ?? lastRunPolicy ?? health?.policy_type ?? "heuristic";
  const isPPO = actualPolicy === "maskable_ppo" || actualPolicy === "ppo";
  const policyLabel =
    actualPolicy === "maskable_ppo" ? "Maskable PPO" :
    actualPolicy === "imitation_bc" ? "Imitation BC" :
    actualPolicy === "hybrid" ? "Hybrid Policy" :
    actualPolicy === "heuristic" ? "Heuristic Mode" :
    String(actualPolicy).replace(/_/g, " ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px 14px 56px", background: "var(--surface)" }}>

        {/* ── 1. Policy mode badge ──────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", background: isPPO ? "rgba(255,205,17,0.06)" : "rgba(255,107,53,0.06)", border: `1px solid ${isPPO ? "rgba(255,205,17,0.18)" : "rgba(255,107,53,0.18)"}`, borderRadius: 4 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: isPPO ? "var(--acid)" : "var(--ore)", boxShadow: isPPO ? "0 0 6px var(--acid)" : "0 0 6px var(--ore)", flexShrink: 0 }} />
          <span style={{ fontSize: "0.7rem", fontFamily: "JetBrains Mono", color: isPPO ? "var(--acid)" : "var(--ore)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {policyLabel}{result ? "" : " · awaiting run"}
          </span>
        </div>
        {/* BC/PPO mismatch warning */}
        {result && !isPPO && (
          <div style={{ padding: "5px 8px", background: "rgba(255,107,53,0.07)", border: "1px solid rgba(255,107,53,0.25)", borderRadius: 4, fontSize: "0.64rem", fontFamily: "JetBrains Mono", color: "var(--ore)", lineHeight: 1.5 }}>
            ⚠ PPO weights not found — running <strong>Imitation BC</strong> fallback. Train PPO or disable ML toggle for pure heuristic.
          </div>
        )}

        {/* ── 2. IoT Fleet Intelligence (always first) ── */}
        <SectionHeader label="IoT Fleet Intelligence" accent />
        {fleetIntel ? (
          <>
            {/* IoT gauges - arc style */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, background: "var(--panel)", border: "1px solid rgba(0,212,255,0.15)", borderRadius: 6, padding: "10px 6px 8px" }}>
              <IoTGauge label="Congest" value={fleetIntel.iot_features.fleet_congestion} color="#FFCD11" />
              <IoTGauge label="Latency" value={fleetIntel.iot_features.haul_latency_norm} color="#FF6B35" />
              <IoTGauge label="Util" value={fleetIntel.iot_features.utilization} color="#22C55E" />
              <IoTGauge label="Density" value={fleetIntel.iot_features.zone_density} color="#00D4FF" />
            </div>
            {/* Phase 2 synthetic sensor gauges — environmental & equipment context */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, background: "var(--panel)", border: "1px solid rgba(0,212,255,0.15)", borderRadius: 6, padding: "10px 6px 8px" }}>
              <IoTGauge label="Visibility" value={fleetIntel.iot_features.weather_visibility} color="#A78BFA" />
              <IoTGauge label="Equip Hlth" value={fleetIntel.iot_features.equipment_health} color="#22C55E" />
              <IoTGauge label="Bearing" value={fleetIntel.iot_features.ground_bearing_capacity} color="#FFCD11" />
              <IoTGauge label="Queue" value={fleetIntel.iot_features.queue_length_norm} color="#FF6B35" />
            </div>
            {/* Truck cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {fleetIntel.trucks.map((t) => (
                <div key={t.id} style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 3, padding: "5px 8px", display: "grid", gridTemplateColumns: "26px 1fr auto", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 2, background: "rgba(255,205,17,0.1)", border: "1px solid rgba(255,205,17,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "JetBrains Mono", fontSize: "0.58rem", fontWeight: 700, color: "var(--cat)" }}>{t.id}</div>
                  <div>
                    <div style={{ fontSize: "0.7rem", fontFamily: "JetBrains Mono", color: "var(--text)", lineHeight: 1, display: "flex", alignItems: "center", gap: 5 }}>
                      {t.profile}
                      {t.is_custom && (
                        <span style={{ fontSize: "0.52rem", fontFamily: "JetBrains Mono", color: "var(--cyan)", border: "1px solid rgba(0,212,255,0.35)", borderRadius: 2, padding: "0 4px", letterSpacing: "0.06em" }}>CUSTOM</span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.58rem", fontFamily: "JetBrains Mono", color: "var(--muted)", marginTop: 1 }}>R={t.turning_radius_m}m · {t.max_payload_t}t</div>
                  </div>
                  <div style={{ fontSize: "0.58rem", fontFamily: "JetBrains Mono", color: "var(--muted)", textAlign: "right" }}>
                    <div>corridor</div>
                    <div style={{ color: "var(--cyan)", fontWeight: 700 }}>{t.min_corridor_width_m}m</div>
                  </div>
                </div>
              ))}
            </div>
            {/* CTDE badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.15)", borderRadius: 3 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--cyan)", animation: "ping 2s infinite" }} />
              <span style={{ fontSize: "0.6rem", fontFamily: "JetBrains Mono", color: "var(--cyan)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                CTDE · {fleetIntel.policy_type.toUpperCase()} · {fleetIntel.trucks.length} agents
              </span>
            </div>
          </>
        ) : (
          <div style={{ padding: "10px 0", textAlign: "center", fontSize: "0.68rem", fontFamily: "JetBrains Mono", color: "var(--muted)" }}>
            Connecting to IoT feed…
          </div>
        )}

        {/* ── Why This Cell — live IoT-driven scoring-weight modulation ── */}
        {liveWhy && (liveWhy.deltas.length > 0 || liveWhy.triggers.length > 0) && (
          <>
            <SectionHeader label="Why This Cell" accent />
            <div style={{ background: "var(--panel)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 6, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
              {liveWhy.deltas.map((d) => (
                <div key={d.weight} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.68rem", fontFamily: "JetBrains Mono" }}>
                  <span style={{ color: "var(--text)", textTransform: "capitalize" }}>{d.weight}</span>
                  <span style={{ color: "var(--muted)" }}>{d.base.toFixed(2)} → {d.modulated.toFixed(2)}</span>
                  <span style={{ color: d.pct_change > 0 ? "#22C55E" : "#FF6B35", fontWeight: 700, minWidth: 50, textAlign: "right" }}>
                    {d.pct_change > 0 ? "▲" : "▼"} {Math.abs(d.pct_change).toFixed(0)}%
                  </span>
                </div>
              ))}
              {liveWhy.triggers.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 2, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
                  {liveWhy.triggers.map((t, i) => (
                    <div key={i} style={{ fontSize: "0.64rem", fontFamily: "JetBrains Mono", color: "var(--muted)", lineHeight: 1.5 }}>
                      <span style={{ color: "#A78BFA" }}>•</span> {t}
                    </div>
                  ))}
                </div>
              )}
              {liveDumpStage && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.64rem", fontFamily: "JetBrains Mono", color: "var(--muted)", marginTop: 2, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
                  <span><span style={{ color: "#A78BFA" }}>•</span> dump #{liveDumpStage.site_dump_count} on site</span>
                  <span style={{ color: liveDumpStage.compaction_applied ? "#FFB800" : "var(--muted)" }}>
                    {liveDumpStage.compaction_applied
                      ? `compaction (existing ${liveDumpStage.cell_pre_height_m.toFixed(2)}m)`
                      : "fresh cell — no compaction"}
                  </span>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── 3. Live KPIs ─────────────────────────────── */}
        <SectionHeader label="Live Metrics" />
        {/* Pack Efficiency — full-width hero KPI */}
        <div style={{ background: "var(--panel)", border: "1px solid rgba(255,205,17,0.22)", borderRadius: 5, padding: "10px 14px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, var(--acid), var(--cyan))" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.66rem", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 3 }}>Pack Efficiency</div>
              <div style={{ fontFamily: "JetBrains Mono", fontSize: "2rem", fontWeight: 700, color: "var(--acid)", lineHeight: 1.15 }}>
                {summary ? `${summary.packing_efficiency.toFixed(1)}%` : "—"}
              </div>
            </div>
            <div style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}>
              <div
                style={{ fontFamily: "JetBrains Mono", fontSize: "0.66rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}
                title="Mean nearest-neighbour distance between individual dump points (raw placement density). Distinct visible piles in the 3D view are clusters of many dumps, so pile-to-pile spacing reads larger than this — hover a peak in Live Terrain to see per-pile spacing."
              >
                Dump Spacing
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontFamily: "JetBrains Mono", fontSize: "1.4rem", fontWeight: 700, color: "var(--cyan)", lineHeight: 1.15 }}>
                  {(result as any)?.spacing_analysis?.mean_spacing_m != null
                    ? `${((result as any).spacing_analysis.mean_spacing_m as number).toFixed(1)}m`
                    : "—"}
                </div>
                {(result as any)?.spacing_analysis?.density_improvement_pct != null && (
                  <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.6rem", color: "var(--green)" }}>
                    ↑ {((result as any).spacing_analysis.density_improvement_pct as number).toFixed(1)}% gap closed vs autonomous
                  </div>
                )}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border)", fontSize: "0.6rem", fontFamily: "JetBrains Mono", color: "var(--text2)", lineHeight: 1.5 }}>
            Dump spacing = nearest-neighbour distance between raw dump points (placement density). Pile-to-pile spacing in the 3D view is larger because each visible peak is a cluster of many dumps — hover a peak for its measured pile spacing.
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
          <KPICard label="Volume" value={summary ? Math.round(summary.total_volume).toLocaleString() : "—"} sub="m³" />
          <KPICard label="Coverage" value={summary ? `${summary.coverage_pct.toFixed(1)}%` : "—"} sub="polygon" />
          <KPICard label="Uniformity" value={summary ? `${(summary.height_uniformity * 100).toFixed(1)}%` : "—"} sub="1−σ/μ" />
          <KPICard label="Iso Events" value={summary ? String(summary.isolation_events) : "—"} sub="rejected" color="var(--ore)" />
          <KPICard label="Latency" value={summary ? `${summary.latency_ms}ms` : "—"} sub="end-to-end (network)"
            hint="End-to-end network latency: full round trip from React → FastAPI → ML inference → React. Includes HTTP/serialization overhead, not just compute. The Audit page's 'Compute Latency' shows pure backend execution time (time.perf_counter diff) — the two numbers measure different things by design."
            color="var(--cyan)" />
          <KPICard label="Dispatched" value={summary ? String(summary.total_dispatched) : "—"} sub="trucks" />
        </div>

        {/* ── 4. Packing density vs staffed ─────────────── */}
        {(() => {
          const sp = (result as any)?.spacing_analysis as SpacingAnalysis | undefined;
          if (!sp?.mean_spacing_m) return null;
          return (
            <>
              <SectionHeader label="Packing Density" />
              <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 4, padding: "8px 10px" }}>
                <SpacingBar value={sp.mean_spacing_m} target={sp.staffed_target_m} baseline={sp.autonomous_baseline_m} />
                <div style={{ marginTop: 7, padding: "5px 8px", background: sp.density_improvement_pct > 50 ? "rgba(34,197,94,0.07)" : "rgba(255,205,17,0.07)", border: `1px solid ${sp.density_improvement_pct > 50 ? "rgba(34,197,94,0.18)" : "rgba(255,205,17,0.18)"}`, borderRadius: 3 }}>
                  <div style={{ fontSize: "0.6rem", fontFamily: "JetBrains Mono", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Closing gap to staffed ops</div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700, fontFamily: "JetBrains Mono", color: sp.density_improvement_pct > 50 ? "var(--green)" : "var(--cat)", lineHeight: 1.2 }}>{sp.density_improvement_pct.toFixed(1)}%</div>
                  <div style={{ fontSize: "0.58rem", color: "var(--text2)", fontFamily: "JetBrains Mono" }}>auto {sp.autonomous_baseline_m}m → staffed {sp.staffed_target_m}m target</div>
                </div>
              </div>
            </>
          );
        })()}

        {/* ── 5. ADIOS vs static baseline ──────────────── */}
        {summary && staticS && (
          <>
            <SectionHeader label="ADIOS vs Static" />
            <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 4, padding: "7px 10px" }}>
              <DeltaRow label="Vol" adios={summary.total_volume} stat={staticS.volume} fmt={(v) => Math.round(v).toLocaleString()} />
              <DeltaRow label="Cov%" adios={summary.coverage_pct} stat={staticS.coverage_pct} />
              <DeltaRow label="Eff%" adios={summary.packing_efficiency} stat={staticS.packing_efficiency} />
            </div>
          </>
        )}

        {/* ── 6. Volume chart ───────────────────────────── */}
        {chartData.length > 1 && (
          <>
            <SectionHeader label="Volume Progress" />
            <div style={{ height: 64, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 4, padding: 4, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="i" hide />
                  <Tooltip
                    contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", fontFamily: "JetBrains Mono", fontSize: "0.7rem", color: "var(--text)" }}
                    formatter={(v: number) => [v.toLocaleString(), "m³"]}
                    labelFormatter={() => ""}
                  />
                  <Line type="monotone" dataKey="v" stroke="var(--cat)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {/* ── 7. Dispatch log ───────────────────────────── */}
        <SectionHeader label="Dispatch Log" />
        <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 160, overflowY: "auto" }}>
          {lastLog.length === 0 ? (
            <div style={{ fontSize: "0.7rem", color: "var(--muted)", fontFamily: "JetBrains Mono", padding: "6px 0" }}>Awaiting simulation…</div>
          ) : (
            lastLog.map((e, i) => <LogEntry key={i} e={e} />)
          )}
        </div>
    </div>
  );
}
