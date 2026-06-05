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

const STACK = [
  {
    layer: "Frontend",
    color: "#00D4FF",
    items: [
      { name: "Next.js 14", role: "App router, SSR/CSR hybrid, file-based routing" },
      { name: "React Three Fiber", role: "Declarative 3D scene rendering on top of Three.js" },
      { name: "@react-three/postprocessing", role: "Bloom, depth-of-field, and HDR tone mapping" },
      { name: "Framer Motion", role: "Declarative animations, layout transitions, hover effects" },
      { name: "GSAP", role: "High-performance timeline animations for hero entrance" },
      { name: "TypeScript", role: "Full type safety across UI components and API layer" },
      { name: "Zustand", role: "Lightweight client state for simulation control panel" },
    ],
  },
  {
    layer: "Backend",
    color: "#FFB800",
    items: [
      { name: "FastAPI", role: "Async REST API, WebSocket simulation endpoint, Pydantic validation" },
      { name: "Uvicorn", role: "ASGI server, single-worker CPU deployment, port 8000" },
      { name: "NumPy + SciPy", role: "Terrain data processing, distance transforms, Gaussian blur" },
      { name: "Shapely", role: "Polygon geometry operations for dump zone boundary checking" },
      { name: "scikit-learn", role: "Evaluation utilities, normalisation, clustering for terrain analysis" },
    ],
  },
  {
    layer: "ML & RL",
    color: "#22C55E",
    items: [
      { name: "PyTorch", role: "Neural network definition (ADIOSMultiInputExtractor, EnrichedTerrainFCN)" },
      { name: "Stable Baselines 3", role: "PPO base framework — VecEnv, callbacks, policy architecture" },
      { name: "sb3-contrib MaskablePPO", role: "Action-masked PPO — prevents illegal dump placements during training" },
      { name: "Gymnasium", role: "RL environment standard — DumpPackingEnv implements Env interface" },
      { name: "TensorBoard", role: "Training metrics logging — reward curves, explained variance, entropy" },
      { name: "Imitation (BC)", role: "Behavioural cloning pre-training stage before PPO fine-tuning" },
    ],
  },
  {
    layer: "Algorithms & Simulation",
    color: "#FF6B35",
    items: [
      { name: "A* Pathfinding", role: "Lane planning with occupancy grid for haul road routing" },
      { name: "SLAM Simulation", role: "Simulated mapping for terrain change detection during operation" },
      { name: "EDT (Distance Transform)", role: "Boundary-aware dump placement scoring via SciPy EDT" },
      { name: "Compaction Modelling", role: "Physics-based soil compaction simulation for dump site accuracy" },
      { name: "CTDE Framework", role: "Centralised training, decentralised per-truck execution at inference" },
      { name: "IoTTelemetry", role: "Fleet GPS/payload noise simulation, congestion + utilisation features" },
    ],
  },
];

export default function TechStackPage() {
  return (
    <div style={{ background: "#080808", minHeight: "100vh", color: "#FFF", fontFamily: "sans-serif" }}>
      <NavBar active="TECH STACK" />
      <div style={{ paddingTop: 56 }}>

        {/* Hero */}
        <section style={{ padding: "60px 64px 48px", borderBottom: "1px solid rgba(255,184,0,0.07)" }}>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.52rem", color: "#6B7280", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 16, height: 1, background: "#FFB800" }} />
            Tech Stack
          </div>
          <h1 style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 900, fontSize: "clamp(2rem,4.5vw,3.5rem)", letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1.1, marginBottom: 20 }}>
            Production-grade.<br /><span style={{ color: "#FFB800" }}>End to End.</span>
          </h1>
          <p style={{ fontFamily: "JetBrains Mono", fontSize: "0.72rem", color: "#6B7280", lineHeight: 1.8, maxWidth: 600 }}>
            ADIOS is built on a full-stack Python + TypeScript pipeline — from raw terrain data through RL policy inference to 3D real-time visualisation.
          </p>
        </section>

        {/* Stack layers */}
        <section style={{ padding: "48px 64px 64px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {STACK.map((layer, li) => (
              <motion.div key={layer.layer} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: li * 0.08 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: layer.color, boxShadow: `0 0 8px ${layer.color}` }} />
                  <div style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 700, fontSize: "0.78rem", letterSpacing: "0.18em", color: layer.color, textTransform: "uppercase" }}>{layer.layer}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                  {layer.items.map((item) => (
                    <div key={item.name} style={{ padding: "14px 18px", border: `1px solid ${layer.color}18`, borderRadius: 3, background: `${layer.color}04`, display: "flex", gap: 14, alignItems: "flex-start" }}>
                      <div style={{ width: 3, height: 3, borderRadius: "50%", background: layer.color, flexShrink: 0, marginTop: 6 }} />
                      <div>
                        <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.62rem", color: "#FFF", fontWeight: 700, marginBottom: 4, letterSpacing: "0.04em" }}>{item.name}</div>
                        <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.52rem", color: "#6B7280", lineHeight: 1.6 }}>{item.role}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Architecture note */}
          <div style={{ marginTop: 40, padding: "20px 24px", border: "1px solid rgba(255,184,0,0.12)", borderRadius: 4, background: "rgba(255,184,0,0.04)" }}>
            <div style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 700, fontSize: "0.68rem", letterSpacing: "0.14em", color: "#FFB800", marginBottom: 10 }}>SYSTEM ARCHITECTURE</div>
            <p style={{ fontFamily: "JetBrains Mono", fontSize: "0.58rem", color: "#6B7280", lineHeight: 1.75, margin: 0 }}>
              Data flows from IoT telemetry + terrain state → 5-channel observation build → ADIOSMultiInputExtractor (dual CNN + context MLP) → MaskablePPO policy → action validation (IsolationValidator) → terrain update → FastAPI → WebSocket → Next.js React Three Fiber real-time render.
            </p>
          </div>
        </section>

      </div>
    </div>
  );
}
