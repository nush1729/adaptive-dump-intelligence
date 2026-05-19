"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import { useThemeMode } from "@/hooks/useThemeMode";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/scheduling", label: "Dispatch" },
  { href: "/audit", label: "Audit Replay" },
];

export default function NavBar() {
  const path = usePathname();
  const { isDark, toggleTheme } = useThemeMode();

  return (
    <nav className="adios-nav">
      <Link href="/" aria-label="ADIOS home" className="adios-brand">
        ADI<span>O</span>S
      </Link>

      <div className="adios-nav-links">
        {LINKS.map(({ href, label }) => {
          const active = path === href || (href !== "/" && path.startsWith(href));
          return (
            <Link key={href} href={href} className={active ? "is-active" : ""}>
              {label}
            </Link>
          );
        })}
      </div>

      <div className="adios-nav-status">
        <div className="adios-live">
          <span />
          <strong>System Live</strong>
        </div>
        <IconButton label={isDark ? "Switch to light mode" : "Switch to dark mode"} onClick={toggleTheme}>
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </IconButton>
      </div>
    </nav>
  );
}
