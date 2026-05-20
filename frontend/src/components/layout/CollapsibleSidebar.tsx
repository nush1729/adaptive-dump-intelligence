"use client";
import React from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import IconButton from "@/components/ui/IconButton";

interface CollapsibleSidebarProps {
  title: string;
  subtitle?: string;
  collapsed: boolean;
  onToggle: () => void;
  side?: "left" | "right";
  width?: number;
  collapsedWidth?: number;
  children: React.ReactNode;
  collapsedRail?: React.ReactNode;
}

export default function CollapsibleSidebar({
  title,
  subtitle,
  collapsed,
  onToggle,
  side = "left",
  width = 280,
  collapsedWidth = 64,
  children,
  collapsedRail,
}: CollapsibleSidebarProps) {
  const border = side === "left" ? "borderRight" : "borderLeft";

  return (
    <aside
      className="adios-sidebar"
      data-collapsed={collapsed}
      data-side={side}
      style={{
        width: collapsed ? collapsedWidth : width,
        minWidth: collapsed ? collapsedWidth : width,
        [border]: "1px solid var(--border)",
      } as React.CSSProperties}
    >
      <div className="adios-sidebar-header">
        {!collapsed && (
          <div className="min-w-0">
            <div className="adios-sidebar-title">{title}</div>
            {subtitle && <div className="adios-sidebar-subtitle">{subtitle}</div>}
          </div>
        )}
        <IconButton
          label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          onClick={onToggle}
          className="ml-auto"
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </IconButton>
      </div>

      <div className="adios-sidebar-body">
        {collapsed ? (
          <div className="adios-sidebar-rail">{collapsedRail}</div>
        ) : (
          children
        )}
      </div>
    </aside>
  );
}
