// Core ADIOS type definitions

export interface SimConfig {
  rows?: number;
  cols?: number;
  material: "default" | "rock" | "ore" | "overburden";
  n_dumps: number;
  fleet_models: string[];
  weights?: ScoreWeights;
  iso_threshold: number;
  auto_tune?: boolean;
  seed: number;
  use_ml?: boolean;
}

export interface ScoreWeights {
  w1: number;
  w2: number;
  w3: number;
  w4: number;
}

export interface DumpSummary {
  total_dispatched: number;
  successful_dumps: number;
  rejected: number;
  total_volume: number;
  coverage_pct: number;
  packing_efficiency: number;
  mean_height: number;
  height_uniformity: number;
  isolation_events: number;
  latency_ms: number;
  policy: string;
}

export interface StaticSummary {
  volume: number;
  coverage_pct: number;
  packing_efficiency: number;
}

export interface DumpSnapshot {
  dump_n: number;
  truck: string;
  r: number;
  c: number;
  volume: number;
  coverage: number;
  efficiency: number;
  policy?: string;
  surface?: number[][];
}

export interface DumpEvent {
  t: number;
  truck: string;
  r: number | null;
  c: number | null;
  status: string;
  payload_t: number;
  reach?: number | null;
  score?: number | null;
  volume: number;
  coverage: number;
}

export interface SimResult {
  summary: DumpSummary;
  static_summary: StaticSummary;
  weights_used: ScoreWeights;
  surface: number[][];
  static_surface: number[][];
  slope_map: number[][];
  score_map: (number | null)[][] | null;
  mask: boolean[][];
  entry: [number, number];
  snapshots: DumpSnapshot[];
  log: DumpEvent[];
}

export interface WsMessage {
  type: "dump" | "rejected" | "skip" | "done" | "error";
  dump?: number;
  truck?: string;
  r?: number;
  c?: number;
  payload_t?: number;
  volume?: number;
  coverage?: number;
  efficiency?: number;
  full_surface?: number[][];
  summary?: DumpSummary;
  reach?: number;
  msg?: string;
  policy?: string;
}

export interface FleetSpec {
  payload_t: number;
  turn_r: number;
  base_r: number;
  color: string;
}

export interface HealthStatus {
  status: string;
  version: string;
  ml_available: boolean;
  policy_type: string;
}

export interface SpacingAnalysis {
  mean_spacing_m: number | null;
  min_spacing_m?: number | null;
  max_spacing_m?: number | null;
  staffed_target_m: number;
  autonomous_baseline_m: number;
  density_improvement_pct: number;
  nn_distances?: number[];
}

export interface TruckInfo {
  id: string;
  profile: string;
  max_payload_t: number;
  turning_radius_m: number;
  axle_load_t: number;
  min_corridor_width_m: number;
}

export interface IoTFeatures {
  fleet_congestion: number;
  haul_latency_norm: number;
  utilization: number;
  zone_density: number;
}

export interface FleetIntelligence {
  trucks: TruckInfo[];
  iot_features: IoTFeatures;
  fleet_metrics: Record<string, number>;
  ctde_mode: string;
  policy_type: string;
}

export interface SimResultWithSpacing extends SimResult {
  spacing_analysis?: SpacingAnalysis;
}
