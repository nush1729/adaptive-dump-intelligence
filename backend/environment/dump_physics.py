"""Shared dump-mound physics used by simulation, validation, and replay data."""
from __future__ import annotations

from typing import Iterable, Tuple

import numpy as np

from config import SITE_CONFIG, payload_tonnes_to_volume_m3


def dump_kernel(payload_t: float, material: str) -> Iterable[Tuple[int, int, float]]:
    """Yield `(dr, dc, height_delta_m)` for one payload.

    The model converts tonnes to cubic metres, then distributes that volume over
    a Gaussian mound while preserving total volume when cell area is 1m².
    """
    radius = SITE_CONFIG.dump_radius_cells
    sigma = radius * SITE_CONFIG.dump_sigma_ratio
    sig_sq2 = 2.0 * sigma * sigma

    offsets = []
    weights = []
    for dr in range(-radius, radius + 1):
        for dc in range(-radius, radius + 1):
            dist_sq = dr * dr + dc * dc
            if dist_sq > radius * radius:
                continue
            offsets.append((dr, dc))
            weights.append(float(np.exp(-dist_sq / sig_sq2)))

    total_weight = max(float(np.sum(weights)), 1e-9)
    payload_volume_m3 = payload_tonnes_to_volume_m3(payload_t, material)
    height_scale = payload_volume_m3 / (total_weight * SITE_CONFIG.cell_area_m2)

    for (dr, dc), weight in zip(offsets, weights):
        yield dr, dc, float(weight * height_scale)


def apply_dump_to_height(height: np.ndarray, mask: np.ndarray, r: int, c: int,
                         payload_t: float, material: str, mutate: bool = False) -> np.ndarray:
    """Apply a dump to a height grid and return the updated grid."""
    out = height if mutate else height.copy()
    rows, cols = out.shape
    for dr, dc, delta in dump_kernel(payload_t, material):
        nr, nc = r + dr, c + dc
        if not (0 <= nr < rows and 0 <= nc < cols):
            continue
        if not mask[nr, nc]:
            continue
        if out[nr, nc] > 0.1:
            compaction = max(
                SITE_CONFIG.compaction_floor,
                1.0 - (delta * SITE_CONFIG.compaction_gain),
            )
            out[nr, nc] *= compaction
        out[nr, nc] += delta
    return out
