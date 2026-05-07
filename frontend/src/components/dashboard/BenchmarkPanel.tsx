"use client";
/**
 * BenchmarkPanel — ADIOS vs Static vs ML
 *
 * Reads per-seed benchmark data from /benchmark endpoint.
 * Each seed row may contain: { heuristic: {...}, ml: {...}, static: {...} }
 * Shows real per-seed ML data instead of a flat eval_result value.
 */
import React, { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, Legend, CartesianGrid,
} from "recharts";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface PolicyData {
  dumps: number;
  volume: number;
  coverage_pct: number;
  efficiency: number;
  uniformity: number;
}

interface BenchmarkRow {
  seed: number;
  material: string;
  heuristic: PolicyData;
  ml?: PolicyData;
  static?: PolicyData;
}

interface EvalResult {
  ml_efficiency: number | null;
  heuristic_efficiency: number | null;
  ml_coverage?: number | null;
  heuristic_coverage?: number | null;
  delta: number | null;
  model_type?: string;
  computed_at?: string;
}

// Recharts custom tooltip
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--panel)", border: "1px solid var(--border)",
      padding: "8px 12px", fontFamily: "JetBrains Mono", fontSize: "0.75rem",
    }}>
      <div style={{ color: "var(--text2)", marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(2) : p.value}
        </div>
      ))}
    </div>
  );
}

export default function BenchmarkPanel() {
  const [rows, setRows]       = useState<BenchmarkRow[]>([]);
  const [evalR, setEvalR]     = useState<EvalResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<"bar"|"radar"|"table">("bar");

  useEffect(() => {
    Promise.all([
      fetch(`${API}/benchmark`).then((r) => r.json()).catch(() => []),
      fetch(`${API}/eval_result`).then((r) => r.json()).catch(() => null),
    ]).then(([bdata, edata]) => {
      // /benchmark can return the baseline array OR the full results object
      if (Array.isArray(bdata)) {
        setRows(bdata);
      } else if (bdata?.per_polygon) {
        // Full benchmark_results.json: group by seed, merge policies
        const bySeeed: Record<number, BenchmarkRow> = {};
        for (const row of bdata.per_polygon) {
          const seed = row.seed;
          if (!bySeeed[seed]) {
            bySeeed[seed] = { seed, material: row.material, heuristic: { dumps: 0, volume: 0, coverage_pct: 0, efficiency: 0, uniformity: 0 } };
          }
          const pData: PolicyData = {
            dumps:        row.dumps_succeeded ?? 0,
            volume:       row.volume_m3 ?? 0,
            coverage_pct: row.coverage_pct ?? 0,
            efficiency:   row.packing_efficiency ?? 0,
            uniformity:   row.height_uniformity ?? 0,
          };
          if (row.policy === "heuristic") {
            bySeeed[seed].heuristic = pData;
          } else if (row.policy === "ml_ppo") {
            bySeeed[seed].ml = pData;
          } else if (row.policy === "static_grid") {
            bySeeed[seed].static = pData;
          }
        }
        setRows(Object.values(bySeeed));
      }
      if (edata) setEvalR(edata);
      setLoading(false);
    });
  }, []);

  // Choose the best non-zero metric to display
  const allEffZero = rows.every((r) => r.heuristic.efficiency === 0);
  const primaryMetric = allEffZero ? "coverage_pct" : "efficiency";
  const metricLabel   = allEffZero ? "Coverage %" : "Efficiency %";

  // Check if we have real per-seed ML data
  const hasPerSeedML = rows.some((r) => r.ml != null);

  // Aggregate stats
  const agg = rows.length ? {
    heur_primary: rows.reduce((s, r) => s + (r.heuristic as any)[primaryMetric], 0) / rows.length,
    heur_cov:  rows.reduce((s, r) => s + r.heuristic.coverage_pct, 0) / rows.length,
    heur_vol:  rows.reduce((s, r) => s + r.heuristic.volume, 0) / rows.length,
    heur_uni:  rows.reduce((s, r) => s + r.heuristic.uniformity, 0) / rows.length,
    ml_primary: hasPerSeedML
      ? rows.filter(r => r.ml).reduce((s, r) => s + (r.ml as any)[primaryMetric], 0) / rows.filter(r => r.ml).length
      : null,
    ml_cov: hasPerSeedML
      ? rows.filter(r => r.ml).reduce((s, r) => s + r.ml!.coverage_pct, 0) / rows.filter(r => r.ml).length
      : null,
    ml_vol: hasPerSeedML
      ? rows.filter(r => r.ml).reduce((s, r) => s + r.ml!.volume, 0) / rows.filter(r => r.ml).length
      : null,
  } : null;

  // Bar chart data: first 12 seeds with REAL per-seed ML data
  const barData = rows.slice(0, 12).map((r) => {
    const hVal = (r.heuristic as any)[primaryMetric] as number;
    // Use real per-seed ML data if available, otherwise fall back to eval_result
    const mlVal = r.ml
      ? (r.ml as any)[primaryMetric] as number
      : (evalR?.ml_efficiency != null ? evalR.ml_efficiency : null);
    return {
      name: `s${r.seed % 100}\n${r.material.slice(0, 3)}`,
      ADIOS: parseFloat(hVal.toFixed(2)),
      ...(mlVal !== null ? { ML: parseFloat(Number(mlVal).toFixed(2)) } : {}),
    };
  });

  // Radar chart: use real aggregates
  const mlRadarEff = agg?.ml_primary ?? evalR?.ml_efficiency ?? null;
  const radarBase = agg?.heur_primary ?? 50;
  const radarData = agg ? [
    { metric: metricLabel,  ADIOS: radarBase, ...(mlRadarEff != null ? { ML: mlRadarEff } : {}) },
    { metric: "Coverage %", ADIOS: agg.heur_cov, ...(agg.ml_cov != null ? { ML: agg.ml_cov } : {}) },
    { metric: "Volume",     ADIOS: Math.min(100, agg.heur_vol / 200), ...(agg.ml_vol != null ? { ML: Math.min(100, agg.ml_vol / 200) } : {}) },
  ] : [];

  // Delta computation
  const delta = agg && agg.ml_primary != null
    ? agg.ml_primary - agg.heur_primary
    : evalR?.delta ?? null;

  const tabs = ["bar", "radar", "table"] as const;

  return (
    <div style={{
      background: "var(--panel)",
      border: "1px solid var(--border)",
      borderRadius: 4, height: "100%",
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: "Syncopate", fontSize: "0.75rem",
          letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text2)" }}>
          Benchmark — ADIOS vs Static vs ML
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                background: tab === t ? "rgba(200,255,0,0.1)" : "transparent",
                border: tab === t ? "1px solid var(--acid)" : "1px solid var(--border)",
                color: tab === t ? "var(--acid)" : "var(--muted)",
                fontFamily: "JetBrains Mono", fontSize: "0.52rem",
                letterSpacing: "0.08em", textTransform: "uppercase",
                padding: "3px 10px", cursor: "pointer", borderRadius: 3,
              }}>
              {t}
            </button>
          ))}
        </div>
      </div>


      {/* Summary KPIs */}
      {agg && (
        <div style={{ display: "flex", gap: 8, padding: "8px 14px",
          borderBottom: "1px solid var(--border)", flexWrap: "wrap", flexShrink: 0 }}>
          {[
            { label: `ADIOS ${metricLabel}`, val: `${agg.heur_primary.toFixed(2)}%`, color: "var(--acid)" },
            {
              label: hasPerSeedML ? "ML (real)" : "ML Est.",
              val: (agg.ml_primary ?? evalR?.ml_efficiency) ? `${(agg.ml_primary ?? evalR?.ml_efficiency)!.toFixed(1)}%` : "—",
              color: "#7B68EE",
            },
            ...(delta != null ? [{
              label: "Δ ML vs Heur",
              val: `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`,
              color: delta > 0 ? "var(--acid)" : "var(--ore)",
            }] : []),
            { label: "Polygons", val: `${rows.length}`, color: "var(--text2)" },
          ].map(({ label, val, color }) => (
            <div key={label} style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              padding: "4px 10px", borderRadius: 3,
            }}>
              <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.46rem",
                color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {label}
              </div>
              <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.8rem",
                color, fontWeight: 600 }}>
                {val}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chart area */}
      <div style={{ flex: 1, padding: "10px 14px", minHeight: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", fontFamily: "JetBrains Mono", fontSize: "0.75rem",
            color: "var(--muted)" }}>
            LOADING BENCHMARK DATA…
          </div>
        ) : rows.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", textAlign: "center",
            fontFamily: "JetBrains Mono", fontSize: "0.75rem", color: "var(--muted)",
            lineHeight: 1.8, flexDirection: "column", gap: 8 }}>
            <div>No benchmark data found.</div>
            <div>Generate it by running:</div>
            <code style={{ color: "var(--acid)", background: "var(--panel)",
              padding: "4px 12px", borderRadius: 3, fontSize: "0.7rem" }}>
              cd backend && python evaluation/benchmark.py
            </code>
            <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: 4 }}>
              or: python ml/data_gen.py
            </div>
          </div>
        ) : tab === "bar" ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 8, right: 8, bottom: 24, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 8,
                fontFamily: "JetBrains Mono" }} interval={0} />
              <YAxis tick={{ fill: "var(--muted)", fontSize: 9,
                fontFamily: "JetBrains Mono" }} unit="%" />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: "0.58rem",
                color: "var(--text2)", paddingTop: 8 }} />
              <Bar dataKey="ADIOS"  fill="#FFC000" fillOpacity={0.85} radius={[2,2,0,0]} />
              {(hasPerSeedML || evalR?.ml_efficiency != null) && <Bar dataKey="ML" fill="#7B68EE" fillOpacity={0.85} radius={[2,2,0,0]} />}
            </BarChart>
          </ResponsiveContainer>
        ) : tab === "radar" ? (
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="70%">
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis dataKey="metric"
                tick={{ fill: "var(--text2)", fontSize: 9, fontFamily: "JetBrains Mono" }} />
              <Radar name="ADIOS"  dataKey="ADIOS"
                stroke="#FFC000" fill="#FFC000" fillOpacity={0.18} />
              {mlRadarEff != null && (
                <Radar name="ML" dataKey="ML" stroke="#7B68EE" fill="#7B68EE" fillOpacity={0.18} />
              )}
              <Legend wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: "0.58rem" }} />
              <Tooltip content={<CustomTooltip />} />
            </RadarChart>
          </ResponsiveContainer>
        ) : (
          // Table view — now includes ML columns
          <div style={{ overflowY: "auto", height: "100%" }}>
            <table style={{ width: "100%", borderCollapse: "collapse",
              fontFamily: "JetBrains Mono", fontSize: "0.7rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", position: "sticky", top: 0,
                  background: "var(--panel)", zIndex: 1 }}>
                  {["Seed","Material","Dumps","Coverage%",`${metricLabel}%`,
                    ...(hasPerSeedML ? ["ML Cov%", `ML ${metricLabel}%`, "Δ"] : [])]
                    .map((h) => (
                      <th key={h} style={{ padding: "5px 8px", textAlign: "left",
                        color: "var(--muted)", fontWeight: 400, letterSpacing: "0.06em" }}>
                        {h}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const hVal = (r.heuristic as any)[primaryMetric];
                  const mVal = r.ml ? (r.ml as any)[primaryMetric] : null;
                  const d = mVal != null ? mVal - hVal : null;
                  return (
                    <tr key={r.seed}
                      style={{ borderBottom: "1px solid rgba(26,48,64,0.4)" }}>
                      <td style={{ padding: "5px 8px", color: "var(--text2)" }}>{r.seed}</td>
                      <td style={{ padding: "5px 8px", color: "var(--text)" }}>{r.material}</td>
                      <td style={{ padding: "5px 8px", color: "var(--text)" }}>{r.heuristic.dumps}</td>
                      <td style={{ padding: "5px 8px", color: "var(--acid)" }}>{r.heuristic.coverage_pct}%</td>
                      <td style={{ padding: "5px 8px",
                        color: hVal > 0 ? "var(--acid)" : "var(--ore)",
                        fontWeight: 600 }}>
                        {hVal > 0 ? `${hVal}%` : `${r.heuristic.coverage_pct}%`}
                      </td>
                      {hasPerSeedML && (
                        <>
                          <td style={{ padding: "5px 8px", color: "#7B68EE" }}>
                            {r.ml ? `${r.ml.coverage_pct}%` : "—"}
                          </td>
                          <td style={{ padding: "5px 8px", color: "#7B68EE", fontWeight: 600 }}>
                            {mVal != null ? `${mVal}%` : "—"}
                          </td>
                          <td style={{ padding: "5px 8px",
                            color: d != null ? (d > 0 ? "var(--acid)" : "var(--ore)") : "var(--muted)",
                            fontWeight: 600 }}>
                            {d != null ? `${d > 0 ? "+" : ""}${d.toFixed(1)}%` : "—"}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}