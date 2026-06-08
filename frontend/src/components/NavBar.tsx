"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, Sun, Activity, Cpu } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import { useThemeMode } from "@/hooks/useThemeMode";
import { fetchHealth } from "@/lib/api";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/scheduling", label: "Dispatch" },
  { href: "/audit", label: "Audit Replay" },
];

export default function NavBar() {
  const path = usePathname();
  const { isDark, toggleTheme } = useThemeMode();
  const [mlOnline, setMlOnline] = useState<boolean | null>(null);
  const [policyType, setPolicyType] = useState<string>("heuristic");

  useEffect(() => {
    fetchHealth()
      .then((h: any) => {
        setMlOnline(h?.ml_available ?? false);
        setPolicyType(h?.policy_type ?? "heuristic");
      })
      .catch(() => setMlOnline(false));
  }, []);

  const policyShort =
    policyType === "maskable_ppo"
      ? "PPO"
      : policyType === "imitation_bc"
      ? "BC"
      : policyType === "hybrid"
      ? "HYB"
      : "HEU";

  return (
    <nav className="adios-nav" style={{ position: "relative" }}>
      {/* Subtle top glow line */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "1px",
          background:
            "linear-gradient(90deg,transparent 0%,rgba(255,192,0,0.4) 40%,rgba(255,192,0,0.4) 60%,transparent 100%)",
          pointerEvents: "none",
        }}
      />

      <Link href="/" aria-label="ADIOS home" className="adios-brand">
        ADI<span>O</span>S
      </Link>

      <div className="adios-nav-links">
        {LINKS.map(({ href, label }) => {
          const active =
            path === href || (href !== "/" && path.startsWith(href));
          return (
            <Link key={href} href={href} className={active ? "is-active" : ""}>
              {label}
            </Link>
          );
        })}
      </div>

      <div className="adios-nav-status">
        {/* Policy badge */}
        {mlOnline !== null && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "3px 10px",
              background: mlOnline
                ? "rgba(255,205,17,0.08)"
                : "rgba(107,114,128,0.08)",
              border: `1px solid ${mlOnline ? "rgba(255,205,17,0.22)" : "rgba(107,114,128,0.2)"}`,
              borderRadius: "3px",
            }}
          >
            <Cpu
              size={10}
              color={mlOnline ? "#FFCD11" : "#6B7280"}
              strokeWidth={2}
            />
            <span
              style={{
                fontFamily: "JetBrains Mono",
                fontSize: "0.92rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: mlOnline ? "#FFCD11" : "#6B7280",
              }}
            >
              {policyShort}
            </span>
          </div>
        )}

        {/* Live indicator */}
        <div className="adios-live">
          <span />
          <strong>System Live</strong>
        </div>

        <IconButton
          label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          onClick={toggleTheme}
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </IconButton>
      </div>
    </nav>
  );
}
