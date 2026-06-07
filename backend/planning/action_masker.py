"""Constraint-aware action masking shared by heuristic, ML, and evaluation."""
from __future__ import annotations

from typing import Iterable, Optional, Set, Tuple

import numpy as np

from config import SITE_CONFIG, TRUCK_PROFILES
from environment.dump_physics import apply_dump_to_height
from planning.isolation_validator import bfs_reachable


Cell = Tuple[int, int]


def turning_radius_accessible(terrain, r: int, c: int, profile_name: str,
                              dist_to_boundary: Optional[np.ndarray] = None) -> bool:
    """
    Geometric feasibility check: can a truck with this profile's turning radius
    physically maneuver into cell (r, c)?

    Approximation: the cell must sit at least half a turning-circle away from the
    polygon boundary (1 grid cell == 1 metre, so turning_radius_m maps directly to
    cells) — a coarse "is there room to swing in" proxy, not a full Dubins/
    Reeds-Shepp solve, but a real geometric constraint derived from the truck's
    actual spec rather than a cosmetic one.

    Pass a precomputed `dist_to_boundary` (distance_transform_edt(terrain.mask))
    to avoid recomputing it for every candidate cell in a mask sweep.
    """
    profile = TRUCK_PROFILES.get(profile_name, TRUCK_PROFILES["generic"])
    turning_radius_cells = profile.turning_radius_m  # 1 m² cells → direct mapping
    if dist_to_boundary is None:
        dist_to_boundary = terrain.dist_to_boundary
    return bool(dist_to_boundary[r, c] >= turning_radius_cells * 0.5)


class ConstrainedActionMasker:
    def __init__(self, terrain, validator=None, iso_threshold: Optional[float] = None):
        self.terrain = terrain
        self.validator = validator
        self.iso_threshold = iso_threshold if iso_threshold is not None else SITE_CONFIG.iso_threshold

    def mask(self, payload_t: float, reserved_cells: Optional[Iterable[Cell]] = None,
             include_iso: bool = True, include_path: bool = False,
             truck_profile: Optional[str] = None,
             zone_mask: Optional[np.ndarray] = None) -> np.ndarray:
        terrain = self.terrain
        action_mask = terrain.mask.copy()
        action_mask[terrain.height >= SITE_CONFIG.max_height_m] = False

        # Geofenced zone constraint: hard-restrict to this truck's assigned
        # active face (mirrors real AHS dispatch — a truck never wanders
        # outside the zone its fleet-management tier assigned it to).
        if zone_mask is not None:
            action_mask &= zone_mask

        reserved: Set[Cell] = set(reserved_cells or [])
        for rr, cc in reserved:
            if 0 <= rr < terrain.rows and 0 <= cc < terrain.cols:
                action_mask[rr, cc] = False

        self._apply_spacing(action_mask)

        if truck_profile is not None:
            self._apply_kinematics(action_mask, truck_profile)

        if include_iso:
            self._apply_iso(action_mask, payload_t)

        if include_path:
            self._apply_path(action_mask)

        return action_mask

    def _apply_kinematics(self, action_mask: np.ndarray, profile_name: str) -> None:
        """Hard-reject cells the truck cannot geometrically maneuver into.

        Promotes the turning-radius spec from a soft training-time reward nudge
        (ml/environment.py reward shaping, -0.5 penalty) into a real runtime
        constraint that both the heuristic engine and the trained policy are
        masked against — closing the gap between "truck spec is recorded" and
        "truck spec is enforced at decision time".
        """
        valid_rc = np.argwhere(action_mask)
        if len(valid_rc) == 0:
            return
        dist_to_boundary = self.terrain.dist_to_boundary
        profile = TRUCK_PROFILES.get(profile_name, TRUCK_PROFILES["generic"])
        min_dist = profile.turning_radius_m * 0.5
        too_close = dist_to_boundary[valid_rc[:, 0], valid_rc[:, 1]] < min_dist
        action_mask[valid_rc[too_close, 0], valid_rc[too_close, 1]] = False

    def _apply_spacing(self, action_mask: np.ndarray) -> None:
        if self.validator is None or not getattr(self.validator, "dump_history", None):
            return
        dumps = np.array(self.validator.dump_history)
        if len(dumps) == 0:
            return
        try:
            from scipy.spatial import cKDTree
            tree = cKDTree(dumps)
            valid_rc = np.argwhere(action_mask)
            if len(valid_rc) == 0:
                return
            dists, _ = tree.query(valid_rc, k=1)
            min_spacing = getattr(self.validator, "min_spacing", SITE_CONFIG.min_dump_spacing_cells)
            too_close = dists < min_spacing
            action_mask[valid_rc[too_close, 0], valid_rc[too_close, 1]] = False
        except Exception:
            for r, c in np.argwhere(action_mask):
                if not self.validator._spacing_ok(int(r), int(c)):
                    action_mask[r, c] = False

    def _apply_iso(self, action_mask: np.ndarray, payload_t: float) -> None:
        terrain = self.terrain
        valid_rc = np.argwhere(action_mask)
        if len(valid_rc) > SITE_CONFIG.iso_mask_cell_limit:
            return
        if self.validator is not None:
            threshold = self.validator._pass_thresh()
            entry = self.validator.entry
            reach_thresh = self.validator.reach_thresh
        else:
            h = terrain.height[terrain.mask]
            threshold = float(max(np.percentile(h, 97), 1.0)) if len(h) else 1.0
            entry = terrain.entry
            reach_thresh = self.iso_threshold

        for r, c in valid_rc:
            sim_h = apply_dump_to_height(
                terrain.height, terrain.mask, int(r), int(c), payload_t, terrain.material, mutate=False
            )
            reach = bfs_reachable(sim_h, terrain.mask, entry, threshold)
            if reach < reach_thresh:
                action_mask[r, c] = False

    def _apply_path(self, action_mask: np.ndarray) -> None:
        try:
            from planning.pathfinder import find_path
            er, ec = self.terrain.entry
            for r, c in np.argwhere(action_mask):
                path = find_path(self.terrain.height, self.terrain.mask, (int(er), int(ec)), (int(r), int(c)))
                if not path:
                    action_mask[r, c] = False
        except Exception:
            return
