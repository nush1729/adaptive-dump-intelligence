"use client";
import React, { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import CollapsibleSidebar from "@/components/layout/CollapsibleSidebar";

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
    </div>
  );
}
