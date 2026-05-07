import { create } from "zustand";
import type { SimResult, DumpSnapshot, DumpEvent, DumpSummary, HealthStatus } from "@/types/adios";

interface SimStore {
  // server state
  health: HealthStatus | null;
  setHealth: (h: HealthStatus) => void;

  // simulation config
  material: string;
  nDumps: number;
  isoThreshold: number;
  seed: number;
  selectedFleet: string[];
  weights: { w1: number; w2: number; w3: number; w4: number };
  useML: boolean;
  setMaterial: (m: string) => void;
  setNDumps: (n: number) => void;
  setIsoThreshold: (t: number) => void;
  setSeed: (s: number) => void;
  toggleFleet: (model: string) => void;
  setWeight: (key: string, val: number) => void;
  setUseML: (b: boolean) => void;
  setWeights: (w: object) => void;

  // results
  result: SimResult | null;
  setResult: (r: SimResult) => void;
  lastRunPolicy: "heuristic" | "ml_ppo" | null;
  setLastRunPolicy: (p: "heuristic" | "ml_ppo" | null) => void;

  // live streaming
  liveSurface: number[][] | null;
  liveDumps: DumpSnapshot[];
  liveLog: DumpEvent[];
  volumeHistory: number[];
  isRunning: boolean;
  progress: number;
  setLiveSurface: (s: number[][]) => void;
  appendSnapshot: (snap: DumpSnapshot) => void;
  appendLog: (e: DumpEvent) => void;
  appendVolume: (v: number) => void;
  setIsRunning: (b: boolean) => void;
  setProgress: (p: number) => void;
  resetLive: () => void;

  // view
  activeView: "3d" | "heatmap" | "plotly" | "compare";
  setActiveView: (v: "3d" | "heatmap" | "plotly" | "compare") => void;
  showStatic: boolean;
  setShowStatic: (b: boolean) => void;
}

export const useSimStore = create<SimStore>((set) => ({
  health: null,
  setHealth: (h) => set({ health: h }),

  material: "default",
  nDumps: 60,
  isoThreshold: 0.85,
  seed: 42,
  selectedFleet: ["Cat793", "Cat777", "Cat797"],
  weights: { w1: 1.2, w2: 0.5, w3: 3.0, w4: 0.15 },
  useML: false,

  setMaterial: (m) => set({ material: m }),
  setNDumps: (n) => set({ nDumps: n }),
  setIsoThreshold: (t) => set({ isoThreshold: t }),
  setSeed: (s) => set({ seed: s }),
  toggleFleet: (model) =>
    set((state) => ({
      selectedFleet: state.selectedFleet.includes(model)
        ? state.selectedFleet.length > 1
          ? state.selectedFleet.filter((m) => m !== model)
          : state.selectedFleet
        : [...state.selectedFleet, model],
    })),
  setWeight: (key, val) =>
    set((state) => ({ weights: { ...state.weights, [key]: val } })),
  setUseML: (b) => set({ useML: b }),
  setWeights: (w) => set((state) => ({ weights: { ...state.weights, ...w } })),

  result: null,
  setResult: (r) => set({ result: r }),
  lastRunPolicy: null,
  setLastRunPolicy: (p) => set({ lastRunPolicy: p }),

  liveSurface: null,
  liveDumps: [],
  liveLog: [],
  volumeHistory: [],
  isRunning: false,
  progress: 0,

  setLiveSurface: (s) => set({ liveSurface: s }),
  appendSnapshot: (snap) =>
    set((state) => ({ liveDumps: [...state.liveDumps, snap] })),
  appendLog: (e) =>
    set((state) => ({ liveLog: [e, ...state.liveLog].slice(0, 60) })),
  appendVolume: (v) =>
    set((state) => ({ volumeHistory: [...state.volumeHistory, v] })),
  setIsRunning: (b) => set({ isRunning: b }),
  setProgress: (p) => set({ progress: p }),
  resetLive: () =>
    set({ liveSurface: null, liveDumps: [], liveLog: [], volumeHistory: [], progress: 0 }),

  activeView: "3d",
  setActiveView: (v) => set({ activeView: v }),
  showStatic: false,
  setShowStatic: (b) => set({ showStatic: b }),
}));
