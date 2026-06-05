"""Constraint-aware action masking shared by heuristic, ML, and evaluation."""
from __future__ import annotations

from typing import Iterable, Optional, Set, Tuple

import numpy as np

from config import SITE_CONFIG
from environment.dump_physics import apply_dump_to_height
from planning.isolation_validator import bfs_reachable


Cell = Tuple[int, int]


class ConstrainedActionMasker:
    def __init__(self, terrain, validator=None, iso_threshold: Optional[float] = None):
        self.terrain = terrain
        self.validator = validator
        self.iso_threshold = iso_threshold if iso_threshold is not None else SITE_CONFIG.iso_threshold

    def mask(self, payload_t: float, reserved_cells: Optional[Iterable[Cell]] = None,
             include_iso: bool = True, include_path: bool = False) -> np.ndarray:
        terrain = self.terrain
        action_mask = terrain.mask.copy()
        action_mask[terrain.height >= SITE_CONFIG.max_height_m] = False

        reserved: Set[Cell] = set(reserved_cells or [])
        for rr, cc in reserved:
            if 0 <= rr < terrain.rows and 0 <= cc < terrain.cols:
                action_mask[rr, cc] = False

        self._apply_spacing(action_mask)

        if include_iso:
            self._apply_iso(action_mask, payload_t)

        if include_path:
            self._apply_path(action_mask)

        return action_mask

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
