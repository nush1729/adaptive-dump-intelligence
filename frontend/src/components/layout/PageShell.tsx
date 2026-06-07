"use client";
import React, { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import CollapsibleSidebar from "@/components/layout/CollapsibleSidebar";
import { useSimStore } from "@/store/simStore";

interface PageShellProps {
  leftTitle: string;
  leftSubtitle?: string;
  leftContent: React.ReactNode;
  leftRail?: React.ReactNode;
  children: React.ReactNode;
  rightContent?: React.ReactNode;
  rightTitle?: string;
  rightSubtitle?: string;
  rightRail?: React.ReactNode;
}

export default function PageShell({
  leftTitle,
  leftSubtitle,
  leftContent,
  leftRail,
  children,
  rightContent,
  rightTitle = "Metrics",
  rightSubtitle,
  rightRail,
}: PageShellProps) {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const { isRunning, result, useML, lastRunPolicy, selectedFleet, material } = useSimStore();

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1180px)");
    const sync = () => {
      setLeftCollapsed(mq.matches);
      setRightCollapsed(mq.matches);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <div className="adios-page-shell">
      <NavBar />
      <div className="adios-page-content">
        <CollapsibleSidebar
          title={leftTitle}
          subtitle={leftSubtitle}
          collapsed={leftCollapsed}
          onToggle={() => setLeftCollapsed((v) => !v)}
          collapsedRail={leftRail}
        >
          {leftContent}
        </CollapsibleSidebar>

        <main className="adios-page-main">{children}</main>

        {rightContent && (
          <CollapsibleSidebar
            title={rightTitle}
            subtitle={rightSubtitle}
            side="right"
            width={280}
            collapsedWidth={58}
            collapsed={rightCollapsed}
            onToggle={() => setRightCollapsed((v) => !v)}
            collapsedRail={rightRail}
          >
            {rightContent}
          </CollapsibleSidebar>
        )}
      </div>

      <footer className="adios-status-bar">
        <span><span className="dot" style={{ background: isRunning ? "var(--ore)" : "var(--acid)", boxShadow: isRunning ? "0 0 6px var(--ore)" : "0 0 6px var(--acid)" }} />{isRunning ? "Simulation running…" : "System idle"}</span>
        <span>Material: <strong style={{ color: "var(--text)" }}>{material}</strong></span>
        <span>Fleet: <strong style={{ color: "var(--text)" }}>{selectedFleet.length} truck{selectedFleet.length === 1 ? "" : "s"}</strong></span>
        <span>Mode: <strong style={{ color: "var(--text)" }}>{useML ? "ML-assisted" : "Heuristic"}</strong></span>
        {lastRunPolicy && <span>Last policy: <strong style={{ color: "var(--cyan)" }}>{String(lastRunPolicy).replace(/_/g, " ")}</strong></span>}
        {result && <span>Coverage: <strong style={{ color: "var(--acid)" }}>{result.summary?.coverage_pct?.toFixed(1)}%</strong></span>}
        <span style={{ marginLeft: "auto", color: "var(--muted)" }}>ADIOS · Adaptive Dump Intelligence &amp; Optimization System</span>
      </footer>
    </div>
  );
}
