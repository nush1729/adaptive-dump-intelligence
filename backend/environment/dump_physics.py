"""Shared dump-mound physics used by simulation, validation, and replay data."""
from __future__ import annotations

from typing import Iterable, Tuple

import numpy as np

from config import MATERIALS, SITE_CONFIG, material_config, payload_tonnes_to_volume_m3


def material_sigma_ratio(material: str) -> float:
    """Scale the global dump_sigma_ratio by each material's angle of repose.

    A steeper angle of repose (e.g. rock at 40°) piles into a narrower, taller
    mound — a smaller sigma ratio. A shallower angle (e.g. coal at 34°) spreads
    wider and flatter — a larger ratio. SITE_CONFIG.dump_sigma_ratio remains the
    calibration anchor, scaled relative to the "default" material's angle (38°)
    so existing tuned behaviour for "default" is unchanged.
    """
    anchor_deg = MATERIALS["default"].angle_of_repose_deg
    return SITE_CONFIG.dump_sigma_ratio * (anchor_deg / material_config(material).angle_of_repose_deg)


def dump_kernel(payload_t: float, material: str) -> Iterable[Tuple[int, int, float]]:
    """Yield `(dr, dc, height_delta_m)` for one payload.

    The model converts tonnes to cubic metres, then distributes that volume over
    a Gaussian mound while preserving total volume when cell area is 1m². Mound
    width is shaped per-material via `material_sigma_ratio`, reflecting that
    different materials settle into different repose angles.
    """
    radius = SITE_CONFIG.dump_radius_cells
    sigma = radius * material_sigma_ratio(material)
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


# Each *unordered* pair of neighbours is listed once — (dr, dc) relates window A
# to window B. Material flows from whichever side of the pair is higher (signed
# difference), so one entry per axis covers both flow directions; listing both
# (-1, 0) and (1, 0) would process the same physical pair twice per pass and
# double the redistributed volume (the divergence seen during initial testing).
_NEIGHBOR_OFFSETS = (
    (-1, 0, 1.0), (0, -1, 1.0),
    (-1, -1, np.sqrt(2)), (-1, 1, np.sqrt(2)),
)

# Sandpile-style relaxation passes per dump — real avalanches settle in a handful
# of redistribution events; more passes buys diminishing realism for rising cost.
_AVALANCHE_PASSES = 24

# Fraction of each pair's excess shed per neighbour relation per pass. Each cell
# has up to 4 such relations (N, W, NW, NE) active simultaneously; summing their
# shed fractions must stay safely below 1.0 or the explicit update overshoots
# and oscillates into negative heights (the instability hit during tuning).
# 4 relations x 0.12 = 0.48 max fractional outflow per pass — stable with margin.
_SHED_FRACTION = 0.12


def _talus_height_diff(material: str, cell_distance: float) -> float:
    """Max stable height difference between two cells `cell_distance` apart.

    Derived directly from the material's angle of repose: a slope steeper than
    tan(angle_of_repose) is not stable — material slides until the local slope
    relaxes back to (at most) that angle. This is what makes piles plateau
    instead of growing into unbounded spikes.
    """
    angle_rad = np.radians(material_config(material).angle_of_repose_deg)
    return float(np.tan(angle_rad) * cell_distance)


def relax_slopes(height: np.ndarray, mask: np.ndarray, material: str,
                 mutate: bool = False) -> np.ndarray:
    """Redistribute material from over-steep cells to lower neighbours.

    Cellular-automaton "sandpile" relaxation: any cell whose height exceeds a
    lower neighbour by more than the material's talus angle allows sheds half
    the excess to that neighbour (volume-preserving). Repeated for a fixed
    number of passes so piles settle into a stable, plateaued shape bounded by
    the material's angle of repose rather than growing into unbounded Gaussian
    spikes.
    """
    out = height if mutate else height.copy()
    rows, cols = out.shape

    for _ in range(_AVALANCHE_PASSES):
        delta = np.zeros_like(out)
        for dr, dc, dist in _NEIGHBOR_OFFSETS:
            max_diff = _talus_height_diff(material, dist)

            a_r0, a_r1 = max(0, -dr), rows - max(0, dr)
            a_c0, a_c1 = max(0, -dc), cols - max(0, dc)
            b_r0, b_r1 = max(0, dr), rows - max(0, -dr)
            b_c0, b_c1 = max(0, dc), cols - max(0, -dc)

            a_h = out[a_r0:a_r1, a_c0:a_c1]
            b_h = out[b_r0:b_r1, b_c0:b_c1]
            a_mask = mask[a_r0:a_r1, a_c0:a_c1]
            b_mask = mask[b_r0:b_r1, b_c0:b_c1]
            pair_mask = a_mask & b_mask

            # Signed difference: positive means A is higher than B. Whichever
            # side exceeds the talus limit sheds half its excess to the other —
            # this naturally handles flow in both directions within one pass.
            diff = a_h - b_h
            a_to_b = np.clip(diff - max_diff, 0.0, None) * _SHED_FRACTION * pair_mask
            b_to_a = np.clip(-diff - max_diff, 0.0, None) * _SHED_FRACTION * pair_mask

            net_to_b = a_to_b - b_to_a
            delta[a_r0:a_r1, a_c0:a_c1] -= net_to_b
            delta[b_r0:b_r1, b_c0:b_c1] += net_to_b

        out += delta

    np.clip(out, 0.0, None, out=out)
    return out


def apply_dump_to_height(height: np.ndarray, mask: np.ndarray, r: int, c: int,
                         payload_t: float, material: str, mutate: bool = False) -> np.ndarray:
    """Apply a dump to a height grid, then relax it to a stable pile shape."""
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

    relax_slopes(out, mask, material, mutate=True)
    return out
