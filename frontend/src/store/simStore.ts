import { create } from "zustand";
import type { SimResultWithSpacing, DumpSnapshot, DumpEvent, HealthStatus, AnomalyAlert, DecisionExplanation, DumpStage, ZoneInfo, ToastAlert } from "@/types/adios";
import { UI_DEFAULTS, STOCK_PAYLOADS_T } from "@/lib/config";

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
  fleetCounts: Record<string, number>;
  setFleetCount: (model: string, count: number) => void;
  payloadOverrides: Record<string, number>;
  setPayloadOverride: (model: string, payload_t: number | null) => void;
  customTrucks: Record<string, { payload_t: number; turn_r: number; base_r: number; color: string }>;
  addCustomTruck: (name: string, spec: { payload_t: number; turn_r: number; base_r: number; color: string }) => void;
  removeCustomTruck: (name: string) => void;
  minDumpSpacing: number;
  setMinDumpSpacing: (n: number) => void;
  weights: { volume: number; distance: number; slope: number; segregation: number; spacing: number };
  useML: boolean;
  zoneMode: boolean;
  dataSource: "simulation" | "live_csv";
  setDataSource: (s: "simulation" | "live_csv") => void;
  terrainCsvId: string | null;
  terrainCsvMeta: { rows: number; cols: number; active_cells: number; height_range_m: [number, number] } | null;
  setTerrainCsv: (id: string | null, meta?: { rows: number; cols: number; active_cells: number; height_range_m: [number, number] } | null) => void;
  setMaterial: (m: string) => void;
  setNDumps: (n: number) => void;
  setIsoThreshold: (t: number) => void;
  setSeed: (s: number) => void;
  toggleFleet: (model: string) => void;
  setWeight: (key: string, val: number) => void;
  setUseML: (b: boolean) => void;
  setZoneMode: (b: boolean) => void;
  setWeights: (w: object) => void;

  // results
  result: SimResultWithSpacing | null;
  setResult: (r: SimResultWithSpacing) => void;
  lastRunPolicy: string | null;
  setLastRunPolicy: (p: string | null) => void;

  // live streaming
  liveSurface: number[][] | null;
  liveDumps: DumpSnapshot[];
  liveLog: DumpEvent[];
  volumeHistory: number[];
  liveAnomalies: AnomalyAlert[];
  liveZones: ZoneInfo[] | null;
  toasts: ToastAlert[];
  pushToast: (t: Omit<ToastAlert, "id" | "ts">) => void;
  dismissToast: (id: number) => void;

  // human override / supervisory control
  supervisorPaused: boolean;
  supervisorStepDelay: number;
  setSupervisorPaused: (b: boolean) => void;
  setSupervisorStepDelay: (n: number) => void;
  liveWhy: DecisionExplanation | null;
  liveDumpStage: DumpStage | null;
  isRunning: boolean;
  progress: number;
  setLiveSurface: (s: number[][]) => void;
  appendSnapshot: (snap: DumpSnapshot) => void;
  appendLog: (e: DumpEvent) => void;
  appendVolume: (v: number) => void;
  appendAnomaly: (a: AnomalyAlert) => void;
  setLiveZones: (z: ZoneInfo[] | null) => void;
  setLiveWhy: (w: DecisionExplanation | null) => void;
  setLiveDumpStage: (s: DumpStage | null) => void;
  setIsRunning: (b: boolean) => void;
  setProgress: (p: number) => void;
  resetLive: () => void;

  // view
  activeView: "3d" | "heatmap" | "plotly" | "compare" | "trend";
  setActiveView: (v: "3d" | "heatmap" | "plotly" | "compare" | "trend") => void;
  showStatic: boolean;
  setShowStatic: (b: boolean) => void;
}

/** Derive the canonical [model, model, ...] dispatch list from per-class counts.
 *  Preserves the original UI_DEFAULTS.fleet ordering for known classes, then
 *  appends any classes not present in the defaults (deterministic key order). */
function fleetFromCounts(counts: Record<string, number>): string[] {
  const order = [...new Set([...UI_DEFAULTS.fleet, ...Object.keys(counts)])];
  const out: string[] = [];
  for (const model of order) {
    const n = counts[model] ?? 0;
    for (let i = 0; i < n; i++) out.push(model);
  }
  return out;
}

const initialFleetCounts: Record<string, number> = UI_DEFAULTS.fleet.reduce(
  (acc, model) => ({ ...acc, [model]: (acc[model] ?? 0) + 1 }),
  {} as Record<string, number>,
);

export const useSimStore = create<SimStore>((set) => ({
  health: null,
  setHealth: (h) => set({ health: h }),

  material: "default",
  nDumps: UI_DEFAULTS.nDumps,
  isoThreshold: UI_DEFAULTS.isoThreshold,
  seed: UI_DEFAULTS.seed,
  selectedFleet: [...UI_DEFAULTS.fleet],
  fleetCounts: initialFleetCounts,
  payloadOverrides: {},
  customTrucks: {},
  minDumpSpacing: UI_DEFAULTS.minDumpSpacing,
  weights: { volume: 1.5, distance: 1.8, slope: 0.5, segregation: 0.8, spacing: 3.0 },
  useML: true,
  zoneMode: false,
  dataSource: "simulation",
  setDataSource: (s) => set({ dataSource: s }),
  terrainCsvId: null,
  terrainCsvMeta: null,
  setTerrainCsv: (id, meta) => set({ terrainCsvId: id, terrainCsvMeta: meta ?? null }),

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
  setFleetCount: (model, count) =>
    set((state) => {
      // Clamp to [0, 12] per class — keeps total fleet size sane for the
      // 100x100 grid (mirrors the orchestrator's existing dispatch-loop scale)
      const clamped = Math.max(0, Math.min(12, Math.round(count)));
      const fleetCounts = { ...state.fleetCounts, [model]: clamped };
      const nextFleet = fleetFromCounts(fleetCounts);
      // Never allow an empty fleet — fall back to one generic truck
      const selectedFleet = nextFleet.length > 0 ? nextFleet : ["generic"];
      return { fleetCounts, selectedFleet };
    }),
  setPayloadOverride: (model, payload_t) =>
    set((state) => {
      const next = { ...state.payloadOverrides };
      // null/blank clears the override — falls back to the spec default server-side
      if (payload_t == null || Number.isNaN(payload_t) || payload_t <= 0) {
        delete next[model];
      } else {
        next[model] = Math.round(Math.min(600, Math.max(10, payload_t)));
      }
      return { payloadOverrides: next };
    }),
  addCustomTruck: (name, spec) =>
    set((state) => {
      const trimmed = name.trim();
      if (!trimmed || state.customTrucks[trimmed] || (trimmed in STOCK_PAYLOADS_T)) return {};
      const customTrucks = { ...state.customTrucks, [trimmed]: spec };
      const fleetCounts = { ...state.fleetCounts, [trimmed]: state.fleetCounts[trimmed] ?? 1 };
      const selectedFleet = fleetFromCounts(fleetCounts);
      return { customTrucks, fleetCounts, selectedFleet };
    }),
  removeCustomTruck: (name) =>
    set((state) => {
      const customTrucks = { ...state.customTrucks };
      delete customTrucks[name];
      const fleetCounts = { ...state.fleetCounts };
      delete fleetCounts[name];
      const nextFleet = fleetFromCounts(fleetCounts);
      const selectedFleet = nextFleet.length > 0 ? nextFleet : ["generic"];
      return { customTrucks, fleetCounts, selectedFleet };
    }),
  setMinDumpSpacing: (n) => set({ minDumpSpacing: Math.max(0.5, Math.min(10, n)) }),
  setWeight: (key, val) =>
    set((state) => ({ weights: { ...state.weights, [key]: val } })),
  setUseML: (b) => set({ useML: b }),
  setZoneMode: (b) => set({ zoneMode: b }),
  setWeights: (w) => set((state) => ({ weights: { ...state.weights, ...w } })),

  result: null,
  setResult: (r) => set({ result: r }),
  lastRunPolicy: null,
  setLastRunPolicy: (p) => set({ lastRunPolicy: p }),

  liveSurface: null,
  liveDumps: [],
  liveLog: [],
  volumeHistory: [],
  liveAnomalies: [],
  liveZones: null,
  toasts: [],
  liveWhy: null,
  liveDumpStage: null,
  isRunning: false,
  progress: 0,

  setLiveSurface: (s) => set({ liveSurface: s }),
  appendSnapshot: (snap) =>
    set((state) => ({ liveDumps: [...state.liveDumps, snap].slice(-200) })),
  appendLog: (e) =>
    set((state) => ({ liveLog: [e, ...state.liveLog].slice(0, 60) })),
  appendVolume: (v) =>
    set((state) => ({ volumeHistory: [...state.volumeHistory, v] })),
  appendAnomaly: (a) =>
    set((state) => ({ liveAnomalies: [a, ...state.liveAnomalies].slice(0, 20) })),
  setLiveZones: (z) => set({ liveZones: z }),
  pushToast: (t) =>
    set((state) => ({
      toasts: [...state.toasts, { ...t, id: Date.now() + Math.random(), ts: Date.now() }].slice(-6),
    })),
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((x) => x.id !== id) })),

  supervisorPaused: false,
  supervisorStepDelay: 0,
  setSupervisorPaused: (b) => set({ supervisorPaused: b }),
  setSupervisorStepDelay: (n) => set({ supervisorStepDelay: Math.max(0, Math.min(5, n)) }),
  setLiveWhy: (w) => set({ liveWhy: w }),
  setLiveDumpStage: (s) => set({ liveDumpStage: s }),
  setIsRunning: (b) => set({ isRunning: b }),
  setProgress: (p) => set({ progress: p }),
  resetLive: () =>
    set({ liveSurface: null, liveDumps: [], liveLog: [], volumeHistory: [], liveAnomalies: [], liveZones: null, liveWhy: null, liveDumpStage: null, progress: 0 }),

  activeView: "3d",
  setActiveView: (v) => set({ activeView: v }),
  showStatic: false,
  setShowStatic: (b) => set({ showStatic: b }),
}));
