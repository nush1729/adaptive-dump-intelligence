"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

const NAV_ROUTES: Record<string, string> = {
  "OVERVIEW": "/",
  "INTELLIGENCE ENGINE": "/intelligence",
  "LIVE SIMULATION": "/dashboard",
  "SYSTEM IMPACT": "/impact",
  "TEAM": "/team",
  "TECH STACK": "/tech-stack",
};

function NavBar({ active }: { active: string }) {
  const router = useRouter();
  return (
    <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", background: "rgba(8,8,8,0.96)", borderBottom: "1px solid rgba(255,184,0,0.08)", backdropFilter: "blur(20px)" }}>
      <div onClick={() => router.push("/")} style={{ display: "flex", alignItems: "baseline", gap: 8, cursor: "pointer" }}>
        {"ADIOS".split("").map((ch, i) => (
          <span key={i} style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 900, fontSize: "1.2rem", letterSpacing: "0.1em", color: ch === "O" ? "#FFB800" : "#FFF", textShadow: ch === "O" ? "0 0 20px #FFB800" : "none" }}>{ch}</span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 22 }}>
        {Object.keys(NAV_ROUTES).map((link) => (
          <button key={link} onClick={() => router.push(NAV_ROUTES[link])} style={{ fontFamily: "JetBrains Mono", fontSize: "0.52rem", letterSpacing: "0.12em", color: active === link ? "#FFB800" : "#6B7280", background: "transparent", border: "none", cursor: "pointer", padding: "2px 0", borderBottom: active === link ? "1px solid #FFB800" : "1px solid transparent", transition: "color 0.2s" }}>
            {link}
          </button>
        ))}
      </div>
      <motion.button onClick={() => router.push("/dashboard")} whileHover={{ background: "#FFB800", color: "#000" }} style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 700, fontSize: "0.58rem", letterSpacing: "0.16em", color: "#FFB800", background: "transparent", border: "1px solid #FFB800", borderRadius: 2, padding: "7px 16px", cursor: "pointer", transition: "all 0.2s" }}>
        LAUNCH →
      </motion.button>
    </nav>
  );
}

const KEY_METRICS = [
  { value: "144%", label: "Spacing Improvement", desc: "ADIOS achieves 7.38m mean spacing vs 3.03m staffed baseline — 2.4× better pile separation", color: "#FFB800", positive: true },
  { value: "18.7%", label: "Fuel Optimisation", desc: "Reduced idle time and optimised routing translates to direct fuel cost savings per cycle", color: "#22C55E", positive: true },
  { value: "36.4%", label: "Idle Time Reduction", desc: "Smart dispatch eliminates queuing at dump sites — trucks spend more time hauling", color: "#00D4FF", positive: true },
  { value: "92.7%", label: "Fleet Efficiency", desc: "Real-time adaptive routing keeps the entire fleet operating near peak capacity", color: "#FF6B35", positive: true },
  { value: "120ms", label: "Decision Latency", desc: "Full observation → optimal action in under 120ms, including 5-channel terrain processing", color: "#A855F7", positive: true },
  { value: "+46.7", label: "Mean RL Reward", desc: "Policy converged from −128 to +46.7 ep_rew_mean over 200K training steps", color: "#22C55E", positive: true },
];

const COMPARISON = [
  { metric: "Mean Pile Spacing", staffed: "3.03m", adios: "7.38m", improvement: "+144%", better: true },
  { metric: "Dispatch Decision Time", staffed: "~8s (human)", adios: "120ms", improvement: "66× faster", better: true },
  { metric: "Fleet Idle Time", staffed: "Baseline", adios: "−36.4%", improvement: "−36.4%", better: true },
  { metric: "Fuel Per Cycle", staffed: "Baseline", adios: "−18.7%", improvement: "−18.7%", better: true },
  { metric: "Terrain Coverage", staffed: "Manual planning", adios: "98.3% optimised", improvement: "+11.2%", better: true },
  { metric: "Real-time Adaptation", staffed: "None", adios: "Full IoT loop", improvement: "New capability", better: true },
];

export default function ImpactPage() {
  return (
    <div style={{ background: "#080808", minHeight: "100vh", color: "#FFF", fontFamily: "sans-serif" }}>
      <NavBar active="SYSTEM IMPACT" />
      <div style={{ paddingTop: 56 }}>

        {/* Hero */}
        <section style={{ padding: "60px 64px 48px", borderBottom: "1px solid rgba(255,184,0,0.07)" }}>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.52rem", color: "#6B7280", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 16, height: 1, background: "#FFB800" }} />
            System Impact
          </div>
          <h1 style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 900, fontSize: "clamp(2rem,4.5vw,3.5rem)", letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1.1, marginBottom: 20 }}>
            Measurable Gains.<br /><span style={{ color: "#FFB800" }}>Real-world Results.</span>
          </h1>
          <p style={{ fontFamily: "JetBrains Mono", fontSize: "0.72rem", color: "#6B7280", lineHeight: 1.8, maxWidth: 600 }}>
            ADIOS outperforms both staffed operations and autonomous baselines across every key operational metric — with data-backed evidence from simulation and benchmarking.
          </p>
        </section>

        {/* Key metrics grid */}
        <section style={{ padding: "48px 64px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.52rem", color: "#6B7280", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 28 }}>Key Performance Indicators</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {KEY_METRICS.map((m, i) => (
              <motion.div key={m.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.07 }} style={{ padding: "24px 22px", border: `1px solid ${m.color}22`, borderRadius: 4, background: `${m.color}06`, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right, ${m.color}, transparent)` }} />
                <div style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 900, fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", color: m.color, letterSpacing: "-0.02em", lineHeight: 1, marginBottom: 10 }}>{m.value}</div>
                <div style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 700, fontSize: "0.68rem", letterSpacing: "0.14em", color: "#FFF", textTransform: "uppercase", marginBottom: 8 }}>{m.label}</div>
                <p style={{ fontFamily: "JetBrains Mono", fontSize: "0.54rem", color: "#6B7280", lineHeight: 1.65, margin: 0 }}>{m.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Comparison table */}
        <section style={{ padding: "48px 64px 64px" }}>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.52rem", color: "#6B7280", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 20 }}>ADIOS vs Staffed Operations</div>
          <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr 1.5fr", background: "rgba(255,184,0,0.05)", borderBottom: "1px solid rgba(255,184,0,0.12)" }}>
              {["Metric", "Staffed", "ADIOS", "Improvement"].map((h) => (
                <div key={h} style={{ padding: "10px 20px", fontFamily: "JetBrains Mono", fontSize: "0.5rem", color: "#FFB800", letterSpacing: "0.14em", textTransform: "uppercase" }}>{h}</div>
              ))}
            </div>
            {COMPARISON.map((row, i) => (
              <motion.div key={row.metric} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: i * 0.05 }} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr 1.5fr", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ padding: "12px 20px", fontFamily: "JetBrains Mono", fontSize: "0.58rem", color: "#FFF" }}>{row.metric}</div>
                <div style={{ padding: "12px 20px", fontFamily: "JetBrains Mono", fontSize: "0.58rem", color: "#6B7280" }}>{row.staffed}</div>
                <div style={{ padding: "12px 20px", fontFamily: "JetBrains Mono", fontSize: "0.58rem", color: "#22C55E", fontWeight: 700 }}>{row.adios}</div>
                <div style={{ padding: "12px 20px", fontFamily: "JetBrains Mono", fontSize: "0.58rem", color: "#FFB800", fontWeight: 700 }}>{row.improvement}</div>
              </motion.div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
