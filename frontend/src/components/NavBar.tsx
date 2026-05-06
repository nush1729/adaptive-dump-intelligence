"use client";
import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/scheduling", label: "Dispatch" },
  { href: "/audit", label: "Audit Replay" },
];

export default function NavBar() {
  const path = usePathname();
  const [isDark, setIsDark] = useState(true);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  return (
    <nav style={{
      position: "fixed",
      top: 0, left: 0, right: 0,
      zIndex: 1000,
      height: 44,
      background: "var(--nav-bg)",
      backdropFilter: "blur(14px)",
      borderBottom: "1px solid var(--nav-border)",
      display: "flex",
      alignItems: "center",
      padding: "0 20px",
      gap: 0,
    }}>
      {/* Logo */}
      <span style={{
        fontFamily: "Syncopate",
        fontSize: "0.72rem",
        fontWeight: 700,
        letterSpacing: "0.25em",
        color: "var(--acid)",
        marginRight: 32,
        userSelect: "none",
        textTransform: "uppercase",
      }}>
        ADI<span style={{ color: "var(--ore)" }}>O</span>S
      </span>

      {/* Nav links */}
      <div style={{ display: "flex", gap: 2 }}>
        {LINKS.map(({ href, label }) => {
          const active = path === href || (href !== "/" && path.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              style={{
                fontFamily: "JetBrains Mono",
                fontSize: "0.62rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                padding: "6px 14px",
                color: active ? "var(--acid)" : "var(--muted)",
                textDecoration: "none",
                background: active ? "rgba(128,100,0,0.12)" : "transparent",
                borderBottom: `2px solid ${active ? "var(--acid)" : "transparent"}`,
                transition: "all 0.15s",
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {/* Right side */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        {/* Live indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "var(--acid)",
            display: "inline-block",
            animation: "pulse 2s ease-in-out infinite",
            boxShadow: "0 0 8px var(--acid)",
          }} />
          <span style={{
            fontFamily: "JetBrains Mono",
            fontSize: "0.55rem",
            color: "var(--muted)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}>
            System Live
          </span>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          style={{
            fontFamily: "JetBrains Mono",
            fontSize: "0.58rem",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            padding: "4px 10px",
            borderRadius: 3,
            border: "1px solid var(--border)",
            color: "var(--text2)",
            background: "transparent",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={e => {
            (e.target as HTMLElement).style.color = "var(--acid)";
            (e.target as HTMLElement).style.borderColor = "var(--acid)";
          }}
          onMouseLeave={e => {
            (e.target as HTMLElement).style.color = "var(--text2)";
            (e.target as HTMLElement).style.borderColor = "var(--border)";
          }}
        >
          {isDark ? "☀ Light" : "🌙 Dark"}
        </button>
      </div>
    </nav>
  );
}
