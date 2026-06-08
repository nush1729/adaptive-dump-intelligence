// Core ADIOS type definitions

export interface SimConfig {
  rows?: number;
  cols?: number;
  material: "default" | "rock" | "ore" | "overburden";
  n_dumps: number;
  fleet_models: string[];
  payload_overrides?: Record<string, number> | null;
  custom_truck_specs?: Record<string, FleetSpec> | null;
  weights?: ScoreWeights;
  iso_threshold: number;
  auto_tune?: boolean;
  seed: number;
  use_ml?: boolean;
  zone_mode?: boolean;
}

export interface ScoreWeights {
  volume: number;
  distance: number;
  slope: number;
  segregation: number;
  spacing: number;
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
  anomaly_count?: number;
}

export interface StaticSummary {
  volume: number;
  coverage_pct: number;
  packing_efficiency: number;
  height_uniformity?: number;
  rejection_rate?: number;
  mean_spacing_m?: number;
  policy?: string;
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
  gps_fix?: [number, number] | null;
  dump_stage?: DumpStage;
  why?: DecisionExplanation;
}

export interface DumpStage {
  site_dump_count: number;
  cell_pre_height_m: number;
  compaction_applied: boolean;
}

export interface SimResult {
  summary: DumpSummary;
  static_summary: StaticSummary;
  staffed_summary?: StaticSummary;
  weights_used: ScoreWeights;
  surface: number[][];
  static_surface: number[][];
  staffed_surface?: number[][];
  slope_map: number[][];
  score_map: (number | null)[][] | null;
  mask: boolean[][];
  entry: [number, number];
  snapshots: DumpSnapshot[];
  log: DumpEvent[];
  zone_mode?: boolean;
  zone_layout?: ZoneLayout;
  anomalies?: AnomalyReport;
}

export interface ZoneInfo {
  profile: string;
  truck_class: string;
  cell_count: number;
  mask: number[][];
}

export interface ZoneLayout {
  zones: ZoneInfo[];
}

export interface WeightDelta {
  weight: string;
  base: number;
  modulated: number;
  pct_change: number;
}

export interface DecisionExplanation {
  deltas: WeightDelta[];
  triggers: string[];
}

export interface AnomalyAlert {
  tick: number;
  metric: string;
  value: number;
  zscore: number;
  message: string;
}

export interface ToastAlert {
  id: number;
  ts: number;
  level: "info" | "warn" | "error";
  title: string;
  detail?: string;
}

export interface AnomalyReport {
  alerts: AnomalyAlert[];
  alert_count: number;
}

export interface WsMessage {
  type: "dump" | "rejected" | "skip" | "done" | "error" | "zone_layout" | "anomaly" | "deadlock" | "control_ack";
  trucks?: string[];
  action?: "pause" | "resume" | "set_speed";
  step_delay_s?: number;
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
  truck_profile?: string;
  zone_mode?: boolean;
  zones?: ZoneInfo[];
  gps_fix?: [number, number] | null;
  dump_stage?: DumpStage;
  why?: DecisionExplanation;
  // anomaly alert fields (present when type === "anomaly")
  tick?: number;
  metric?: string;
  value?: number;
  zscore?: number;
  message?: string;
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
  is_custom?: boolean;
}

export interface IoTFeatures {
  fleet_congestion: number;
  haul_latency_norm: number;
  utilization: number;
  zone_density: number;
  weather_visibility: number;
  equipment_health: number;
  ground_bearing_capacity: number;
  queue_length_norm: number;
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
