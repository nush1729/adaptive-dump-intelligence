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
          <button key={link} onClick={() => router.push(NAV_ROUTES[link])} style={{ fontFamily: "JetBrains Mono", fontSize: "0.7rem", letterSpacing: "0.12em", color: active === link ? "#FFB800" : "#6B7280", background: "transparent", border: "none", cursor: "pointer", padding: "2px 0", borderBottom: active === link ? "1px solid #FFB800" : "1px solid transparent", transition: "color 0.2s" }}>
            {link}
          </button>
        ))}
      </div>
      <motion.button onClick={() => router.push("/dashboard")} whileHover={{ background: "#FFB800", color: "#000" }} style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 700, fontSize: "0.78rem", letterSpacing: "0.16em", color: "#FFB800", background: "transparent", border: "1px solid #FFB800", borderRadius: 2, padding: "7px 16px", cursor: "pointer", transition: "all 0.2s" }}>
        LAUNCH →
      </motion.button>
    </nav>
  );
}

const ARCHITECTURE = [
  {
    title: "5-Channel Terrain Observation",
    subtitle: "ADIOSMultiInputExtractor",
    color: "#FFB800",
    items: [
      { label: "CH 0 — Height Map", desc: "Normalised terrain elevation from digital twin" },
      { label: "CH 1 — Polygon Mask", desc: "Valid dump zone boundary mask" },
      { label: "CH 2 — Distance-to-Boundary", desc: "EDT-based distance field for edge-aware decisions" },
      { label: "CH 3 — Pile Detection", desc: "Height-threshold binary mask of existing piles" },
      { label: "CH 4 — Spacing Density", desc: "Gaussian-blurred pile density for spacing-aware planning" },
    ],
  },
  {
    title: "Context Vector (13-dim)",
    subtitle: "Truck + IoT Features",
    color: "#00D4FF",
    items: [
      { label: "Truck Profile (5-d)", desc: "One-hot: CAT-793F, CAT-797F, CAT-777E, CAT-785D, generic" },
      { label: "Payload Ratio (1-d)", desc: "Normalised payload / max capacity" },
      { label: "Dump Count (1-d)", desc: "Normalised historical dumps this session" },
      { label: "Material Type (2-d)", desc: "One-hot: ore / waste" },
      { label: "IoT Features (4-d)", desc: "Fleet congestion, latency, utilisation, zone density" },
    ],
  },
];

const CTDE_STEPS = [
  { n: "01", label: "Central Training", desc: "Single policy trained with global state: full terrain, fleet status, IoT telemetry, action masks.", color: "#FFB800" },
  { n: "02", label: "Per-Truck Inference", desc: "Each TruckAgent executes decentralised: local context injected, shared weights used for action proposals.", color: "#00D4FF" },
  { n: "03", label: "Central Validation", desc: "Orchestrator validates every proposed action via IsolationValidator before execution.", color: "#22C55E" },
  { n: "04", label: "State Update", desc: "Terrain updated with approved dump, IoT telemetry refreshed, next observation built.", color: "#FF6B35" },
];

const TRAINING = [
  { phase: "Phase 1: Behavioural Cloning", detail: "EnrichedTerrainFCN pre-trained on 50 expert heuristic trajectories × 50 dumps. Achieves ~21% top-1 accuracy — provides warm policy initialisation." },
  { phase: "Phase 2: PPO Fine-tuning", detail: "MaskablePPO + MultiInputPolicy + ADIOSMultiInputExtractor. 100K steps, parallel envs, optional curriculum learning (easy→medium→hard polygon shapes)." },
  { phase: "Phase 3: Curriculum Learning", detail: "Optional staged difficulty progression across training (easy→medium→hard polygon seeds), enabled via the --curriculum flag in pretrain.py." },
  { phase: "Results", detail: "ep_rew_mean: −128 → +12.7 over 100K steps — a real, monotonic convergence. Eval: PPO policy efficiency 3.9% vs heuristic 3.5% (+0.4pp). Saved: ml/weights/ppo_adios.zip" },
];

export default function IntelligencePage() {
  return (
    <div style={{ background: "#080808", minHeight: "100vh", color: "#FFF", fontFamily: "sans-serif" }}>
      <NavBar active="INTELLIGENCE ENGINE" />
      <div style={{ paddingTop: 56 }}>

        {/* Hero */}
        <section style={{ padding: "60px 64px 48px", borderBottom: "1px solid rgba(255,184,0,0.07)" }}>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.7rem", color: "#6B7280", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 16, height: 1, background: "#FFB800" }} />
            Intelligence Engine
          </div>
          <h1 style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 900, fontSize: "clamp(2rem,4.5vw,3.5rem)", letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1.1, marginBottom: 20 }}>
            Physics-Informed<br /><span style={{ color: "#FFB800" }}>RL Architecture</span>
          </h1>
          <p style={{ fontFamily: "JetBrains Mono", fontSize: "0.97rem", color: "#6B7280", lineHeight: 1.8, maxWidth: 640 }}>
            ADIOS combines Centralised Training with Decentralised Execution (CTDE), dual-stream CNN terrain processing, and IoT-enriched context to produce high-quality dump placement decisions at every step.
          </p>
        </section>

        {/* Architecture */}
        <section style={{ padding: "48px 64px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.7rem", color: "#6B7280", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 28 }}>Observation Space</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {ARCHITECTURE.map((arch) => (
              <motion.div key={arch.title} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ border: `1px solid ${arch.color}28`, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ padding: "12px 20px", borderBottom: `1px solid ${arch.color}18`, background: `${arch.color}08` }}>
                  <div style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 700, fontSize: "0.94rem", letterSpacing: "0.14em", color: arch.color }}>{arch.title}</div>
                  <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.7rem", color: "#6B7280", marginTop: 3 }}>{arch.subtitle}</div>
                </div>
                <div>
                  {arch.items.map((item) => (
                    <div key={item.label} style={{ padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", gap: 14, alignItems: "flex-start" }}>
                      <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.7rem", color: arch.color, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0, minWidth: 160 }}>{item.label}</div>
                      <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.7rem", color: "#6B7280", lineHeight: 1.6 }}>{item.desc}</div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTDE */}
        <section style={{ padding: "48px 64px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.7rem", color: "#6B7280", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 28 }}>CTDE Execution Loop</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {CTDE_STEPS.map((step) => (
              <motion.div key={step.n} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: parseInt(step.n) * 0.08 }} style={{ padding: "20px 18px", border: `1px solid ${step.color}22`, borderRadius: 4, background: `${step.color}06` }}>
                <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.7rem", color: "#4B5563", marginBottom: 10 }}>{step.n}</div>
                <div style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 700, fontSize: "0.94rem", letterSpacing: "0.12em", color: step.color, marginBottom: 10, textTransform: "uppercase" }}>{step.label}</div>
                <p style={{ fontFamily: "JetBrains Mono", fontSize: "0.73rem", color: "#9CA3AF", lineHeight: 1.65, margin: 0 }}>{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Training Pipeline */}
        <section style={{ padding: "48px 64px 64px" }}>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.7rem", color: "#6B7280", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 28 }}>Training Pipeline</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {TRAINING.map((t, i) => (
              <motion.div key={t.phase} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, delay: i * 0.07 }} style={{ display: "flex", gap: 24, padding: "16px 20px", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 3, alignItems: "flex-start" }}>
                <div style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 700, fontSize: "0.88rem", color: "#FFB800", letterSpacing: "0.1em", flexShrink: 0, minWidth: 220 }}>{t.phase}</div>
                <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.78rem", color: "#6B7280", lineHeight: 1.7 }}>{t.detail}</div>
              </motion.div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
