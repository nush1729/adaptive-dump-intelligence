"""
Synthetic data generator for ADIOS training and evaluation.

Generates:
  - Random polygon terrains (varying shape, material, entry point)
  - Mixed-fleet dispatch sequences with realistic payload distributions
    and truck-type profiles (Cat793, Cat777, Cat797)
  - Pre-computed expert trajectories with enriched Dict observations
    (terrain_map + context_vector including truck/material/IoT features)
  - Benchmark suite: 20 held-out polygons for evaluation
"""
import numpy as np
import json
from pathlib import Path
import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from environment.terrain import Terrain
from planning.scorer import ScoringEngine, DEFAULT_WEIGHTS
from planning.isolation_validator import IsolationValidator
from planning.action_masker import ConstrainedActionMasker
from config import (
    SITE_CONFIG, TRUCK_PROFILES, IOT_FEATURE_DIM,
    CONTEXT_DIM, IOT_CONFIG,
)


MATERIALS = ["rock", "ore", "overburden", "default"]
FLEET_PAYLOADS = list(SITE_CONFIG.generic_payloads_t)

# Default truck profile rotation matching SITE_CONFIG.default_fleet
_DEFAULT_TRUCK_SEQUENCE = list(SITE_CONFIG.default_fleet)


def make_random_terrain(seed: int, rows: int = 100, cols: int = 100) -> Terrain:
    rng = np.random.default_rng(seed)
    material = MATERIALS[int(rng.integers(0, len(MATERIALS)))]
    return Terrain.make_demo_polygon(rows, cols, material, seed)


def make_mixed_fleet_sequence(n_dumps: int, seed: int = 0) -> list:
    """
    Generate a realistic truck dispatch sequence with typed truck profiles.

    Returns a list of dicts:
      truck_id, truck_profile, payload_t, arrival_tick
    """
    rng = np.random.default_rng(seed)
    profile_names = list(TRUCK_PROFILES.keys())
    n_trucks = int(rng.integers(3, 7))
    # assign a profile to each truck slot
    profiles = [profile_names[i % len(profile_names)] for i in range(n_trucks)]
    sequence = []
    for i in range(n_dumps):
        truck_idx = i % n_trucks
        profile = profiles[truck_idx]
        max_p = TRUCK_PROFILES[profile].max_payload_t
        # bimodal: 60% near max, 40% at half-load
        if rng.random() < 0.6:
            base_p = max_p * rng.uniform(0.85, 1.0)
        else:
            base_p = max_p * rng.uniform(0.4, 0.6)
        # ±3% payload noise (load-cell uncertainty)
        p = float(base_p) * float(rng.uniform(0.97, 1.03))
        sequence.append({
            "truck_id": f"T{truck_idx+1}",
            "truck_profile": profile,
            "payload_t": round(p, 1),
            "arrival_tick": i * int(rng.integers(2, 6)),
        })
    return sequence


def _build_synthetic_iot(dump_idx: int, n_dumps: int, rng: np.random.Generator) -> np.ndarray:
    """Synthetic IoT feature vector for training — varies with episode progress."""
    progress = dump_idx / max(n_dumps, 1)
    iot = np.array([
        min(progress * 1.5, 1.0),      # fleet_congestion
        float(rng.uniform(0.0, 0.6)),  # haul_latency (domain-randomised)
        progress,                       # utilisation
        min(progress * 1.2, 1.0),      # active_zone_density
    ], dtype=np.float32)
    assert iot.shape == (IOT_FEATURE_DIM,)
    return iot


def generate_expert_trajectory(terrain: Terrain, n_dumps: int = 60) -> list:
    """
    Run the heuristic ScoringEngine and record (obs_dict, action) pairs.

    obs_dict contains:
      terrain_map    : (3, 100, 100) float32
      context_vector : (CONTEXT_DIM,) float32 — truck + material + IoT features

    Used for behavioural cloning / supervised pre-training.
    """
    from ml.environment import COLS, build_context_vector
    from scipy.ndimage import distance_transform_edt

    entry = terrain.entry
    eng = ScoringEngine(terrain, entry, dict(DEFAULT_WEIGHTS))
    val = IsolationValidator(terrain, entry, SITE_CONFIG.iso_threshold, SITE_CONFIG.min_dump_spacing_cells)
    rng = np.random.default_rng(hash(terrain.material) % (2**31))
    trajectory = []

    # truck profile rotation for context diversity
    profile_names = list(TRUCK_PROFILES.keys())
    per_profile_dumps = {name: 0 for name in profile_names}

    def _terrain_map(t: Terrain) -> np.ndarray:
        from scipy.ndimage import gaussian_filter
        h_norm = np.clip(t.height / SITE_CONFIG.max_height_m, 0.0, 1.0).astype(np.float32)
        mask   = t.mask.astype(np.float32)
        dist   = distance_transform_edt(t.mask).astype(np.float32)
        dist_norm = dist / (dist.max() or 1.0)
        # Channel 3: pile detection (semantic segmentation)
        pile_mask = (t.height > SITE_CONFIG.pile_detection_threshold_m).astype(np.float32)
        # Channel 4: spacing density (local packing density)
        density = gaussian_filter(pile_mask * mask, sigma=SITE_CONFIG.staffed_spacing_cells)
        max_d = density.max()
        density = (density / max_d) if max_d > 0 else density
        return np.stack([h_norm, mask, dist_norm, pile_mask, density.astype(np.float32)], axis=0)

    for i in range(n_dumps):
        profile_name = profile_names[i % len(profile_names)]
        payload_t = FLEET_PAYLOADS[i % len(FLEET_PAYLOADS)]

        action_mask = ConstrainedActionMasker(terrain, val).mask(payload_t, include_iso=True)
        r, c, _ = eng.score_all(action_mask=action_mask)
        if r is None:
            break
        safe, _ = val.validate(r, c, payload_t)
        if not safe:
            continue

        terrain_map = _terrain_map(terrain)
        iot = _build_synthetic_iot(i, n_dumps, rng)
        context = build_context_vector(
            profile_name, payload_t,
            per_profile_dumps[profile_name],
            terrain.material, iot,
        )
        obs = {"terrain_map": terrain_map, "context_vector": context}
        action = r * COLS + c
        trajectory.append({"obs": obs, "action": action})

        terrain.apply_dump(r, c, payload_t)
        val.record_dump(r, c)
        per_profile_dumps[profile_name] += 1

    return trajectory


def build_benchmark_suite(n_polygons: int = 20, out_dir: str = "data/benchmark") -> str:
    """
    Build a held-out benchmark suite.  Seeds 8000–8019 are reserved for
    benchmarking and never used in training.
    """
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    results = []
    for i in range(n_polygons):
        seed = 8000 + i
        terrain_h = make_random_terrain(seed)

        eng = ScoringEngine(terrain_h, terrain_h.entry, dict(DEFAULT_WEIGHTS))
        val = IsolationValidator(terrain_h, terrain_h.entry, SITE_CONFIG.iso_threshold, SITE_CONFIG.min_dump_spacing_cells)
        h_dumps = 0
        for j in range(SITE_CONFIG.benchmark_dumps):
            payload_t = FLEET_PAYLOADS[j % len(FLEET_PAYLOADS)]
            action_mask = ConstrainedActionMasker(terrain_h, val).mask(payload_t, include_iso=True)
            r, c, _ = eng.score_all(action_mask=action_mask)
            if r is None:
                break
            safe, _ = val.validate(r, c, payload_t)
            if safe:
                ok, _ = terrain_h.apply_dump(r, c, payload_t)
                if ok:
                    h_dumps += 1
                    val.record_dump(r, c)

        results.append({
            "seed": seed,
            "material": terrain_h.material,
            "heuristic": {
                "dumps": int(h_dumps),
                "volume": float(terrain_h.total_volume()),
                "coverage_pct": float(round(terrain_h.coverage_fraction() * 100, 2)),
                "efficiency": float(round(terrain_h.packing_efficiency() * 100, 2)),
                "uniformity": float(round(
                    1 - terrain_h.height_std() / max(terrain_h.mean_height(), 0.01), 3
                )),
            },
        })

    out_path = os.path.join(out_dir, "benchmark_baseline.json")
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Benchmark suite written → {out_path}")
    return out_path


if __name__ == "__main__":
    print("Generating benchmark suite (20 polygons)...")
    build_benchmark_suite()
    print("Done.")
