"use client";
import React, { useEffect, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const Scene3D = dynamic(() => import("@/components/three/Scene3D"), { ssr: false });

// Pre-baked demo terrain (simple synthetic ellipse fill)
function makeDemoTerrain(frame: number) {
  const N = 100;
  const surface: number[][] = Array.from({ length: N }, () => Array(N).fill(0));
  const mask: boolean[][] = Array.from({ length: N }, (_, r) =>
    Array.from({ length: N }, (_, c) => {
      const dr = (r - 50) / 36, dc = (c - 50) / 40;
      return dr * dr + dc * dc <= 1.0;
    })
  );
  // simulate cone dumps up to `frame`
  const n = Math.min(frame, 60);
  for (let i = 0; i < n; i++) {
    const seed = i * 1234567 + 42;
    const r = 28 + (seed % 44);
    const c = 20 + ((seed * 3) % 60);
    if (!mask[r][c]) continue;
    const radius = 5 + (i % 4);
    for (let rr = 0; rr < N; rr++) {
      for (let cc = 0; cc < N; cc++) {
        if (!mask[rr][cc]) continue;
        const d = Math.sqrt((rr - r) ** 2 + (cc - c) ** 2);
        const cone = Math.max(0, 1 - d / radius);
        surface[rr][cc] += cone * 0.7;
      }
    }
  }
  return { surface, mask };
}

export default function LandingPage() {
  const router = useRouter();
  const [frame, setFrame] = useState(0);
  const [terrain, setTerrain] = useState(() => makeDemoTerrain(0));
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);
  }, []);

  // animate terrain filling
  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => {
        const next = f >= 60 ? 0 : f + 1;
        setTerrain(makeDemoTerrain(next));
        return next;
      });
    }, 200);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative",
      overflow: "hidden", background: "#050A0F" }}>

      {/* 3D background */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.7 }}>
        <Suspense fallback={null}>
          <Scene3D
            surface={terrain.surface}
            mask={terrain.mask}
            entry={[85, 50]}
            heightScale={4}
            camPreset="iso"
          />
        </Suspense>
      </div>

      {/* Overlay gradient */}
      <div style={{ position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at 50% 80%, transparent 20%, #050A0F 80%)",
        pointerEvents: "none" }} />

      {/* Content */}
      <div style={{
        position: "absolute", inset: 0, display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 24, padding: "0 24px",
        opacity: visible ? 1 : 0, transform: visible ? "none" : "translateY(20px)",
        transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "Syncopate", fontSize: "clamp(3rem,8vw,7rem)",
            fontWeight: 700, letterSpacing: "0.25em", lineHeight: 1,
            color: "#C8FF00", textShadow: "0 0 40px rgba(200,255,0,0.5)" }}>
            ADI<span style={{ color: "#FF6B35", textShadow: "0 0 40px rgba(255,107,53,0.5)" }}>O</span>S
          </div>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.7rem",
            letterSpacing: "0.35em", textTransform: "uppercase", color: "#3A6070",
            marginTop: 8 }}>
            Adaptive Dump Intelligence & Orchestration System
          </div>
        </div>

        {/* Tagline */}
        <div style={{ maxWidth: 520, textAlign: "center" }}>
          <p style={{ fontFamily: "DM Sans", fontWeight: 300, fontSize: "1.05rem",
            color: "#7AA8BC", lineHeight: 1.7 }}>
            Real-time adaptive dump packing powered by deep reinforcement learning.
            Every truck dispatch re-evaluated against live terrain state.
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 32, marginTop: 8 }}>
          {[
            ["7.38m → 3.03m", "Spacing target"],
            ["< 2s", "Decision latency"],
            ["100K+ steps", "PPO training"],
          ].map(([val, label]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "JetBrains Mono", fontSize: "1.2rem",
                color: "#C8FF00", fontWeight: 600 }}>{val}</div>
              <div style={{ fontFamily: "JetBrains Mono", fontSize: "0.6rem",
                color: "#3A6070", letterSpacing: "0.1em", textTransform: "uppercase",
                marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={() => router.push("/dashboard")}
          style={{
            marginTop: 16,
            padding: "14px 48px",
            background: "#C8FF00",
            color: "#000",
            border: "none",
            fontFamily: "Syncopate",
            fontSize: "0.85rem",
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            cursor: "pointer",
            boxShadow: "0 0 30px rgba(200,255,0,0.4)",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.boxShadow = "0 0 60px rgba(200,255,0,0.7)";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.boxShadow = "0 0 30px rgba(200,255,0,0.4)";
          }}
        >
          Launch Dashboard →
        </button>

        {/* Team */}
        <div style={{ position: "absolute", bottom: 24,
          fontFamily: "JetBrains Mono", fontSize: "0.6rem",
          color: "#3A6070", letterSpacing: "0.15em", textTransform: "uppercase" }}>
          Team Butterfly · Caterpillar Hackathon · Problem Statement 4
        </div>
      </div>
    </div>
  );
}
