"""Geofenced zone planning — mirrors how production AHS (Cat MineStar, Komatsu
FrontRunner) actually dispatches: trucks are routed to predefined active faces
chosen by a fleet-management tier, not via live per-cell optimisation.

ZonePlanner partitions the active polygon into a small number of rectangular
geofenced zones and assigns each to a truck profile (segregating mixed fleets
onto distinct active faces, as real operations do to avoid cross-class
congestion). The resulting per-profile masks are real, hard constraints —
intersected directly into ConstrainedActionMasker.mask() — not a cosmetic
overlay.
"""
from __future__ import annotations

from typing import Dict, List, Tuple

import numpy as np

from config import TRUCK_PROFILES

Cell = Tuple[int, int]


class ZonePlanner:
    """Partitions a terrain's polygon into geofenced zones, one per truck class.

    Zones are axis-aligned rectangular sectors of the polygon's bounding box,
    intersected with the actual polygon mask (so irregular polygon edges are
    respected). Sector count follows the number of distinct profiles present
    in the dispatched fleet — e.g. a 3-truck-class fleet gets a 1x3 (or 3x1,
    whichever is closer to square) split.
    """

    def __init__(self, terrain, profile_names: List[str]):
        self.terrain = terrain
        # Stable, de-duplicated order of profiles to assign zones to
        seen = set()
        self.profiles = [p for p in profile_names if not (p in seen or seen.add(p))]
        if not self.profiles:
            self.profiles = ["generic"]

        self._zone_masks: Dict[str, np.ndarray] = self._build_zones()

    # ── construction ─────────────────────────────────────────────────────────

    def _build_zones(self) -> Dict[str, np.ndarray]:
        mask = self.terrain.mask
        rows, cols = self.terrain.rows, self.terrain.cols
        n = len(self.profiles)

        rs, cs = np.where(mask)
        if len(rs) == 0:
            return {p: np.zeros_like(mask, dtype=bool) for p in self.profiles}
        r0, r1 = int(rs.min()), int(rs.max()) + 1
        c0, c1 = int(cs.min()), int(cs.max()) + 1

        # Choose a grid (n_rows x n_cols sectors) close to square, preferring
        # to split the longer bounding-box axis first.
        n_rows, n_cols = _factor_grid(n, height=(r1 - r0), width=(c1 - c0))

        row_edges = np.linspace(r0, r1, n_rows + 1).astype(int)
        col_edges = np.linspace(c0, c1, n_cols + 1).astype(int)

        zone_masks = {}
        idx = 0
        for ri in range(n_rows):
            for ci in range(n_cols):
                if idx >= n:
                    break
                sector = np.zeros((rows, cols), dtype=bool)
                sector[row_edges[ri]:row_edges[ri + 1], col_edges[ci]:col_edges[ci + 1]] = True
                zone_masks[self.profiles[idx]] = sector & mask
                idx += 1

        return zone_masks

    # ── queries ──────────────────────────────────────────────────────────────

    def zone_mask_for(self, profile_name: str) -> np.ndarray:
        """Return the geofenced candidate-cell mask assigned to a truck profile.

        Unknown profiles fall back to the union of all zones (no segregation),
        so an unrecognised truck class is never hard-blocked from the polygon.
        """
        if profile_name in self._zone_masks:
            return self._zone_masks[profile_name]
        return self.union_mask()

    def union_mask(self) -> np.ndarray:
        out = np.zeros_like(self.terrain.mask, dtype=bool)
        for m in self._zone_masks.values():
            out |= m
        return out

    def to_json(self) -> dict:
        """Serialise zone assignments for the audit log / frontend overlay."""
        return {
            "zones": [
                {
                    "profile": profile,
                    "truck_class": TRUCK_PROFILES.get(profile, TRUCK_PROFILES["generic"]).name,
                    "cell_count": int(zmask.sum()),
                    "mask": zmask.astype(np.uint8).tolist(),
                }
                for profile, zmask in self._zone_masks.items()
            ]
        }


def _factor_grid(n: int, height: int, width: int) -> Tuple[int, int]:
    """Pick (n_rows, n_cols) with n_rows * n_cols >= n, shaped to the bbox.

    Prefers splitting the longer axis so zones stay roughly square — e.g. a
    wide polygon with 3 trucks gets a 1x3 split (side-by-side faces) rather
    than 3x1 (stacked strips spanning the full width).
    """
    if n <= 1:
        return 1, 1
    best = None
    for n_rows in range(1, n + 1):
        n_cols = -(-n // n_rows)  # ceil division
        if n_rows * n_cols < n:
            continue
        zone_h = height / n_rows
        zone_w = width / n_cols
        # Score: how close to square each resulting zone is (lower = better)
        aspect_penalty = abs(zone_h - zone_w)
        waste = n_rows * n_cols - n
        score = (waste, aspect_penalty)
        if best is None or score < best[0]:
            best = (score, (n_rows, n_cols))
    return best[1]
