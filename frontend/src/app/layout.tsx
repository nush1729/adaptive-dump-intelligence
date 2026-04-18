"use client";
import "./globals.css";
import Link from "next/link";
import { usePathname } from "next/navigation";

function NavBar() {
  const p = usePathname();
  const links = [
    { href: "/", label: "Home" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/scheduling", label: "Dispatch" },
    { href: "/audit", label: "Audit" },
  ];
  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 1000,
      height: 44,
      background: "rgba(5,10,15,0.92)",
      backdropFilter: "blur(12px)",
      borderBottom: "1px solid var(--border)",
      display: "flex", alignItems: "center",
      padding: "0 20px", gap: 0,
    }}>
      {/* Logo */}
      <span style={{
        fontFamily: "Syncopate", fontSize: "0.7rem", fontWeight: 700,
        letterSpacing: "0.25em", color: "var(--acid)",
        marginRight: 32, userSelect: "none",
      }}>
        ADI<span style={{ color: "var(--ore)" }}>O</span>S
      </span>

      {/* Route links */}
      <div style={{ display: "flex", gap: 4 }}>
        {links.map(({ href, label }) => {
          const active = p === href || (href !== "/" && p.startsWith(href));
          return (
            <Link key={href} href={href} style={{
              fontFamily: "JetBrains Mono",
              fontSize: "0.62rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              padding: "6px 14px",
              color: active ? "var(--acid)" : "var(--muted)",
              textDecoration: "none",
              background: active ? "rgba(200,255,0,0.06)" : "transparent",
              borderBottom: active ? "1px solid var(--acid)" : "1px solid transparent",
              transition: "all 0.15s",
            }}>
              {label}
            </Link>
          );
        })}
      </div>

      {/* Right: live tick */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "var(--acid)",
          boxShadow: "0 0 8px var(--acid)",
          display: "inline-block",
          animation: "pulse 2s infinite",
        }} />
        <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.55rem",
          color: "var(--muted)", letterSpacing: "0.1em" }}>
          ADIOS v3 · LIVE
        </span>
      </div>
    </nav>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>ADIOS — Adaptive Dump Intelligence & Orchestration System</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ paddingTop: 44 }}>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
