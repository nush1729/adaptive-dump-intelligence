"use client";
import React, { useMemo } from "react";
import type { DumpEvent, SimResultWithSpacing } from "@/types/adios";

interface ROIPanelProps {
  log: DumpEvent[];
  result: SimResultWithSpacing | null;
}

// Illustrative industry-proxy constants — surfaced so the estimate is auditable,
// not a black box. Real deployments would source these from site contracts /
// fuel-procurement data; these are reasonable open-pit-mining order-of-magnitude figures.
const ASSUMPTIONS = {
  revenuePerTonne: 38,       // USD — mine-gate ore value proxy
  opCostPerTonne: 9,         // USD — haul + dump operating cost (fuel, labor, wear)
  rejectionCostPerEvent: 140, // USD — wasted cycle cost when ISO validator rejects a placement
  truckHourCost: 310,        // USD — fully-loaded haul-truck operating cost per hour
  cycleMinutes: 9,           // assumed minutes per haul-dump cycle, for hour estimation
};

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

function StatRow({ label, value, sub, color = "var(--text)" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
      <span className="text-[0.7rem] uppercase tracking-[0.08em]" style={{ color: "var(--muted)" }}>{label}</span>
      <div className="text-right">
        <div className="text-[0.95rem] font-bold tabular-nums" style={{ color }}>{value}</div>
        {sub && <div className="text-[0.62rem]" style={{ color: "var(--muted)" }}>{sub}</div>}
      </div>
    </div>
  );
}

/** Derives an illustrative economic-impact estimate from simulation throughput —
 *  translates tonnage / rejection / dispatch counts into $-denominated ROI signals
 *  so operators can reason about a run in business terms, not just physics terms. */
export default function ROIPanel({ log, result }: ROIPanelProps) {
  const stats = useMemo(() => {
    let tonnage = 0;
    let dumps = 0;
    let rejections = 0;
    const trucks = new Set<string>();

    for (const e of log) {
      if (e.status === "dumped") {
        tonnage += e.payload_t || 0;
        dumps += 1;
        if (e.truck && e.truck !== "—") trucks.add(e.truck);
      } else if (e.status?.startsWith("iso_rejected")) {
        rejections += 1;
      }
    }

    const revenue = tonnage * ASSUMPTIONS.revenuePerTonne;
    const opCost = tonnage * ASSUMPTIONS.opCostPerTonne;
    const rejectionCost = rejections * ASSUMPTIONS.rejectionCostPerEvent;
    const cycleHours = (dumps * ASSUMPTIONS.cycleMinutes) / 60;
    const fleetHourCost = cycleHours * ASSUMPTIONS.truckHourCost;
    const netMargin = revenue - opCost - rejectionCost - fleetHourCost;
    const tonnePerTruck = trucks.size > 0 ? tonnage / trucks.size : 0;
    const costPerTonne = tonnage > 0 ? (opCost + rejectionCost + fleetHourCost) / tonnage : 0;

    return { tonnage, dumps, rejections, trucks: trucks.size, revenue, opCost, rejectionCost, fleetHourCost, netMargin, tonnePerTruck, costPerTonne, cycleHours };
  }, [log]);

  if (stats.dumps === 0) {
    return (
      <div className="flex items-center justify-center h-full font-mono text-[1.01rem] uppercase tracking-widest"
        style={{ color: "var(--muted)" }}>
        Run a simulation to see economic impact
      </div>
    );
  }

  const marginColor = stats.netMargin >= 0 ? "var(--green)" : "#FF5722";

  return (
    <div className="font-mono h-full flex flex-col">
      <div className="mb-3">
        <div className="text-[0.66rem] uppercase tracking-[0.12em]" style={{ color: "var(--muted)" }}>Estimated run economics</div>
        <div className="text-[2rem] font-bold leading-tight" style={{ color: marginColor }}>{fmtUsd(stats.netMargin)}</div>
        <div className="text-[0.64rem]" style={{ color: "var(--muted)" }}>
          net margin · {Math.round(stats.tonnage).toLocaleString()}t moved across {stats.dumps} dumps · {stats.trucks} trucks
        </div>
      </div>

      <div className="flex flex-col">
        <StatRow label="Revenue (ore value)" value={fmtUsd(stats.revenue)} sub={`${ASSUMPTIONS.revenuePerTonne}/t × ${Math.round(stats.tonnage).toLocaleString()}t`} color="var(--green)" />
        <StatRow label="Haul/dump op. cost" value={`-${fmtUsd(stats.opCost)}`} sub={`${ASSUMPTIONS.opCostPerTonne}/t`} color="var(--ore)" />
        <StatRow label="Fleet-hour cost" value={`-${fmtUsd(stats.fleetHourCost)}`} sub={`~${stats.cycleHours.toFixed(1)}h @ ${fmtUsd(ASSUMPTIONS.truckHourCost)}/h`} color="var(--ore)" />
        <StatRow label="Rejection waste" value={`-${fmtUsd(stats.rejectionCost)}`} sub={`${stats.rejections} iso_rejected × ${fmtUsd(ASSUMPTIONS.rejectionCostPerEvent)}`} color="#FF5722" />
        <StatRow label="Avg tonnage / truck" value={`${Math.round(stats.tonnePerTruck).toLocaleString()}t`} />
        <StatRow label="Cost / tonne moved" value={fmtUsd(stats.costPerTonne)} />
      </div>

      <div className="mt-auto pt-2 text-[0.58rem] leading-relaxed" style={{ color: "var(--muted)" }}>
        Illustrative estimate using fixed proxy rates (${ASSUMPTIONS.revenuePerTonne}/t revenue,
        ${ASSUMPTIONS.opCostPerTonne}/t op-cost, ${ASSUMPTIONS.truckHourCost}/h fleet,
        ~{ASSUMPTIONS.cycleMinutes}min/cycle) — meant to translate simulation throughput into
        business-comparable terms, not as a site-specific financial forecast.
      </div>
    </div>
  );
}
