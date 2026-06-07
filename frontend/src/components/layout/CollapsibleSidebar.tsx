"use client";
import React, { useCallback, useRef, useState } from "react";
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
  minWidth?: number;
  maxWidth?: number;
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
  minWidth = 220,
  maxWidth = 520,
  children,
  collapsedRail,
}: CollapsibleSidebarProps) {
  const border = side === "left" ? "borderRight" : "borderLeft";
  const [currentWidth, setCurrentWidth] = useState(width);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    // Right-side panels grow when dragged left; left-side panels grow when dragged right.
    const signedDx = side === "right" ? -dx : dx;
    const next = Math.min(maxWidth, Math.max(minWidth, dragState.current.startWidth + signedDx));
    setCurrentWidth(next);
  }, [side, minWidth, maxWidth]);

  const onPointerUp = useCallback(() => {
    dragState.current = null;
    setDragging(false);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, [onPointerMove]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (collapsed) return;
    dragState.current = { startX: e.clientX, startWidth: currentWidth };
    setDragging(true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [collapsed, currentWidth, onPointerMove, onPointerUp]);

  const displayWidth = collapsed ? collapsedWidth : currentWidth;

  return (
    <aside
      className="adios-sidebar"
      data-collapsed={collapsed}
      data-side={side}
      style={{
        width: displayWidth,
        minWidth: displayWidth,
        position: "relative",
        transition: dragging ? "none" : "width 220ms cubic-bezier(0.2,0.8,0.2,1), min-width 220ms cubic-bezier(0.2,0.8,0.2,1)",
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
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
            onClick={onToggle}
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </IconButton>
        </div>
      </div>

      <div className="adios-sidebar-body">
        {collapsed ? (
          <div className="adios-sidebar-rail">{collapsedRail}</div>
        ) : (
          children
        )}
      </div>

      {/* Drag-to-resize handle — grab the panel edge like an Excel column border */}
      {!collapsed && (
        <div
          onPointerDown={onPointerDown}
          title={`Drag to resize ${title}`}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            [side === "left" ? "right" : "left"]: -3,
            width: 6,
            cursor: "col-resize",
            zIndex: 30,
            background: dragging ? "var(--cat)" : "transparent",
            opacity: dragging ? 0.5 : 1,
            transition: "background 120ms",
          } as React.CSSProperties}
          onMouseEnter={(e) => { if (!dragging) e.currentTarget.style.background = "rgba(255,205,17,0.25)"; }}
          onMouseLeave={(e) => { if (!dragging) e.currentTarget.style.background = "transparent"; }}
        />
      )}
    </aside>
  );
}
