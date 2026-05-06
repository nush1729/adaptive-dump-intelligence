"use client";
import React from "react";
import { useSimStore } from "@/store/simStore";

const FLEET_COLORS: Record<string, string> = {
  Cat777: "#FFD700",
  Cat793: "#FF8C00",
  Cat797: "#FF4500",
  Generic50: "#00CED1",
  Generic200: "#9400D3",
};

const FLEET_LABELS: Record<string, string> = {
  Cat777: "Cat 777 · 100t",
  Cat793: "Cat 793 · 240t",
  Cat797: "Cat 797 · 400t",
  Generic50: "Generic · 50t",
  Generic200: "Generic · 200t",
};

interface ControlPanelProps {
  onRun: () => void;
  onTune: () => void;
  isTuning: boolean;
}

// FIX: Extracted RangeField so label + value sit on ONE line, value never hidden behind label
function RangeField({
  id, label, min, max, step = 0.01, value, onChange, decimals = 2,
}: {
  id: string; label: string; min: number; max: number;
  step?: number; value: number; onChange: (v: number) => void; decimals?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <label htmlFor={id} className="font-mono text-[0.7rem] tracking-widest uppercase text-gray-600 dark:text-gray-400">
          {label}
        </label>
        <span className="font-mono text-[0.85rem] font-bold text-[#FFC000] min-w-[40px] text-right bg-gray-100 dark:bg-[#1a1c23] px-2 py-0.5 rounded border border-gray-200 dark:border-[#2a2d35]">
          {value.toFixed(decimals)}
        </span>
      </div>
      <input
        type="range" id={id} min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full cursor-pointer accent-[#FFC000] mt-1"
      />
    </div>
  );
}

export default function ControlPanel({ onRun, onTune, isTuning }: ControlPanelProps) {
  const {
    material, nDumps, isoThreshold, seed, selectedFleet, weights,
    useML, isRunning,
    setMaterial, setNDumps, setIsoThreshold, setSeed, toggleFleet,
    setWeight, setUseML,
  } = useSimStore();

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111317] text-gray-700 dark:text-gray-300">
      
      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 flex flex-col gap-4 scrollbar-thin scrollbar-thumb-[#2a2d35]">
        
        {/* Simulation Section */}
        <div>
          <div className="text-[0.85rem] tracking-[0.25em] text-gray-500 dark:text-gray-500 uppercase border-b border-gray-200 dark:border-[#2a2d35] pb-1 mb-3 font-syncopate">
            Simulation
          </div>
          
          <div className="flex flex-col gap-1 mb-3">
            <label className="font-mono text-[0.7rem] tracking-widest uppercase text-gray-600 dark:text-gray-400">Material</label>
            <select
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              className="bg-gray-100 dark:bg-[#1a1c23] border border-gray-200 dark:border-[#2a2d35] text-gray-200 p-1.5 rounded text-sm font-mono w-full focus:outline-none focus:border-[#FFC000]"
            >
              <option value="default">Default</option>
              <option value="rock">Rock (40°)</option>
              <option value="ore">Ore (37°)</option>
              <option value="overburden">Overburden (35°)</option>
            </select>
          </div>

          <RangeField id="n_dumps" label="Dump Count" min={10} max={120} step={1} value={nDumps} onChange={setNDumps} decimals={0} />
          <RangeField id="iso" label="Iso Threshold" min={0.5} max={0.99} value={isoThreshold} onChange={setIsoThreshold} />

          <div className="flex flex-col gap-1 mt-3">
            <label className="font-mono text-[0.7rem] tracking-widest uppercase text-gray-600 dark:text-gray-400">Polygon Seed</label>
            <input
              type="number" value={seed} min={1} max={9999}
              onChange={(e) => setSeed(parseInt(e.target.value) || 42)}
              className="bg-gray-100 dark:bg-[#1a1c23] border border-gray-200 dark:border-[#2a2d35] text-gray-200 p-1.5 rounded text-sm font-mono w-full focus:outline-none focus:border-[#FFC000]"
            />
          </div>

          {/* ML Toggle */}
          <div className="flex items-center justify-between mt-4">
            <span className="font-mono text-[0.7rem] tracking-widest uppercase text-gray-600 dark:text-gray-400">PPO Policy (ML)</span>
            <button
              onClick={() => setUseML(!useML)}
              className={`px-3 py-1 rounded text-[0.85rem] font-mono transition-all border ${
                useML ? "bg-[#FFC000]/10 border-[#FFC000] text-[#FFC000]" : "bg-gray-100 dark:bg-[#1a1c23] border-gray-200 dark:border-[#2a2d35] text-gray-600 dark:text-gray-400"
              }`}
            >
              {useML ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        {/* Fleet Section */}
        <div>
          <div className="text-[0.85rem] tracking-[0.25em] text-gray-500 dark:text-gray-500 uppercase border-b border-gray-200 dark:border-[#2a2d35] pb-1 mb-3 font-syncopate">
            Fleet
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.keys(FLEET_COLORS).map((model) => {
              const active = selectedFleet.includes(model);
              return (
                <button key={model} onClick={() => toggleFleet(model)}
                  className={`px-2.5 py-1 rounded text-[0.7rem] font-mono transition-all border ${
                    active ? "border-[#FFC000] text-[#FFC000] bg-[#FFC000]/10" : "border-gray-200 dark:border-[#2a2d35] text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-[#1a1c23]"
                  }`}
                >
                  {FLEET_LABELS[model]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Weights Section */}
        <div>
          <div className="text-[0.85rem] tracking-[0.25em] text-gray-500 dark:text-gray-500 uppercase border-b border-gray-200 dark:border-[#2a2d35] pb-1 mb-3 font-syncopate">
            Scoring Weights
          </div>
          <div className="flex flex-col gap-3">
            <RangeField id="w1" label="w1 · Fill" min={0.5} max={3} value={weights.w1} onChange={(v) => setWeight("w1", v)} />
            <RangeField id="w2" label="w2 · Congestion" min={0.1} max={2} value={weights.w2} onChange={(v) => setWeight("w2", v)} />
            <RangeField id="w3" label="w3 · Isolation" min={1} max={5} step={0.1} value={weights.w3} onChange={(v) => setWeight("w3", v)} />
            <RangeField id="w4" label="w4 · Distance" min={0.05} max={0.5} value={weights.w4} onChange={(v) => setWeight("w4", v)} />
          </div>
          
          <button
            onClick={onTune}
            disabled={isTuning || isRunning}
            className="w-full mt-4 py-2 border border-[#FF5722] text-[#FF5722] text-[0.85rem] font-syncopate tracking-[0.15em] uppercase hover:bg-[#FF5722]/10 transition-all rounded"
          >
            {isTuning ? "Tuning…" : "⚙ Auto-Tune"}
          </button>
        </div>
      </div>

      {/* Pinned Footer Execute Button */}
      <div className="shrink-0 p-4 border-t border-gray-200 dark:border-[#2a2d35] bg-gray-50 dark:bg-[#0a0c0f]">
        <button
          onClick={onRun}
          disabled={isRunning}
          className="w-full py-3 bg-[#FFC000] text-black text-[0.85rem] font-syncopate tracking-[0.2em] uppercase font-bold hover:shadow-[0_0_15px_rgba(245,166,35,0.5)] transition-all rounded disabled:bg-gray-600 disabled:text-gray-600 dark:text-gray-400 disabled:shadow-none"
        >
          {isRunning ? "RUNNING…" : "▶ EXECUTE"}
        </button>
      </div>

    </div>
  );
}