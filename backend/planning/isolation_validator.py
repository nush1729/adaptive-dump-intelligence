"""
Layer 3 — Isolation & Constraint Validator.

BFS flood-fill on simulated terrain copy before every dump commit.
Reachability < 85 % → instant rejection. Real terrain never touched.
Passability threshold: dynamic = mean(height) + 2 * std(height).
Minimum dump spacing enforced as hard constraint before BFS.
"""
import numpy as np
from scipy.ndimage import label

from config import SITE_CONFIG
from environment.dump_physics import apply_dump_to_height

# 4-connected structuring element for scipy.ndimage.label
_STRUCTURE = np.array([[0, 1, 0],
                        [1, 1, 1],
                        [0, 1, 0]], dtype=bool)

# ── free function: connected-component reachability ─────────────────────────

def bfs_reachable(height_map, mask, entry, passability_thresh):
    """4-connected reachability from *entry*. Returns reachable / total_passable.

    Equivalent to a BFS flood-fill, but computed via scipy's connected-component
    labeling — a single vectorized pass over the grid instead of a per-cell
    Python BFS loop (the latter dominated _apply_iso's per-candidate cost).
    """
    passable = mask & (height_map <= passability_thresh)
    rows, cols = passable.shape
    er, ec = entry

    # if entry cell itself is blocked, snap to nearest passable cell
    if not passable[er, ec]:
        pts = np.argwhere(passable)
        if len(pts) == 0:
            return 0.0
        d = np.abs(pts[:, 0] - er) + np.abs(pts[:, 1] - ec)
        er, ec = int(pts[d.argmin(), 0]), int(pts[d.argmin(), 1])

    total_passable = int(passable.sum())
    if total_passable == 0:
        return 0.0

    labeled, _ = label(passable, structure=_STRUCTURE)
    entry_label = labeled[er, ec]
    count = int((labeled == entry_label).sum())

    return count / total_passable


# ── IsolationValidator ───────────────────────────────────────────────────────

class IsolationValidator:
    """
    Callers (signature contract — do NOT change positional args):
        IsolationValidator(terrain, entry, threshold)     # 3-arg
        IsolationValidator(terrain, entry)                # 2-arg (site default)
        .validate(r, c, payload_t)  → (bool, float)
    """

    def __init__(self, terrain, entry, reachability_threshold=SITE_CONFIG.iso_threshold,
                 min_spacing=SITE_CONFIG.min_dump_spacing_cells):
        self.terrain = terrain
        self.entry = entry
        self.reach_thresh = reachability_threshold   # externally settable
        self.min_spacing = min_spacing if min_spacing is not None else SITE_CONFIG.min_dump_spacing_cells
        self.dump_history: list = []                 # list of (r, c)

    # ── public API ───────────────────────────────────────────────────────

    def validate(self, r, c, payload_t):
        """Check if dumping *payload_t* at (r, c) is safe.

        Returns (safe: bool, reachability: float).
        """
        if not self.terrain.mask[r, c]:
            return False, 0.0

        # fast: spacing constraint
        if not self._spacing_ok(r, c):
            return False, -1.0

        # dry-run simulation (never mutate real terrain)
        sim_h = apply_dump_to_height(
            self.terrain.height,
            self.terrain.mask,
            int(r),
            int(c),
            float(payload_t),
            self.terrain.material,
            mutate=False,
        )

        # BFS on simulated height
        thresh = self._pass_thresh()
        reach = bfs_reachable(sim_h, self.terrain.mask, self.entry, thresh)
        return bool(reach >= self.reach_thresh), float(reach)

    def record_dump(self, r, c):
        """Track completed dump for spacing constraint."""
        self.dump_history.append((r, c))

    # ── internals ────────────────────────────────────────────────────────

    def _spacing_ok(self, r, c):
        for pr, pc in self.dump_history:
            if ((r - pr) ** 2 + (c - pc) ** 2) ** 0.5 < self.min_spacing:
                return False
        return True

    def _pass_thresh(self):
        """Return BFS passability ceiling: mean terrain height + truck clearance.

        A fixed vehicle-clearance margin above the *current* mean fill level —
        not a percentile of the height distribution. The percentile approach
        pinned to its `max(..., 1.0)` floor while the terrain was still mostly
        flat (early simulation), so a single near-entry pile taller than 1.0m
        was misread as "impassable" and collapsed BFS reachability to ~0,
        cascading into false-positive iso_rejected(0.00) for the whole map.
        Anchoring to mean_height instead tracks fill progress: the ceiling
        rises as the site fills, so legitimate piles stay crossable while
        genuinely oversized obstructions (more than `truck_clearance_m` above
        the surrounding terrain) still correctly block passage.
        """
        h = self.terrain.height[self.terrain.mask]
        if len(h) == 0:
            return 8.0
        clearance = getattr(SITE_CONFIG, "truck_clearance_m", 2.5)
        return float(h.mean() + clearance)
