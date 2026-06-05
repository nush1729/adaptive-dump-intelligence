"""Central KPI calculations for ADIOS simulation and benchmarks."""
from __future__ import annotations

from typing import Iterable, Sequence

import numpy as np

from config import SITE_CONFIG, material_config


def feasible_capacity_m3(terrain) -> float:
    material = material_config(getattr(terrain, "material", "default"))
    return float(np.sum(terrain.mask) * SITE_CONFIG.cell_area_m2 * material.feasible_lift_m)


def total_volume_m3(terrain) -> float:
    return float(np.sum(terrain.height[terrain.mask]) * SITE_CONFIG.cell_area_m2)


def coverage_fraction(terrain, fill_threshold_m: float = 0.1) -> float:
    if not terrain.mask.any():
        return 0.0
    filled = np.sum(terrain.height[terrain.mask] > fill_threshold_m)
    return float(filled / max(int(np.sum(terrain.mask)), 1))


def packing_efficiency(terrain) -> float:
    cap = feasible_capacity_m3(terrain)
    if cap <= 0:
        return 0.0
    return float(total_volume_m3(terrain) / cap)


def filled_uniformity(terrain, fill_threshold_m: float = 0.1) -> float:
    vals = terrain.height[terrain.mask & (terrain.height > fill_threshold_m)]
    if len(vals) == 0:
        return 0.0
    return float(max(0.0, min(1.0, 1.0 - np.std(vals) / max(np.mean(vals), 1e-6))))


def site_uniformity(terrain) -> float:
    vals = terrain.height[terrain.mask]
    if len(vals) == 0:
        return 0.0
    return float(max(0.0, min(1.0, 1.0 - np.std(vals) / max(np.mean(vals), 1e-6))))


def mean_spacing(dump_positions: Sequence[tuple[int, int]]) -> float:
    if len(dump_positions) < 2:
        return 0.0
    pts = np.array(dump_positions, dtype=float)
    dists = []
    for i, p in enumerate(pts):
        others = np.delete(pts, i, axis=0)
        if len(others) == 0:
            continue
        dists.append(float(np.min(np.linalg.norm(others - p, axis=1))))
    return float(np.mean(dists)) if dists else 0.0


def latency_stats(latencies_ms: Iterable[float]) -> dict:
    vals = np.array(list(latencies_ms), dtype=float)
    if len(vals) == 0:
        return {"mean": 0.0, "p50": 0.0, "p95": 0.0}
    return {
        "mean": round(float(np.mean(vals)), 3),
        "p50": round(float(np.percentile(vals, 50)), 3),
        "p95": round(float(np.percentile(vals, 95)), 3),
    }


def summarize_episode(terrain, log: Sequence[dict], latencies_ms: Sequence[float] | None = None,
                      dump_positions: Sequence[tuple[int, int]] | None = None,
                      policy: str = "heuristic") -> dict:
    total = len(log)
    success = sum(1 for x in log if x.get("status") == "dumped")
    rejected = total - success
    iso = sum(1 for x in log if "iso" in str(x.get("status", "")))
    spacing = mean_spacing(dump_positions or [])
    lat = latency_stats(latencies_ms or [])
    return {
        "total_dispatched": total,
        "successful_dumps": success,
        "rejected": rejected,
        "rejection_rate": round(rejected / max(total, 1), 4),
        "isolation_events": iso,
        "iso_rejection_rate": round(iso / max(total, 1), 4),
        "total_volume": round(total_volume_m3(terrain), 3),
        "feasible_capacity": round(feasible_capacity_m3(terrain), 3),
        "coverage_pct": round(coverage_fraction(terrain) * 100, 2),
        "packing_efficiency": round(packing_efficiency(terrain) * 100, 2),
        "filled_uniformity": round(filled_uniformity(terrain), 4),
        "height_uniformity": round(site_uniformity(terrain), 4),
        "mean_spacing_m": round(spacing, 3),
        "spacing_target_error": round(abs(spacing - SITE_CONFIG.target_spacing_cells), 3) if spacing else 0.0,
        "latency_ms": lat["mean"],
        "latency_p50_ms": lat["p50"],
        "latency_p95_ms": lat["p95"],
        "policy": policy,
    }
