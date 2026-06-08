"use client";
/**
 * BenchmarkPanel — ADIOS vs Static vs ML
 *
 * REWRITTEN: All data now comes from real backend benchmark results.
 * - Bar chart: real heuristic volume vs real static volume per seed
 * - Radar chart: real computed aggregates (no hardcoded values)
 * - Summary KPIs: real averages from backend data
 * - ML column: only shown when eval_result.json exists (never fabricated)
 */
import React, { useEffect, useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, Legend, CartesianGrid,
} from "recharts";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types matching real benchmark_results.json ──────────────────────────────

interface PerPolygonRow {
  policy: "heuristic" | "static_grid" | string;
  seed: number;
  material: string;
  dumps_attempted?: number;
  dumps_succeeded: number;
  volume_m3: number;
  coverage_pct: number;
  packing_efficiency: number;
  height_uniformity: number;
  rejection_rate: number;
  mean_spacing_m: number;
  latency_ms: number;
}

interface KPIAgg {
  mean: number | null;
  std: number | null;
  min: number | null;
  max: number | null;
}

interface PolicySummary {
  policy: string;
  n_polygons: number;
  kpis: Record<string, KPIAgg | number>;
}

interface BenchmarkData {
  meta?: { n_polygons: number; n_dumps_per_polygon: number; seed_start: number; elapsed_s: number };
  per_polygon: PerPolygonRow[];
  summaries: PolicySummary[];
}

interface EvalResult {
  ml_efficiency: number | null;
  heuristic_efficiency: number | null;
  delta: number | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function kpiMean(summary: PolicySummary | undefined, key: string): number | null {
  if (!summary) return null;
  const v = summary.kpis[key];
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && v.mean != null) return v.mean;
  return null;
}

// ── Tooltip ─────────────────────────────────────────────────────────────────

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
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(1) : p.value}
        </div>
      ))}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function BenchmarkPanel() {
  const [data, setData]         = useState<BenchmarkData | null>(null);
  const [evalR, setEvalR]       = useState<EvalResult | null>(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<"bar" | "radar" | "table">("bar");

  // Fetch real data from backend
  useEffect(() => {
    let stale = false;
    Promise.all([
      fetch(`${API}/benchmark`).then((r) => r.json()).catch(() => null),
      fetch(`${API}/eval_result`).then((r) => r.json()).catch(() => null),
    ]).then(([bdata, edata]) => {
      if (stale) return;
      if (bdata && bdata.per_polygon && bdata.summaries) {
        // Full benchmark_results.json
        setData(bdata);
      } else if (Array.isArray(bdata)) {
        // Legacy baseline array — convert to full format
        const perPoly: PerPolygonRow[] = bdata.map((r: any) => ({
          policy: "heuristic",
          seed: r.seed,
          material: r.material,
          dumps_succeeded: r.heuristic?.dumps ?? 0,
          volume_m3: r.heuristic?.volume ?? 0,
          coverage_pct: r.heuristic?.coverage_pct ?? 0,
          packing_efficiency: r.heuristic?.efficiency ?? 0,
          height_uniformity: r.heuristic?.uniformity ?? 0,
          rejection_rate: 0,
          mean_spacing_m: 0,
          latency_ms: 0,
        }));
        setData({ per_polygon: perPoly, summaries: [] });
      }
      if (edata && edata.ml_efficiency != null) setEvalR(edata);
      setLoading(false);
    });
    return () => { stale = true; };
  }, []);

  // ── Derive real data per seed ─────────────────────────────────────────────

  const { seeds, heuristicRows, staticRows, mlRows, hSummary, sSummary, mSummary } = useMemo(() => {
    if (!data) return { seeds: [], heuristicRows: [], staticRows: [], mlRows: [], hSummary: undefined, sSummary: undefined, mSummary: undefined };

    const hRows = data.per_polygon.filter((r) => r.policy === "heuristic");
    const sRows = data.per_polygon.filter((r) => r.policy === "static_grid");
    const mRows = data.per_polygon.filter((r) => !["heuristic", "static_grid", "ml_error"].includes(r.policy));
    const allSeeds = [...new Set(hRows.map((r) => r.seed))];

    return {
      seeds: allSeeds,
      heuristicRows: hRows,
      staticRows: sRows,
      mlRows: mRows,
      hSummary: data.summaries.find((s) => s.policy === "heuristic"),
      sSummary: data.summaries.find((s) => s.policy === "static_grid"),
      mSummary: data.summaries.find((s) => !["heuristic", "static_grid"].includes(s.policy)),
    };
  }, [data]);

  // ── Bar chart — real data per seed ────────────────────────────────────────

  const barData = useMemo(() => {
    const staticBySeed = new Map(staticRows.map((r) => [r.seed, r]));
    const mlBySeed = new Map(mlRows.map((r) => [r.seed, r]));

    return seeds.slice(0, 12).map((seed) => {
      const h = heuristicRows.find((r) => r.seed === seed);
      const s = staticBySeed.get(seed);
      const m = mlBySeed.get(seed);
      const mat = h?.material ?? "";

      return {
        name: `s${seed % 100}\n${mat.slice(0, 3)}`,
        ADIOS: h ? parseFloat(h.volume_m3.toFixed(0)) : 0,
        Static: s ? parseFloat(s.volume_m3.toFixed(0)) : 0,
        ...(m ? { ML: parseFloat(m.volume_m3.toFixed(0)) } : {}),
      };
    });
  }, [seeds, heuristicRows, staticRows, mlRows]);

  // ── Radar chart — real aggregated data ────────────────────────────────────

  const radarData = useMemo(() => {
    if (heuristicRows.length === 0) return [];

    const hVol = avg(heuristicRows.map((r) => r.volume_m3));
    const sVol = avg(staticRows.map((r) => r.volume_m3));
    const mVol = mlRows.length ? avg(mlRows.map((r) => r.volume_m3)) : null;

    const hCov = avg(heuristicRows.map((r) => r.coverage_pct));
    const sCov = avg(staticRows.map((r) => r.coverage_pct));
    const mCov = mlRows.length ? avg(mlRows.map((r) => r.coverage_pct)) : null;

    const hLat = avg(heuristicRows.map((r) => r.latency_ms));
    const sLat = avg(staticRows.map((r) => r.latency_ms));
    const mLat = mlRows.length ? avg(mlRows.map((r) => r.latency_ms)) : null;

    const hSpac = avg(heuristicRows.map((r) => r.mean_spacing_m));
    const sSpac = avg(staticRows.map((r) => r.mean_spacing_m));
    const mSpac = mlRows.length ? avg(mlRows.map((r) => r.mean_spacing_m)) : null;

    // Normalise to 0-100 scale for radar comparability
    const maxVol = Math.max(hVol, sVol, mVol ?? 0, 1);
    const maxLat = Math.max(hLat, sLat, mLat ?? 0, 0.01);

    const base = [
      { metric: "Volume",   ADIOS: (hVol / maxVol) * 100, Static: (sVol / maxVol) * 100 },
      { metric: "Coverage", ADIOS: hCov, Static: sCov },
      { metric: "Spacing",  ADIOS: Math.min(100, hSpac * 10), Static: Math.min(100, sSpac * 10) },
      // Latency: lower is better → invert
      { metric: "Speed",    ADIOS: Math.max(0, 100 - hLat * 10), Static: Math.max(0, 100 - sLat * 10) },
      { metric: "Success",  ADIOS: (1 - avg(heuristicRows.map(r => r.rejection_rate))) * 100,
                             Static: (1 - avg(staticRows.map(r => r.rejection_rate))) * 100 },
    ];

    // Add ML column if available
    if (mlRows.length > 0) {
      base[0] = { ...base[0], ML: ((mVol ?? 0) / maxVol) * 100 } as any;
      base[1] = { ...base[1], ML: mCov } as any;
      base[2] = { ...base[2], ML: Math.min(100, (mSpac ?? 0) * 10) } as any;
      base[3] = { ...base[3], ML: Math.max(0, 100 - (mLat ?? 0) * 10) } as any;
      base[4] = { ...base[4], ML: (1 - avg(mlRows.map(r => r.rejection_rate))) * 100 } as any;
    }

    return base;
  }, [heuristicRows, staticRows, mlRows]);

  // ── Aggregate KPIs ────────────────────────────────────────────────────────

  const hasML = mlRows.length > 0 || (evalR?.ml_efficiency != null);

  const aggHeurVol  = hSummary ? kpiMean(hSummary, "volume_m3") : (heuristicRows.length ? avg(heuristicRows.map(r => r.volume_m3)) : null);
  const aggStatVol  = sSummary ? kpiMean(sSummary, "volume_m3") : (staticRows.length ? avg(staticRows.map(r => r.volume_m3)) : null);
  const aggHeurCov  = hSummary ? kpiMean(hSummary, "coverage_pct") : (heuristicRows.length ? avg(heuristicRows.map(r => r.coverage_pct)) : null);
  const aggStatCov  = sSummary ? kpiMean(sSummary, "coverage_pct") : (staticRows.length ? avg(staticRows.map(r => r.coverage_pct)) : null);

  const deltaVol = (aggHeurVol != null && aggStatVol != null && aggStatVol > 0)
    ? `+${(((aggHeurVol - aggStatVol) / aggStatVol) * 100).toFixed(0)}%`
    : "—";

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
          Benchmark — ADIOS vs Static{hasML ? " vs ML" : ""}
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

      {/* Summary KPIs — all from real data */}
      {heuristicRows.length > 0 && (
        <div style={{ display: "flex", gap: 8, padding: "8px 14px",
          borderBottom: "1px solid var(--border)", flexWrap: "wrap", flexShrink: 0 }}>
          {[
            { label: "ADIOS Vol (avg)", val: aggHeurVol != null ? `${Math.round(aggHeurVol)} m³` : "—", color: "var(--acid)" },
            { label: "Static Vol (avg)", val: aggStatVol != null ? `${Math.round(aggStatVol)} m³` : "—", color: "var(--ore)" },
            ...(hasML ? [{ label: "ML Est.", val: evalR?.ml_efficiency != null ? `${evalR.ml_efficiency.toFixed(1)}%` : "—", color: "#7B68EE" }] : []),
            { label: "Δ ADIOS/Static", val: deltaVol, color: "var(--acid)" },
            { label: "Polygons", val: `${seeds.length}`, color: "var(--text2)" },
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
        ) : heuristicRows.length === 0 ? (
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
          </div>
        ) : tab === "bar" ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 8, right: 8, bottom: 24, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 8,
                fontFamily: "JetBrains Mono" }} interval={0} />
              <YAxis tick={{ fill: "var(--muted)", fontSize: 9,
                fontFamily: "JetBrains Mono" }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: "0.68rem",
                color: "var(--text2)", paddingTop: 8 }} />
              <Bar dataKey="ADIOS"  fill="#FFC000" fillOpacity={0.85} radius={[2,2,0,0]} />
              {hasML && <Bar dataKey="ML" fill="#7B68EE" fillOpacity={0.85} radius={[2,2,0,0]} />}
              <Bar dataKey="Static" fill="#FF5722" fillOpacity={0.75} radius={[2,2,0,0]} />
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
              {hasML && (
                <Radar name="ML" dataKey="ML"
                  stroke="#7B68EE" fill="#7B68EE" fillOpacity={0.18} />
              )}
              <Radar name="Static" dataKey="Static"
                stroke="#FF5722" fill="#FF5722" fillOpacity={0.14} />
              <Legend wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: "0.68rem" }} />
              <Tooltip content={<CustomTooltip />} />
            </RadarChart>
          </ResponsiveContainer>
        ) : (
          // Table view
          <div style={{ overflowY: "auto", height: "100%" }}>
            <table style={{ width: "100%", borderCollapse: "collapse",
              fontFamily: "JetBrains Mono", fontSize: "0.7rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", position: "sticky", top: 0,
                  background: "var(--panel)", zIndex: 1 }}>
                  {["Seed", "Material", "Policy", "Dumps", "Volume m³", "Coverage%", "Spacing", "Latency ms"]
                    .map((h) => (
                      <th key={h} style={{ padding: "5px 8px", textAlign: "left",
                        color: "var(--muted)", fontWeight: 400, letterSpacing: "0.06em" }}>
                        {h}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {data?.per_polygon.map((r, i) => (
                  <tr key={i}
                    style={{ borderBottom: "1px solid rgba(26,48,64,0.4)" }}>
                    <td style={{ padding: "5px 8px", color: "var(--text2)" }}>{r.seed}</td>
                    <td style={{ padding: "5px 8px", color: "var(--text)" }}>{r.material}</td>
                    <td style={{ padding: "5px 8px",
                      color: r.policy === "heuristic" ? "var(--acid)" : r.policy === "static_grid" ? "var(--ore)" : "#7B68EE",
                      fontWeight: 600 }}>
                      {r.policy === "heuristic" ? "ADIOS" : r.policy === "static_grid" ? "Static" : r.policy.replace(/_/g, " ")}
                    </td>
                    <td style={{ padding: "5px 8px", color: "var(--text)" }}>{r.dumps_succeeded}</td>
                    <td style={{ padding: "5px 8px", color: "var(--text)" }}>{r.volume_m3.toFixed(0)}</td>
                    <td style={{ padding: "5px 8px", color: "var(--acid)" }}>{r.coverage_pct}%</td>
                    <td style={{ padding: "5px 8px", color: "var(--text2)" }}>{r.mean_spacing_m}</td>
                    <td style={{ padding: "5px 8px", color: "var(--text2)" }}>{r.latency_ms.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
