"use client";
import React, { useEffect, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const LandingHeroScene = dynamic(() => import("@/components/landing/LandingHeroScene"), { ssr: false });

export default function LandingPage() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);
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
      <div className={`absolute inset-0 flex flex-col items-center justify-center p-6 transition-all duration-1000 cubic-bezier(0.16, 1, 0.3, 1) ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        
        {/* Logo */}
        <div className="text-center">
          <h1 className="font-syncopate text-[clamp(3rem,8vw,7rem)] font-bold tracking-[0.25em] leading-none text-black dark:text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
            ADI<span className="text-[#FFC000] drop-shadow-[0_0_30px_rgba(245,166,35,0.4)]">O</span>S
          </h1>
          <p className="font-mono text-sm tracking-[0.35em] uppercase text-gray-600 dark:text-[#9ca3af] mt-4">
            Adaptive Dump Intelligence & Orchestration System
          </p>
        </div>

        {/* Tagline */}
        <div className="max-w-2xl text-center mt-6">
          <p className="font-light text-lg text-gray-800 dark:text-[#d1d5db] leading-relaxed">
            Real-time adaptive dump packing powered by deep reinforcement learning. 
            Every truck dispatch is evaluated against the live terrain state.
          </p>
        </div>

        {/* Stats */}
        <div className="flex gap-12 mt-10">
          {[
            ["7.38m → 3.03m", "Spacing Target"],
            ["< 2s", "Decision Latency"],
            ["100K+ Steps", "PPO Training"],
          ].map(([val, label]) => (
            <div key={label} className="text-center">
              <div className="font-mono text-xl text-[#FFC000] font-semibold">{val}</div>
              <div className="font-mono text-[0.85rem] tracking-[0.1em] uppercase text-[#6b7280] mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* CTA Button */}
        <button
          onClick={() => router.push("/dashboard")}
          className="mt-12 px-12 py-4 bg-[#FFC000] text-black font-syncopate text-sm tracking-[0.25em] uppercase font-bold rounded-sm shadow-[0_0_20px_rgba(245,166,35,0.3)] hover:shadow-[0_0_40px_rgba(245,166,35,0.6)] hover:-translate-y-0.5 transition-all duration-300"
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
