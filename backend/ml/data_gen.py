"""
Synthetic data generator for ADIOS training and evaluation.

Generates:
  - Random polygon terrains (varying shape, material, entry point)
  - Mixed-fleet dispatch sequences with realistic payload distributions
  - Pre-computed expert trajectories from heuristic scorer (for supervised pre-training)
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


MATERIALS = ["rock", "ore", "overburden", "default"]
FLEET_PAYLOADS = [50.0, 100.0, 200.0, 240.0, 400.0]  # tonnes


def make_random_terrain(seed: int, rows: int = 100, cols: int = 100) -> Terrain:
    """Create a random terrain with varied material and organic polygon."""
    rng = np.random.default_rng(seed)
    material = MATERIALS[int(rng.integers(0, len(MATERIALS)))]
    return Terrain.make_demo_polygon(rows, cols, material, seed)


def make_mixed_fleet_sequence(n_dumps: int, seed: int = 0) -> list:
    """
    Generate a realistic truck dispatch sequence.
    Models a mine with 3–6 trucks cycling through the dump polygon.
    Payload follows a bimodal distribution (small haul + large haul trucks).
    """
    rng = np.random.default_rng(seed)
    n_trucks = int(rng.integers(3, 7))
    payloads = rng.choice(FLEET_PAYLOADS, size=n_trucks, replace=True)
    sequence = []
    for i in range(n_dumps):
        truck_idx = i % n_trucks
        # add ±10% payload variance (realistic loading variation)
        p = float(payloads[truck_idx]) * float(rng.uniform(0.90, 1.10))
        sequence.append({
            "truck_id": f"T{truck_idx+1}",
            "payload_t": round(p, 1),
            "arrival_tick": i * int(rng.integers(2, 6)),  # variable inter-arrival
        })
    return sequence


def generate_expert_trajectory(terrain: Terrain, n_dumps: int = 60) -> list:
    """
    Run the heuristic ScoringEngine on a terrain and record (obs, action) pairs.
    Used for behavioural cloning / supervised pre-training before PPO fine-tuning.
    """
    from ml.environment import COLS
    from scipy.ndimage import distance_transform_edt

    entry = terrain.entry
    eng = ScoringEngine(terrain, entry, dict(DEFAULT_WEIGHTS))
    val = IsolationValidator(terrain, entry, 0.85)
    trajectory = []

    def _obs(t: Terrain) -> np.ndarray:
        h = t.height
        mask = t.mask.astype(np.float32)
        max_h = h[t.mask].max() if t.mask.any() else 1.0
        h_norm = np.clip(h / 15.0, 0.0, 1.0).astype(np.float32)
        dist = distance_transform_edt(t.mask).astype(np.float32)
        dist_norm = dist / (dist.max() or 1.0)
        return np.stack([h_norm, mask, dist_norm], axis=0)

    for i in range(n_dumps):
        obs = _obs(terrain)
        r, c, _ = eng.score_all()
        if r is None:
            break
        safe, _ = val.validate(r, c, 100.0)
        if safe:
            action = r * COLS + c
            trajectory.append({"obs": obs.tolist(), "action": action})
            terrain.apply_dump(r, c, 100.0)

    return trajectory


def build_benchmark_suite(n_polygons: int = 20, out_dir: str = "data/benchmark") -> str:
    """
    Build a held-out benchmark suite for evaluating trained vs heuristic policies.
    Seeds 8000–8019 are reserved for benchmarking (never used in training).
    """
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    results = []
    for i in range(n_polygons):
        seed = 8000 + i
        terrain_h = make_random_terrain(seed)
        terrain_ml = make_random_terrain(seed)  # identical start

        # heuristic rollout
        eng = ScoringEngine(terrain_h, terrain_h.entry, dict(DEFAULT_WEIGHTS))
        val = IsolationValidator(terrain_h, terrain_h.entry, 0.85)
        h_dumps = 0
        for _ in range(60):
            r, c, _ = eng.score_all()
            if r is None: break
            safe, _ = val.validate(r, c, 100.0)
            if safe:
                ok, _ = terrain_h.apply_dump(r, c, 100.0)
                if ok: h_dumps += 1

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
