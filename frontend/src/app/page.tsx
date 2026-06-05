"use client";
import React, { useEffect, useRef, Suspense } from "react";
import dynamic from "next/dynamic";
import { useRouter, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import gsap from "gsap";

const LandingHeroScene = dynamic(
  () => import("@/components/landing/LandingHeroScene"),
  { ssr: false }
);

const NAV_ROUTES: Record<string, string> = {
  "OVERVIEW": "/",
  "INTELLIGENCE ENGINE": "/intelligence",
  "LIVE SIMULATION": "/dashboard",
  "SYSTEM IMPACT": "/impact",
  "TEAM": "/team",
  "TECH STACK": "/tech-stack",
};
const NAV_LINKS = Object.keys(NAV_ROUTES);

/* ── Sparkline ────────────────────────────────────────────────── */
function Sparkline({ data, color, type = "line" }: { data: number[]; color: string; type?: "line" | "bar" }) {
  if (type === "bar") {
    const max = Math.max(...data, 1);
    return (
      <div style={{ display: "flex", alignItems: "flex-end", gap: 1.5, height: 22, width: 52, flexShrink: 0 }}>
        {data.map((v, i) => (
          <div key={i} style={{ flex: 1, height: `${(v / max) * 100}%`, background: color, opacity: 0.25 + (i / data.length) * 0.75, borderRadius: 1 }} />
        ))}
      </div>
    );
  }
  const W = 52, H = 22;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * (H - 4) - 2}`).join(" ");
  return (
    <svg width={W} height={H} style={{ overflow: "visible", flexShrink: 0 }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

/* ── Metric Row ───────────────────────────────────────────────── */
function MetricRow({ icon, label, value, delta, positive, data, type }: {
  icon: React.ReactNode; label: string; value: string; delta: string;
  positive: boolean; data: number[]; type?: "line" | "bar";
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ color: "#FFB800", flexShrink: 0, opacity: 0.75, width: 18, textAlign: "center" }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.44rem", color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 1 }}>{label}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
          <span style={{ fontFamily: "JetBrains Mono", fontSize: "1.05rem", fontWeight: 700, color: "#FFF", letterSpacing: "-0.02em" }}>{value}</span>
          <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.48rem", color: positive ? "#22C55E" : "#EF4444" }}>{positive ? "↑" : "↓"}{delta}</span>
        </div>
      </div>
      <Sparkline data={data} color={positive ? "#22C55E" : "#FFB800"} type={type} />
    </div>
  );
}

/* ── Step Icon ────────────────────────────────────────────────── */
function StepIcon({ type }: { type: "sense" | "analyze" | "decide" | "dispatch" | "adapt" }) {
  const s = { width: 72, height: 72, viewBox: "0 0 72 72" as const };
  if (type === "sense") return (
    <svg {...s} fill="none">
      <polygon points="36,8 60,52 12,52" stroke="#FFB800" strokeWidth="1.2" opacity="0.4"/>
      <polygon points="36,18 50,44 22,44" stroke="#FFB800" strokeWidth="1" opacity="0.6"/>
      <polygon points="36,28 44,40 28,40" stroke="#FFB800" strokeWidth="0.8" opacity="0.9"/>
      <circle cx="36" cy="36" r="2" fill="#FFB800"/>
    </svg>
  );
  if (type === "analyze") return (
    <svg {...s} fill="none">
      <circle cx="36" cy="36" r="26" stroke="#FFB800" strokeWidth="1" opacity="0.25"/>
      <circle cx="36" cy="36" r="16" stroke="#FFB800" strokeWidth="1" opacity="0.4"/>
      <circle cx="36" cy="36" r="4" fill="#FFB800" opacity="0.9"/>
      {[0,60,120,180,240,300].map((a, i) => {
        const r1 = 16, r2 = 26, rad = a * Math.PI / 180;
        return <line key={i} x1={36+r1*Math.cos(rad)} y1={36+r1*Math.sin(rad)} x2={36+r2*Math.cos(rad)} y2={36+r2*Math.sin(rad)} stroke="#FFB800" strokeWidth="0.8" opacity="0.5"/>;
      })}
    </svg>
  );
  if (type === "decide") return (
    <svg {...s} fill="none">
      <circle cx="36" cy="36" r="26" stroke="#FFB800" strokeWidth="1" opacity="0.25"/>
      {[0,45,90,135,180,225,270,315].map((a, i) => {
        const r = 20, rad = a * Math.PI / 180;
        return <circle key={i} cx={36+r*Math.cos(rad)} cy={36+r*Math.sin(rad)} r={i%2===0?2:1.2} fill="#FFB800" opacity={i%2===0?0.9:0.5}/>;
      })}
      <circle cx="36" cy="36" r="5" fill="#FFB800"/>
    </svg>
  );
  if (type === "dispatch") return (
    <svg {...s} fill="none">
      <rect x="12" y="28" width="36" height="20" rx="2" stroke="#FFB800" strokeWidth="1.2" opacity="0.6"/>
      <rect x="38" y="22" width="14" height="14" rx="1" stroke="#FFB800" strokeWidth="1" opacity="0.5"/>
      <circle cx="22" cy="52" r="5" stroke="#FFB800" strokeWidth="1.5" opacity="0.8"/>
      <circle cx="42" cy="52" r="5" stroke="#FFB800" strokeWidth="1.5" opacity="0.8"/>
      <circle cx="22" cy="52" r="2" fill="#FFB800" opacity="0.9"/>
      <circle cx="42" cy="52" r="2" fill="#FFB800" opacity="0.9"/>
    </svg>
  );
  return (
    <svg {...s} fill="none">
      <path d="M20,36 C20,26 30,20 36,28 C42,36 52,42 52,36 C52,26 42,20 36,28 C30,36 20,42 20,36 Z" stroke="#FFB800" strokeWidth="1.5" opacity="0.7"/>
      <circle cx="36" cy="32" r="2.5" fill="#FFB800" opacity="0.9"/>
    </svg>
  );
}

function BadgeIcon({ type }: { type: string }) {
  const s = { width: 28, height: 28, viewBox: "0 0 28 28" as const, fill: "none" };
  if (type === "auto") return <svg {...s}><circle cx="14" cy="14" r="11" stroke="#FFB800" strokeWidth="1.2" opacity="0.6"/><circle cx="14" cy="14" r="4" fill="#FFB800" opacity="0.8"/><line x1="14" y1="3" x2="14" y2="7" stroke="#FFB800" strokeWidth="1.2"/><line x1="14" y1="21" x2="14" y2="25" stroke="#FFB800" strokeWidth="1.2"/><line x1="3" y1="14" x2="7" y2="14" stroke="#FFB800" strokeWidth="1.2"/><line x1="21" y1="14" x2="25" y2="14" stroke="#FFB800" strokeWidth="1.2"/></svg>;
  if (type === "ind") return <svg {...s}><rect x="6" y="10" width="16" height="12" rx="1" stroke="#FFB800" strokeWidth="1.2" opacity="0.6"/><rect x="10" y="6" width="8" height="6" rx="1" stroke="#FFB800" strokeWidth="1" opacity="0.5"/><line x1="14" y1="16" x2="14" y2="20" stroke="#FFB800" strokeWidth="1.2"/></svg>;
  if (type === "rt") return <svg {...s}><circle cx="14" cy="14" r="10" stroke="#FFB800" strokeWidth="1.2" opacity="0.5"/><path d="M14,8 L14,14 L19,14" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round"/></svg>;
  return <svg {...s}><rect x="4" y="8" width="20" height="12" rx="2" stroke="#FFB800" strokeWidth="1.2" opacity="0.5"/><line x1="8" y1="8" x2="8" y2="4" stroke="#FFB800" strokeWidth="1.2" opacity="0.5"/><line x1="14" y1="8" x2="14" y2="4" stroke="#FFB800" strokeWidth="1.2" opacity="0.5"/><line x1="20" y1="8" x2="20" y2="4" stroke="#FFB800" strokeWidth="1.2" opacity="0.5"/></svg>;
}

/* ── Page ──────────────────────────────────────────────────────── */
export default function LandingPage() {
  const router = useRouter();
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".gs-nav", { y: -30, opacity: 0, duration: 0.5, ease: "power3.out" });
      gsap.from(".gs-hero-left", { x: -40, opacity: 0, duration: 0.7, delay: 0.2, ease: "power3.out" });
      gsap.from(".gs-metrics-row", { x: 30, opacity: 0, duration: 0.4, stagger: 0.07, delay: 0.3, ease: "power2.out" });
      gsap.from(".gs-center-badge", { y: -14, opacity: 0, duration: 0.5, stagger: 0.12, delay: 0.5, ease: "back.out(2)" });
      gsap.from(".gs-step", { y: 24, opacity: 0, duration: 0.45, stagger: 0.1, delay: 0.1, ease: "power2.out" });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  const METRIC_ICONS: Record<string, React.ReactNode> = {
    fleet: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="6" width="9" height="5" rx="1" stroke="#FFB800" strokeWidth="1.1"/>
        <rect x="8" y="4" width="4" height="4" rx="0.5" stroke="#FFB800" strokeWidth="1"/>
        <circle cx="3.5" cy="11.5" r="1.3" stroke="#FFB800" strokeWidth="1"/>
        <circle cx="9.5" cy="11.5" r="1.3" stroke="#FFB800" strokeWidth="1"/>
      </svg>
    ),
    dispatch: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="2" fill="#FFB800" opacity="0.9"/>
        {[0,60,120,180,240,300].map((a, i) => {
          const rad = a * Math.PI / 180;
          return <line key={i} x1={8+3*Math.cos(rad)} y1={8+3*Math.sin(rad)} x2={8+5.5*Math.cos(rad)} y2={8+5.5*Math.sin(rad)} stroke="#FFB800" strokeWidth="1" opacity="0.6"/>;
        })}
        <circle cx="8" cy="8" r="5.5" stroke="#FFB800" strokeWidth="0.8" opacity="0.3"/>
      </svg>
    ),
    terrain: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <polygon points="8,2 14,12 2,12" stroke="#FFB800" strokeWidth="1" opacity="0.4"/>
        <polygon points="8,5 12,11 4,11" stroke="#FFB800" strokeWidth="0.8" opacity="0.6"/>
        <polygon points="8,8 10.5,11 5.5,11" stroke="#FFB800" strokeWidth="0.6" opacity="0.9"/>
        <circle cx="8" cy="8" r="1" fill="#FFB800"/>
      </svg>
    ),
    idle: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="5.5" stroke="#FFB800" strokeWidth="1" opacity="0.5"/>
        <path d="M8 4 L8 8 L11 8" stroke="#FFB800" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
    fuel: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="3" y="3" width="7" height="10" rx="1" stroke="#FFB800" strokeWidth="1"/>
        <path d="M10 5 L13 5 L13 9 L10 9" stroke="#FFB800" strokeWidth="0.9"/>
        <line x1="5" y1="6" x2="8" y2="6" stroke="#FFB800" strokeWidth="0.8" opacity="0.7"/>
        <line x1="5" y1="8" x2="8" y2="8" stroke="#FFB800" strokeWidth="0.8" opacity="0.5"/>
      </svg>
    ),
    brain: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 3 C5 3 3 5 3 7.5 C3 9 4 10.5 5.5 11 L5.5 13 L10.5 13 L10.5 11 C12 10.5 13 9 13 7.5 C13 5 11 3 8 3Z" stroke="#FFB800" strokeWidth="1" opacity="0.7" fill="none"/>
        <circle cx="6" cy="7" r="0.7" fill="#FFB800" opacity="0.9"/>
        <circle cx="10" cy="7" r="0.7" fill="#FFB800" opacity="0.9"/>
        <line x1="6" y1="7" x2="10" y2="7" stroke="#FFB800" strokeWidth="0.7" opacity="0.5"/>
      </svg>
    ),
  };

  const METRICS = [
    { icon: METRIC_ICONS.fleet, label: "Fleet Efficiency", value: "92.7%", delta: "8.6%", positive: true, data: [60,65,58,72,68,80,79,88,92], type: "line" as const },
    { icon: METRIC_ICONS.dispatch, label: "Dispatch Optimization", value: "98.3%", delta: "11.2%", positive: true, data: [4,6,5,8,7,10,9,11,10], type: "bar" as const },
    { icon: METRIC_ICONS.terrain, label: "Terrain Adaptation", value: "120ms", delta: "15ms", positive: true, data: [180,165,155,148,140,130,125,122,120], type: "line" as const },
    { icon: METRIC_ICONS.idle, label: "Idle Time Reduction", value: "36.4%", delta: "6.8%", positive: false, data: [43,41,38,37,35,34,36,33,35], type: "line" as const },
    { icon: METRIC_ICONS.fuel, label: "Fuel Optimization", value: "18.7%", delta: "3.2%", positive: true, data: [12,13,14,15,16,17,17,18,18], type: "line" as const },
    { icon: METRIC_ICONS.brain, label: "RL Training Iterations", value: "2.43M", delta: "120K", positive: true, data: [3,5,4,7,6,9,8,10,11], type: "bar" as const },
  ];

  const STEPS = [
    { n: "01", label: "SENSE", desc: "Real-time data from terrain, fleet & environment", type: "sense" as const },
    { n: "02", label: "ANALYZE", desc: "AI models evaluate terrain, load & traffic", type: "analyze" as const },
    { n: "03", label: "DECIDE", desc: "RL engine determines optimal actions", type: "decide" as const },
    { n: "04", label: "DISPATCH", desc: "Smart dispatch to the right truck, right time", type: "dispatch" as const },
    { n: "05", label: "ADAPT", desc: "Continuous learning improves every cycle", type: "adapt" as const },
  ];

  const TRUCKS = [
    { id: "CAT-793", color: "#FFB800", status: "DUMPING" },
    { id: "CAT-777", color: "#00D4FF", status: "EN ROUTE" },
    { id: "CAT-797", color: "#FF6B35", status: "STANDBY" },
  ];

  return (
    <div ref={rootRef} style={{ background: "#080808", minHeight: "100vh", overflowX: "hidden", fontFamily: "sans-serif" }}>

      {/* CSS keyframe animations */}
      <style>{`
        @keyframes blink-dot {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px #FFB800; }
          50% { opacity: 0.3; box-shadow: none; }
        }
        @keyframes ring-breathe {
          0%, 100% { opacity: 0.55; transform: translate(-50%,-50%) scale(1); }
          50% { opacity: 0.18; transform: translate(-50%,-50%) scale(1.07); }
        }
        @keyframes scan-sweep {
          0% { left: -10%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { left: 110%; opacity: 0; }
        }
        @keyframes truck-ping {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes float-y {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-5px); }
        }
        @keyframes data-slide {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>

      {/* ── Nav ───────────────────────────────────────────── */}
      <nav className="gs-nav" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", background: "rgba(8,8,8,0.92)", borderBottom: "1px solid rgba(255,184,0,0.08)", backdropFilter: "blur(20px)" }}>
        <div
          onClick={() => router.push("/")}
          style={{ display: "flex", alignItems: "baseline", gap: 10, flexShrink: 0, cursor: "pointer" }}
        >
          <div style={{ display: "flex", alignItems: "baseline" }}>
            {"ADIOS".split("").map((ch, i) => (
              <span key={i} style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 900, fontSize: "1.3rem", letterSpacing: "0.1em", color: ch === "O" ? "#FFB800" : "#FFF", textShadow: ch === "O" ? "0 0 20px #FFB800" : "none" }}>{ch}</span>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0, marginLeft: 6 }}>
            <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.36rem", color: "#4B5563", letterSpacing: "0.12em", textTransform: "uppercase", lineHeight: 1 }}>ADAPTIVE INTELLIGENCE</span>
            <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.36rem", color: "#4B5563", letterSpacing: "0.12em", textTransform: "uppercase", lineHeight: 1 }}>SYSTEM</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          {NAV_LINKS.map((link) => {
            const isActive = pathname === NAV_ROUTES[link];
            return (
              <button
                key={link}
                onClick={() => router.push(NAV_ROUTES[link])}
                style={{ fontFamily: "JetBrains Mono", fontSize: "0.52rem", letterSpacing: "0.12em", color: isActive ? "#FFB800" : "#6B7280", background: "transparent", border: "none", cursor: "pointer", padding: "2px 0", borderBottom: isActive ? "1px solid #FFB800" : "1px solid transparent", transition: "color 0.2s" }}
              >
                {link}
              </button>
            );
          })}
        </div>

        <motion.button
          onClick={() => router.push("/dashboard")}
          whileHover={{ background: "#FFB800", color: "#000" }}
          style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 700, fontSize: "0.6rem", letterSpacing: "0.16em", color: "#FFB800", background: "transparent", border: "1px solid #FFB800", borderRadius: 2, padding: "8px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s", flexShrink: 0 }}
        >
          LAUNCH PLATFORM <span style={{ fontSize: "0.8rem" }}>→</span>
        </motion.button>
      </nav>

      {/* ── Hero Section ──────────────────────────────────── */}
      <section style={{ position: "relative", height: "100vh", overflow: "hidden", paddingTop: 56 }}>

        {/* Three.js background */}
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
          <Suspense fallback={null}>
            <LandingHeroScene />
          </Suspense>
        </div>

        {/* Overlays — lighter center so 3D scene shows through */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 38% 65% at 50% 55%, transparent 0%, rgba(8,8,8,0.08) 45%, rgba(8,8,8,0.5) 100%)", zIndex: 1, pointerEvents: "none" }} />
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "38%", background: "linear-gradient(to right, rgba(8,8,8,0.97) 0%, rgba(8,8,8,0.82) 55%, transparent 100%)", zIndex: 2, pointerEvents: "none" }} />
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "27%", background: "linear-gradient(to left, rgba(8,8,8,0.98) 0%, rgba(8,8,8,0.82) 55%, transparent 100%)", zIndex: 2, pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "22%", background: "linear-gradient(to top, rgba(8,8,8,1) 0%, transparent 100%)", zIndex: 2, pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "12%", background: "linear-gradient(to bottom, rgba(8,8,8,0.7) 0%, transparent 100%)", zIndex: 2, pointerEvents: "none" }} />

        {/* Content layer */}
        <div style={{ position: "relative", zIndex: 10, height: "100%", display: "flex", alignItems: "stretch", padding: "0 32px" }}>

          {/* LEFT: hero text + CTAs */}
          <div className="gs-hero-left" style={{ width: "36%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 0, paddingBottom: 40 }}>
            <div style={{ display: "flex", alignItems: "baseline", marginBottom: 14, lineHeight: 0.85 }}>
              {"ADIOS".split("").map((ch, i) => (
                <span key={i} style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 900, fontSize: "clamp(3.5rem,7.5vw,6rem)", letterSpacing: "0.08em", color: ch === "O" ? "#FFB800" : "#FFF", textShadow: ch === "O" ? "0 0 60px rgba(255,184,0,0.5), 0 0 120px rgba(255,184,0,0.15)" : "none" }}>{ch}</span>
              ))}
            </div>
            <div style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 700, fontSize: "0.72rem", letterSpacing: "0.14em", color: "#FFF", lineHeight: 1.4, marginBottom: 18, textTransform: "uppercase" }}>
              Adaptive Dump Intelligence &<br />Orchestration System
            </div>
            <div style={{ width: 48, height: 2, background: "#FFB800", marginBottom: 18 }} />
            <p style={{ fontFamily: "JetBrains Mono", fontSize: "0.68rem", color: "#6B7280", lineHeight: 1.7, marginBottom: 32, maxWidth: 340 }}>
              Real-time adaptive intelligence for autonomous mining logistics. Optimizing every dump. Every load. Every decision.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 260 }}>
              <motion.button
                onClick={() => router.push("/dashboard")}
                whileHover={{ scale: 1.02, boxShadow: "0 0 40px rgba(255,184,0,0.5)" }}
                whileTap={{ scale: 0.98 }}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "#FFB800", border: "none", borderRadius: 2, cursor: "pointer", fontFamily: "'Syncopate', sans-serif", fontWeight: 700, fontSize: "0.68rem", letterSpacing: "0.16em", color: "#000", boxShadow: "0 0 24px rgba(255,184,0,0.3)" }}
              >
                LAUNCH PLATFORM <span style={{ fontSize: "1rem" }}>→</span>
              </motion.button>
              <motion.button
                onClick={() => router.push("/dashboard")}
                whileHover={{ borderColor: "#FFB800", color: "#FFB800" }}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 20px", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 2, cursor: "pointer", fontFamily: "'Syncopate', sans-serif", fontWeight: 700, fontSize: "0.62rem", letterSpacing: "0.16em", color: "#FFF", transition: "all 0.2s" }}
              >
                VIEW SIMULATION <span>→</span>
              </motion.button>
              <motion.button
                onClick={() => router.push("/intelligence")}
                whileHover={{ borderColor: "#FFB800", color: "#FFB800" }}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 20px", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 2, cursor: "pointer", fontFamily: "'Syncopate', sans-serif", fontWeight: 700, fontSize: "0.62rem", letterSpacing: "0.16em", color: "#9CA3AF", transition: "all 0.2s" }}
              >
                EXPLORE ENGINE <span>→</span>
              </motion.button>
            </div>
          </div>

          {/* CENTER: Terrain visualization + scan elements */}
          <div style={{ flex: 1, position: "relative" }}>

            {/* Terrain Scan Widget — top center */}
            <div className="gs-center-badge" style={{ position: "absolute", top: "6%", left: "50%", transform: "translateX(-50%)", background: "rgba(6,8,10,0.88)", border: "1px solid rgba(255,184,0,0.35)", borderRadius: 3, overflow: "hidden", backdropFilter: "blur(14px)", width: 230, pointerEvents: "none" }}>
              <div style={{ padding: "6px 12px", borderBottom: "1px solid rgba(255,184,0,0.12)", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#FFB800", animation: "blink-dot 1.5s ease-in-out infinite" }} />
                <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.47rem", color: "#FFB800", letterSpacing: "0.16em" }}>TERRAIN SCAN ACTIVE</span>
              </div>
              {/* Terrain wireframe SVG */}
              <div style={{ position: "relative", overflow: "hidden" }}>
                <svg width="230" height="88" viewBox="0 0 230 88" fill="none" style={{ display: "block" }}>
                  {/* Grid */}
                  {[1,2,3,4].map(i => (
                    <line key={`h${i}`} x1="0" y1={i*18} x2="230" y2={i*18} stroke="#FFB800" strokeWidth="0.4" opacity="0.1"/>
                  ))}
                  {[1,2,3,4,5].map(i => (
                    <line key={`v${i}`} x1={i*40} y1="0" x2={i*40} y2="88" stroke="#FFB800" strokeWidth="0.4" opacity="0.1"/>
                  ))}
                  {/* Terrain fill */}
                  <polygon points="0,88 0,72 22,68 40,60 58,62 75,50 90,44 105,38 118,32 130,38 142,44 158,36 172,28 185,36 200,44 215,52 230,58 230,88" fill="rgba(255,184,0,0.07)"/>
                  {/* Contour lines */}
                  <polyline points="0,72 22,68 40,60 58,62 75,50 90,44 105,38 118,32 130,38 142,44 158,36 172,28 185,36 200,44 215,52 230,58" stroke="#FFB800" strokeWidth="1.5" opacity="0.9" fill="none"/>
                  <polyline points="0,78 22,74 40,68 58,70 75,60 90,54 105,48 118,43 130,48 142,54 158,47 172,38 185,46 200,54 215,62 230,67" stroke="#FFB800" strokeWidth="0.8" opacity="0.45" fill="none"/>
                  <polyline points="0,82 22,79 40,75 58,76 75,68 90,62 105,58 118,54 130,58 142,63 158,57 172,50 185,57 200,64 215,71 230,75" stroke="#FFB800" strokeWidth="0.5" opacity="0.25" fill="none"/>
                  {/* Peak beacon */}
                  <circle cx="172" cy="28" r="3.5" fill="#FFB800" opacity="0.95"/>
                  <circle cx="172" cy="28" r="8" stroke="#FFB800" strokeWidth="0.8" opacity="0.5" fill="none"/>
                  <circle cx="172" cy="28" r="14" stroke="#FFB800" strokeWidth="0.4" opacity="0.25" fill="none"/>
                  <line x1="172" y1="0" x2="172" y2="88" stroke="#FFB800" strokeWidth="0.5" opacity="0.18" strokeDasharray="3 4"/>
                  <line x1="0" y1="28" x2="230" y2="28" stroke="#FFB800" strokeWidth="0.5" opacity="0.18" strokeDasharray="3 4"/>
                </svg>
                {/* Scan sweep line */}
                <div style={{ position: "absolute", top: 0, bottom: 0, width: "3px", background: "linear-gradient(to bottom, transparent, rgba(255,184,0,0.7), transparent)", animation: "scan-sweep 3s linear infinite", borderRadius: 1 }} />
              </div>
            </div>

            {/* Animated scan rings centered in scene */}
            <div style={{ position: "absolute", top: "52%", left: "50%", transform: "translate(-50%,-50%)", pointerEvents: "none" }}>
              {[180, 120, 68].map((size, i) => (
                <div key={i} style={{
                  position: "absolute", top: "50%", left: "50%",
                  width: size, height: size, borderRadius: "50%",
                  border: `1px solid rgba(255,184,0,${0.1 + i * 0.08})`,
                  animation: `ring-breathe ${2.8 + i * 0.4}s ease-in-out infinite ${i * 0.35}s`,
                }}/>
              ))}
              {/* Crosshair */}
              <div style={{ position: "absolute", top: "50%", left: "50%", width: 1, height: 40, background: "linear-gradient(to bottom, transparent, rgba(255,184,0,0.3))", transform: "translate(-50%, -100%)" }} />
              <div style={{ position: "absolute", top: "50%", left: "50%", width: 1, height: 40, background: "linear-gradient(to top, transparent, rgba(255,184,0,0.3))", transform: "translate(-50%, 0%)" }} />
              <div style={{ position: "absolute", top: "50%", left: "50%", width: 40, height: 1, background: "linear-gradient(to right, transparent, rgba(255,184,0,0.3))", transform: "translate(-100%, -50%)" }} />
              <div style={{ position: "absolute", top: "50%", left: "50%", width: 40, height: 1, background: "linear-gradient(to left, transparent, rgba(255,184,0,0.3))", transform: "translate(0%, -50%)" }} />
              {/* Center dot */}
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 9, height: 9, borderRadius: "50%", background: "#FFB800", boxShadow: "0 0 18px rgba(255,184,0,0.9), 0 0 36px rgba(255,184,0,0.4)" }} />
            </div>

            {/* Truck status trackers (bottom left of center) */}
            <div className="gs-center-badge" style={{ position: "absolute", bottom: "32%", left: "4%", display: "flex", flexDirection: "column", gap: 6, pointerEvents: "none" }}>
              {TRUCKS.map(({ id, color, status }) => (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ position: "relative", width: 8, height: 8, flexShrink: 0 }}>
                    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}` }} />
                    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color, animation: "truck-ping 1.8s ease-out infinite" }} />
                  </div>
                  <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.47rem", color, letterSpacing: "0.1em" }}>{id}</span>
                  <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.42rem", color: "#4B5563", letterSpacing: "0.08em" }}>{status}</span>
                </div>
              ))}
            </div>

            {/* Route + Fuel card (bottom right of center) */}
            <div className="gs-center-badge" style={{ position: "absolute", bottom: "30%", right: "4%", padding: "10px 16px", background: "rgba(6,8,10,0.88)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 3, backdropFilter: "blur(10px)", pointerEvents: "none", animation: "float-y 4s ease-in-out infinite" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#FFB800", boxShadow: "0 0 6px #FFB800" }} />
                <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.46rem", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em" }}>Route Optimized</span>
              </div>
              <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.78rem", color: "#FFF", fontWeight: 700, marginBottom: 8, letterSpacing: "-0.01em" }}>ETA 02:45 MIN</div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.07)", marginBottom: 6 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 6px #22C55E" }} />
                <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.46rem", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em" }}>Fuel Optimized</span>
              </div>
              <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.78rem", color: "#22C55E", fontWeight: 700, letterSpacing: "-0.01em" }}>+18% EFFICIENCY</div>
            </div>

            {/* PPO Active badge */}
            <div className="gs-center-badge" style={{ position: "absolute", top: "42%", left: "3%", padding: "5px 11px", background: "rgba(6,8,10,0.82)", border: "1px solid rgba(255,184,0,0.2)", borderRadius: 2, backdropFilter: "blur(8px)", pointerEvents: "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 5px #22C55E" }} />
                <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.44rem", color: "#22C55E", letterSpacing: "0.12em" }}>PPO POLICY ACTIVE</span>
              </div>
            </div>
          </div>

          {/* RIGHT: Live System Metrics */}
          <div style={{ width: "22%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 0, background: "rgba(6,8,10,0.82)", border: "1px solid rgba(255,184,0,0.12)", borderRadius: 4, backdropFilter: "blur(14px)", overflow: "hidden", alignSelf: "center" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#FFB800", boxShadow: "0 0 6px #FFB800", animation: "blink-dot 2s ease-in-out infinite" }} />
              <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.52rem", color: "#FFF", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700 }}>Live System Metrics</span>
            </div>
            {METRICS.map((m) => (
              <div key={m.label} className="gs-metrics-row">
                <MetricRow {...m} />
              </div>
            ))}
            <div style={{ padding: "8px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.48rem", color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.1em" }}>System Status</span>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 6px #22C55E" }} />
                <span style={{ fontFamily: "JetBrains Mono", fontSize: "0.52rem", color: "#22C55E", fontWeight: 700, letterSpacing: "0.1em" }}>OPERATIONAL</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How ADIOS Thinks ──────────────────────────────── */}
      <section style={{ background: "#0A0A0A", borderTop: "1px solid rgba(255,184,0,0.07)", padding: "60px 32px 56px" }}>
        <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
          <div style={{ width: "28%", flexShrink: 0 }}>
            <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.52rem", color: "#6B7280", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 16, height: 1, background: "#FFB800" }} />
              How ADIOS Thinks
            </div>
            <h2 style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 900, fontSize: "clamp(1.4rem,3vw,2.2rem)", color: "#FFF", lineHeight: 1.15, textTransform: "uppercase", marginBottom: 20, letterSpacing: "0.04em" }}>
              Adapt.<br />Predict.<br />Optimize.<br />Deliver.
            </h2>
            <p style={{ fontFamily: "JetBrains Mono", fontSize: "0.62rem", color: "#6B7280", lineHeight: 1.75, marginBottom: 28 }}>
              ADIOS leverages reinforcement learning, real-time terrain intelligence, and adaptive orchestration to ensure smart dispatch and maximum operational efficiency.
            </p>
            <motion.button
              onClick={() => router.push("/intelligence")}
              whileHover={{ borderColor: "#FFB800", color: "#FFB800" }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 18px", background: "transparent", border: "1px solid rgba(255,184,0,0.35)", borderRadius: 2, cursor: "pointer", fontFamily: "'Syncopate', sans-serif", fontWeight: 700, fontSize: "0.56rem", letterSpacing: "0.16em", color: "#FFB800", transition: "all 0.2s" }}
            >
              EXPLORE INTELLIGENCE ENGINE →
            </motion.button>
          </div>

          <div className="gs-steps-row" style={{ flex: 1, display: "flex", gap: 1 }}>
            {STEPS.map((step, i) => (
              <motion.div
                key={step.n}
                className="gs-step"
                whileHover={{ background: "rgba(255,184,0,0.04)", borderColor: "rgba(255,184,0,0.2)" }}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 12px", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 3, gap: 12, cursor: "default", transition: "all 0.2s", position: "relative" }}
              >
                {i < STEPS.length - 1 && (
                  <div style={{ position: "absolute", top: "44px", right: "-1px", width: 1, height: 20, background: "rgba(255,184,0,0.2)" }} />
                )}
                <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.52rem", color: "#4B5563", letterSpacing: "0.1em", alignSelf: "flex-start" }}>{step.n}</div>
                <StepIcon type={step.type} />
                <div style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 700, fontSize: "0.62rem", letterSpacing: "0.18em", color: "#FFB800", textTransform: "uppercase", textAlign: "center" }}>{step.label}</div>
                <p style={{ fontFamily: "JetBrains Mono", fontSize: "0.52rem", color: "#6B7280", lineHeight: 1.6, textAlign: "center", margin: 0 }}>{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer style={{ background: "#050505", borderTop: "1px solid rgba(255,255,255,0.04)", padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <div>
            <div style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 700, fontSize: "0.56rem", letterSpacing: "0.2em", color: "#9CA3AF", textTransform: "uppercase" }}>Built for the</div>
            <div style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 900, fontSize: "0.82rem", letterSpacing: "0.18em", color: "#FFF", textTransform: "uppercase" }}>Future of Mining</div>
          </div>
          <div style={{ width: 1, height: 36, background: "rgba(255,255,255,0.08)" }} />
          {[
            { icon: "auto", title: "Autonomous Ready", desc: "Designed for future autonomous mining ecosystems." },
            { icon: "ind", title: "Industrial Grade", desc: "Built for reliability. Built for extreme environments." },
            { icon: "rt", title: "Real Time Intelligence", desc: "Millisecond-level decisions that drive impact." },
            { icon: "scale", title: "Scalable Architecture", desc: "Cloud-native. Edge-ready. Future-proof." },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <BadgeIcon type={icon} />
              <div>
                <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.52rem", color: "#FFF", fontWeight: 700, marginBottom: 2 }}>{title}</div>
                <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.44rem", color: "#4B5563", lineHeight: 1.5, maxWidth: 130 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ background: "#FFB800", padding: "10px 20px", borderRadius: 2, flexShrink: 0 }}>
          <div style={{ fontFamily: "'Syncopate', sans-serif", fontWeight: 900, fontSize: "1rem", letterSpacing: "0.08em", color: "#000" }}>CATERPILLAR</div>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.36rem", color: "#000", opacity: 0.6, letterSpacing: "0.12em", textAlign: "center", marginTop: 1 }}>®</div>
        </div>
      </footer>
    </div>
  );
}
