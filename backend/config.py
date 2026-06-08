"""Shared operational configuration for ADIOS.

All simulation, validation, ML, and benchmark code should read physical and
evaluation constants from this module instead of embedding local literals.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Dict, Tuple


@dataclass(frozen=True)
class MaterialConfig:
    name: str
    density_t_per_m3: float
    angle_of_repose_deg: float
    feasible_lift_m: float


@dataclass(frozen=True)
class SiteConfig:
    rows: int = 100
    cols: int = 100
    cell_area_m2: float = 1.0
    # Param 7: raised from 15.0 → 18.0 to allow more vertical fill before rejection
    max_height_m: float = 18.0
    # Param 1: lowered from 3.0 → 2.0 to approach staffed 3.03m spacing
    min_dump_spacing_cells: float = 2.0
    # Param 15: obs pile density Gaussian sigma — lowered from 3.5 → 2.0 for finer map
    target_spacing_cells: float = 2.5
    staffed_spacing_cells: float = 2.0          # obs builder Gaussian sigma (param 15)
    autonomous_spacing_cells: float = 7.38      # autonomous baseline spacing in grid cells
    staffed_spacing_m: float = 3.03             # staffed operation mean spacing (metres)
    autonomous_spacing_m: float = 7.38          # autonomous baseline mean spacing (metres)
    # Param 14: SLAM pile detection threshold — lowered 0.3 → 0.2 for earlier pile sensing
    pile_detection_threshold_m: float = 0.2
    # Param 2: raised from 0.85 → 0.88 to prevent isolated sections while keeping throughput
    iso_threshold: float = 0.88
    # Param 3: dump radius lowered 8 → 6 for tighter pile footprint
    dump_radius_cells: int = 6
    # Param 3 cont: sigma ratio lowered 0.45 → 0.35 (tighter pile, higher density)
    dump_sigma_ratio: float = 0.35
    payload_reference_t: float = 200.0
    dump_height_gain_m: float = 0.6
    # Param 6 (superseded): passability ceiling percentile — used in isolation_validator (93rd).
    # Kept only as a fallback; the percentile pins to its `max(..., 1.0)` floor while the
    # terrain is still mostly flat (early-sim), so a single near-entry pile taller than 1.0m
    # could be misread as "impassable" and collapse BFS reachability to ~0 (cascading
    # iso_rejected(0.00) false positives). _pass_thresh() now derives the ceiling from
    # mean_height + truck_clearance_m instead, which tracks fill progress correctly.
    passability_percentile: float = 93.0
    # Vehicle clearance — max pile height a loaded haul truck can safely drive over,
    # added on top of the terrain's current mean height to form the BFS passability
    # ceiling (mirrors how a real operator judges "can I still get through there?").
    truck_clearance_m: float = 2.5
    compaction_floor: float = 0.85
    compaction_gain: float = 0.15
    benchmark_seed_start: int = 8000
    benchmark_polygons: int = 20
    benchmark_dumps: int = 60
    default_seed: int = 42
    default_fleet: Tuple[str, ...] = ("Cat793", "Cat777", "Cat797", "Cat793")
    # Param 8: raise scheduler retries 25 → 40 (fewer deadlocks on dense packs)
    scheduler_max_delay_steps: int = 40
    iso_mask_cell_limit: int = 600
    # Hard cap on how many candidate cells _apply_iso actually simulates per
    # mask() call — each costs a full apply_dump_to_height + grid-wide BFS
    # (~10-15ms). Sampling keeps mask() cost flat regardless of how many
    # candidates remain (was: up to 600 cells -> ~8s/call once the pool sat
    # just under iso_mask_cell_limit, compounding across retry attempts).
    iso_mask_sample_size: int = 30
    training_payload_t: float = 100.0
    generic_payloads_t: Tuple[float, ...] = (50.0, 100.0, 200.0, 240.0, 400.0)
    # Param 11: IoT haul latency rolling window — raised 10 → 20 ticks
    iot_haul_latency_window: int = 20


SITE_CONFIG = SiteConfig()


# ── Truck profiles ────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class TruckProfile:
    name: str
    max_payload_t: float
    turning_radius_m: float
    axle_load_t: float
    type_index: int  # position in one-hot encoding


TRUCK_PROFILES: Dict[str, TruckProfile] = {
    "Cat793": TruckProfile("Cat793", max_payload_t=240.0, turning_radius_m=15.0, axle_load_t=80.0, type_index=0),
    "Cat777": TruckProfile("Cat777", max_payload_t=100.0, turning_radius_m=11.0, axle_load_t=42.0, type_index=1),
    "Cat797": TruckProfile("Cat797", max_payload_t=400.0, turning_radius_m=18.0, axle_load_t=120.0, type_index=2),
    "generic": TruckProfile("generic", max_payload_t=200.0, turning_radius_m=12.0, axle_load_t=60.0, type_index=3),
}

N_TRUCK_TYPES: int = 4  # must match len(TRUCK_PROFILES)
MAX_PAYLOAD_T: float = 500.0  # normalization ceiling


# ── IoT / CTDE observation dimensions ────────────────────────────────────────

# [fleet_congestion, haul_latency_norm, utilization, zone_density,
#  weather_visibility, equipment_health, ground_bearing_capacity, queue_length_norm]
IOT_FEATURE_DIM: int = 8
TRUCK_FEATURE_DIM: int = 9  # [type_onehot(4), payload_norm, dump_count_norm, density_norm, compaction_norm, angle_norm]
CONTEXT_DIM: int = TRUCK_FEATURE_DIM + IOT_FEATURE_DIM  # 17 total


@dataclass(frozen=True)
class IoTConfig:
    gps_noise_m: float = 0.5          # Gaussian GPS error in metres
    payload_noise_pct: float = 0.03   # 3% payload scale error (realistic load-cell noise)
    height_noise_m: float = 0.05      # 5 cm terrain SLAM error
    latency_norm_s: float = 300.0     # 5-minute normalization window for haul latency

    # ── Phase 2 synthetic sensor channels ────────────────────────────────────
    # Weather visibility (0-1, 1 = clear). Drifts slowly via an OU-style random
    # walk to simulate changing site conditions (dust, fog, rain).
    weather_visibility_base: float = 0.85
    weather_visibility_drift: float = 0.03
    weather_visibility_min: float = 0.2

    # Per-truck equipment health (0-1, 1 = perfect). Degrades gradually with
    # dump count and recovers slightly on idle ticks (maintenance windows).
    equipment_health_init: float = 1.0
    equipment_health_wear_per_dump: float = 0.004
    equipment_health_recovery: float = 0.0015
    equipment_health_noise: float = 0.01

    # Ground bearing capacity (0-1, 1 = firm). Derived from local terrain
    # height/slope — softer / steeper ground near tall piles bears less load.
    ground_bearing_base: float = 0.9
    ground_bearing_height_penalty: float = 0.03   # per metre of local pile height
    ground_bearing_noise: float = 0.02

    # Truck queue length at the active dump entry (integer trucks waiting),
    # normalised by queue_norm_cap for the feature vector.
    queue_norm_cap: float = 6.0


IOT_CONFIG = IoTConfig()

MATERIALS: Dict[str, MaterialConfig] = {
    "default": MaterialConfig("Default", density_t_per_m3=1.8, angle_of_repose_deg=38.0, feasible_lift_m=6.0),
    "rock": MaterialConfig("Rock", density_t_per_m3=1.9, angle_of_repose_deg=40.0, feasible_lift_m=6.5),
    "ore": MaterialConfig("Ore", density_t_per_m3=2.5, angle_of_repose_deg=37.0, feasible_lift_m=5.5),
    "overburden": MaterialConfig("Overburden", density_t_per_m3=1.6, angle_of_repose_deg=35.0, feasible_lift_m=6.0),
    "coal": MaterialConfig("Coal", density_t_per_m3=1.3, angle_of_repose_deg=34.0, feasible_lift_m=5.0),
    "waste": MaterialConfig("Waste", density_t_per_m3=1.6, angle_of_repose_deg=35.0, feasible_lift_m=6.0),
}

# Params 4, 5, 13: raised spacing (2x), volume (1.5x), coverage (1.8x) weights
# to penalise gaps more aggressively and prefer unfilled polygon sections
DEFAULT_SCORE_WEIGHTS = {
    "volume": 1.5,
    "distance": 1.8,
    "slope": 0.5,
    "segregation": 0.8,
    "spacing": 3.0,
}


def material_config(material: str) -> MaterialConfig:
    return MATERIALS.get(material, MATERIALS["default"])


def payload_tonnes_to_volume_m3(payload_t: float, material: str) -> float:
    density = material_config(material).density_t_per_m3
    return float(payload_t) / max(density, 1e-9)


def config_payload() -> dict:
    return {
        "site": asdict(SITE_CONFIG),
        "materials": {name: asdict(cfg) for name, cfg in MATERIALS.items()},
        "score_weights": dict(DEFAULT_SCORE_WEIGHTS),
    }
