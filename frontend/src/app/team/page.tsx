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

const TEAM = [
  {
    name: "Anushka Nair",
    role: "AI & System Architecture Lead",
    roleColor: "#FFB800",
    focus: "Reinforcement Learning · CTDE Architecture · IoT Integration · Backend API",
    description: "Designed and built the full ADIOS intelligence stack — MaskablePPO with 5-channel enriched observations, CTDE framework enabling decentralised truck execution against a centralised digital twin, IoT telemetry wiring for real-time fleet metrics, and adaptive weight modulation in the scoring engine. Architected the FastAPI backend, constraint-aware action masking, and the metadata-versioned policy loading chain that ensures PPO runs without BC fallback.",
    contributions: [
      "MaskablePPO training with ADIOSMultiInputExtractor (160K steps)",
      "CTDE architecture — TruckAgent per-truck inference with shared policy",
      "5-channel terrain observation design (geometry + semantics streams)",
      "IoT-adaptive heuristic weight modulation in ScoringEngine",
      "FastAPI backend with WebSocket streaming simulation",
      "Metadata-versioned policy loader with obs-space validation",
    ],
    tags: ["MaskablePPO", "PyTorch", "FastAPI", "CTDE", "IoT", "Python"],
    initials: "AN",
  },
  {
    name: "Arjit Tripathi",
    role: "Safety & Scheduling Systems Lead",
    roleColor: "#00D4FF",
    focus: "Isolation Validation · Time-Space Scheduling · Deadlock Prevention · Constraint Safety",
    description: "Designed and implemented the multi-layer safety system that prevents truck deadlocks, isolated dump sites, and out-of-polygon violations. Built the BFS flood-fill isolation validator with dry-run simulation, the time-space scheduler with DFS cycle detection, and the constraint-aware action masker. Tuned the passability percentile threshold and scheduler retry count parameters for optimal dense-packing safety.",
    contributions: [
      "BFS flood-fill isolation validator with dry-run terrain simulation",
      "Time-space reservation scheduler (40-step delay search window)",
      "DFS deadlock cycle detection and auto-resolution by starvation rank",
      "ConstrainedActionMasker — polygon boundary, height, spacing, path checks",
      "Configurable passability percentile (93rd) for BFS ceiling",
      "Livelock detection via starvation counter per truck",
    ],
    tags: ["BFS", "Graph Algorithms", "Safety Systems", "Python", "NumPy"],
    initials: "AT",
  },
  {
    name: "Shivani Srivastava",
    role: "Frontend & ML Ops Lead",
    roleColor: "#22C55E",
    focus: "React Three Fiber · Dashboard UI · Simulation Rendering · ML Evaluation",
    description: "Built the complete interactive frontend experience — real-time 3D dump-site visualisation with WebGL bloom effects, the live metrics dashboard with WebSocket streaming, terrain heatmaps, and the multi-view simulation control panel. Also owned the ML evaluation pipeline: benchmark suite across 20 polygons, compute_eval comparison of PPO vs heuristic, and the supervised imitation training script for the BC fallback model.",
    contributions: [
      "3D terrain + truck visualisation with React Three Fiber and post-processing bloom",
      "Live simulation dashboard with WebSocket streaming surface updates",
      "Score-map heatmap, Plotly charts, and policy comparison views",
      "Benchmark evaluation suite (20 polygons, 10 KPIs per policy)",
      "EnrichedTerrainFCN supervised training pipeline (imitation BC)",
      "Audit log replay and scheduling Gantt chart visualisation",
    ],
    tags: ["React Three Fiber", "Next.js", "Three.js", "GSAP", "Framer Motion", "PyTorch"],
    initials: "SS",
  },
  {
    name: "Yashee Hinger",
    role: "Planning & Path Integration Lead",
    roleColor: "#FF6B35",
    focus: "A* Pathfinding · Dump Physics · Terrain Modelling · Weight Tuning",
    description: "Owned the planning layer that connects the ML policy to physical truck operations — slope-aware A* pathfinding, Gaussian dump physics with compaction modelling, material segregation compatibility, and the automated weight tuner that optimises scoring engine parameters via random search. Integrated terrain SLAM simulation for sensor-noise-aware digital twin updates and tuned the dump radius, sigma, and pile detection parameters to close the gap between autonomous (7.38m) and staffed (3.03m) spacing.",
    contributions: [
      "Slope-aware 8-connected A* pathfinder with height-delta cost",
      "Gaussian dump deposition physics with material density + compaction",
      "Material segregation compatibility matrix and penalty scoring",
      "Random-search weight tuner (30-trial optimisation over 5 weights)",
      "SLAM simulation — Gaussian blur + sensor noise on terrain height grid",
      "Dump radius (6 cells) and sigma (0.35) tuning for 3.03m target spacing",
    ],
    tags: ["A*", "Physics Simulation", "SLAM", "SciPy", "NumPy", "Optimisation"],
    initials: "YH",
  },
];

const HIGHLIGHTS = [
  { label: "Problem", value: "CAT Optimal Dump Packing" },
  { label: "Approach", value: "Option 2 + Option 3" },
  { label: "ML Training", value: "160K PPO Steps" },
  { label: "Stack", value: "Next.js + FastAPI + PyTorch" },
];

function AvatarIcon({ initials, color }: { initials: string; color: string }) {
  return (
    <div style={{ width: 72, height: 72, borderRadius: "50%", background: `${color}18`, border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative" }}>
      <span style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 900, fontSize: "1.1rem", color, letterSpacing: "0.08em" }}>{initials}</span>
    </div>
  );
}

function ContribDot({ color }: { color: string }) {
  return <div style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 3 }} />;
}

export default function TeamPage() {
  const router = useRouter();
  return (
    <div style={{ background: "#080808", minHeight: "100vh", color: "#FFF", fontFamily: "sans-serif" }}>
      <NavBar active="TEAM" />
      <div style={{ paddingTop: 56 }}>

        {/* Hero */}
        <section style={{ padding: "60px 64px 48px", borderBottom: "1px solid rgba(255,184,0,0.07)" }}>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.7rem", color: "#6B7280", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 16, height: 1, background: "#FFB800" }} />
            The Team
          </div>
          <h1 style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 900, fontSize: "clamp(2rem,4.5vw,3.5rem)", letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1.1, marginBottom: 20 }}>
            Built By<br /><span style={{ color: "#FFB800" }}>Four Engineers.</span>
          </h1>
          <p style={{ fontFamily: "JetBrains Mono", fontSize: "0.97rem", color: "#6B7280", lineHeight: 1.8, maxWidth: 640 }}>
            ADIOS was designed, trained, and shipped end-to-end across AI architecture, safety systems, frontend visualisation, and path planning — solving Caterpillar Problem Statement 4: Optimal Dump Packing.
          </p>

          {/* Stat bar */}
          <div style={{ display: "flex", gap: 0, marginTop: 40, border: "1px solid rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden", maxWidth: 680 }}>
            {HIGHLIGHTS.map((h, i) => (
              <div key={h.label} style={{ flex: 1, padding: "16px 20px", borderRight: i < HIGHLIGHTS.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.7rem", color: "#6B7280", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 5 }}>{h.label}</div>
                <div style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 700, fontSize: "0.97rem", color: "#FFF", letterSpacing: "0.06em" }}>{h.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Team cards */}
        <section style={{ padding: "48px 64px 80px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {TEAM.map((member, i) => (
              <motion.div
                key={member.name}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: i * 0.1 }}
                style={{
                  display: "flex", gap: 32, padding: "32px 36px",
                  border: `1px solid ${member.roleColor}18`,
                  borderRadius: 4,
                  background: `${member.roleColor}04`,
                  position: "relative", overflow: "hidden",
                }}
              >
                {/* Left accent bar */}
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: member.roleColor }} />

                <AvatarIcon initials={member.initials} color={member.roleColor} />

                <div style={{ flex: 1 }}>
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 2, flexWrap: "wrap" }}>
                    <h2 style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 900, fontSize: "1.25rem", letterSpacing: "0.06em", color: "#FFF", margin: 0 }}>{member.name}</h2>
                    <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.78rem", color: member.roleColor, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>{member.role}</span>
                  </div>

                  {/* Focus */}
                  <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.7rem", color: "#6B7280", letterSpacing: "0.06em", marginBottom: 14 }}>{member.focus}</div>

                  {/* Description */}
                  <p style={{ fontFamily: "JetBrains Mono", fontSize: "0.84rem", color: "#9CA3AF", lineHeight: 1.8, margin: "0 0 20px" }}>{member.description}</p>

                  {/* Contributions */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.7rem", color: member.roleColor, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>Key Contributions</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {member.contributions.map((c) => (
                        <div key={c} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <ContribDot color={member.roleColor} />
                          <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.76rem", color: "#9CA3AF", lineHeight: 1.5 }}>{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tags */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {member.tags.map((tag) => (
                      <span key={tag} style={{ fontFamily: "JetBrains Mono", fontSize: "0.7rem", color: member.roleColor, border: `1px solid ${member.roleColor}40`, borderRadius: 2, padding: "3px 10px", letterSpacing: "0.08em" }}>{tag}</span>
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Footer CTA */}
        <section style={{ padding: "0 64px 60px" }}>
          <div style={{ border: "1px solid rgba(255,184,0,0.12)", borderRadius: 4, padding: "32px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 900, fontSize: "1.1rem", letterSpacing: "0.08em", color: "#FFF", marginBottom: 6 }}>See The System In Action</div>
              <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.81rem", color: "#6B7280", maxWidth: 400 }}>
                Run live simulations, explore the intelligence engine, and benchmark PPO vs heuristic performance.
              </div>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <motion.button
                onClick={() => router.push("/dashboard")}
                whileHover={{ background: "#FFB800", color: "#000" }}
                style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 700, fontSize: "0.81rem", letterSpacing: "0.14em", color: "#FFB800", background: "transparent", border: "1px solid #FFB800", borderRadius: 2, padding: "10px 20px", cursor: "pointer", transition: "all 0.2s" }}
              >
                LAUNCH SIMULATION →
              </motion.button>
              <motion.button
                onClick={() => router.push("/intelligence")}
                whileHover={{ borderColor: "#FFB800", color: "#FFB800" }}
                style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 700, fontSize: "0.81rem", letterSpacing: "0.14em", color: "#9CA3AF", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 2, padding: "10px 20px", cursor: "pointer", transition: "all 0.2s" }}
              >
                EXPLORE ENGINE →
              </motion.button>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
