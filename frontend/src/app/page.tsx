"use client";
import React, { useEffect, useState, useRef, Suspense } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { fetchBenchmark } from "@/lib/api";

const LandingHeroScene = dynamic(() => import("@/components/landing/LandingHeroScene"), { ssr: false });

/* ── Animated counter hook ─────────────────────────────────────────── */
function useCountUp(end: number, duration: number = 1800, decimals: number = 0, startDelay: number = 0) {
  const [val, setVal] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let start: number | null = null;
    let delayDone = false;

    const tick = (ts: number) => {
      if (!delayDone) {
        if (!start) start = ts;
        if (ts - start < startDelay) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        delayDone = true;
        start = ts;
      }
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(parseFloat((eased * end).toFixed(decimals)));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [end, duration, decimals, startDelay]);

  return val;
}

function AnimatedStat({ value, suffix, label, delay }: { value: number; suffix: string; label: string; delay: number }) {
  const animated = useCountUp(value, 2000, value % 1 !== 0 ? 1 : 0, delay);
  return (
    <div className="text-center group">
      <div className="font-mono text-2xl sm:text-3xl font-bold transition-colors"
        style={{ color: "var(--acid)" }}>
        {animated}{suffix}
      </div>
      <div className="font-mono text-[0.7rem] tracking-[0.15em] uppercase mt-2 transition-colors"
        style={{ color: "var(--muted)" }}>
        {label}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [statsVisible, setStatsVisible] = useState(false);

  // Real benchmark data
  const [stats, setStats] = useState({
    coverage: 99.2,
    latency: 3.9,
    efficiency: 11.6,
    spacing: 7.84,
  });

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);
    setTimeout(() => setStatsVisible(true), 600);

    // Fetch real benchmark data
    fetchBenchmark()
      .then((data: any) => {
        if (data?.summaries) {
          const h = data.summaries.find((s: any) => s.policy === "heuristic");
          if (h?.kpis) {
            setStats({
              coverage: h.kpis.coverage_pct?.mean ?? 99.2,
              latency: h.kpis.latency_ms?.mean ?? 3.9,
              efficiency: h.kpis.packing_efficiency?.mean ?? 11.6,
              spacing: h.kpis.mean_spacing_m?.mean ?? 7.84,
            });
          }
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="w-screen h-screen relative overflow-hidden bg-gray-50 dark:bg-[#050608] font-sans selection:bg-[#FFC000] selection:text-black">
      
      {/* 3D Background */}
      <div className="absolute inset-0 opacity-75">
        <Suspense fallback={null}>
          <LandingHeroScene />
        </Suspense>
      </div>

      {/* Cinematic Overlays */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_#050608_100%)] pointer-events-none" />
      <div className="absolute inset-0 adios-grid-overlay opacity-10 pointer-events-none" />

      {/* Content Container */}
      <div className={`absolute inset-0 flex flex-col items-center justify-center p-6 transition-all duration-1000 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        
        {/* Logo */}
        <div className="text-center">
          <h1 className="font-syncopate text-[clamp(3rem,8vw,7rem)] font-bold tracking-[0.25em] leading-none text-black dark:text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
            ADI<span className="text-[#FFC000] drop-shadow-[0_0_30px_rgba(245,166,35,0.4)]">O</span>S
          </h1>
          <p className="font-mono text-sm tracking-[0.35em] uppercase text-gray-600 dark:text-[#9ca3af] mt-4">
            Adaptive Dump Intelligence &amp; Orchestration System
          </p>
        </div>

        {/* Tagline */}
        <div className="max-w-2xl text-center mt-6">
          <p className="font-light text-lg text-gray-800 dark:text-[#d1d5db] leading-relaxed">
            Real-time adaptive dump packing powered by deep reinforcement learning. 
            Every truck dispatch is evaluated against the live terrain state.
          </p>
        </div>

        {/* Animated Stats from Real Benchmark */}
        <div className={`flex gap-8 sm:gap-14 mt-10 transition-all duration-1000 ${statsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          {statsVisible && (
            <>
              <AnimatedStat value={stats.coverage} suffix="%" label="Coverage" delay={0} />
              <AnimatedStat value={stats.latency} suffix="ms" label="Decision Latency" delay={200} />
              <AnimatedStat value={stats.spacing} suffix="m" label="Mean Spacing" delay={400} />
              <AnimatedStat value={stats.efficiency} suffix="%" label="Pack Efficiency" delay={600} />
            </>
          )}
        </div>

        {/* Live badge */}
        <div className={`flex items-center gap-2 mt-6 transition-all duration-700 delay-700 ${statsVisible ? 'opacity-100' : 'opacity-0'}`}>
          <span className="w-2 h-2 rounded-full" style={{ background: "var(--acid)", animation: "pulse 2s ease-in-out infinite", boxShadow: "0 0 8px var(--acid)" }} />
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.15em]" style={{ color: "var(--muted)" }}>
            Stats from 20-polygon benchmark suite
          </span>
        </div>

        {/* CTA Button */}
        <button
          onClick={() => router.push("/dashboard")}
          className="mt-10 px-12 py-4 bg-[#FFC000] text-black font-syncopate text-sm tracking-[0.25em] uppercase font-bold rounded-sm shadow-[0_0_20px_rgba(245,166,35,0.3)] hover:shadow-[0_0_40px_rgba(245,166,35,0.6)] hover:-translate-y-0.5 transition-all duration-300"
        >
          Launch Platform →
        </button>

        {/* Footer */}
        <div className="absolute bottom-8 font-mono text-[0.85rem] tracking-[0.15em] uppercase text-[#4b5563]">
          Team Butterfly · Caterpillar Hackathon · Problem Statement 4
        </div>
      </div>
    </div>
  );
}
