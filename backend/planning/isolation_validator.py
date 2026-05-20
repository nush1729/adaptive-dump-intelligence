"""
Layer 3 — Isolation & Constraint Validator.

BFS flood-fill on simulated terrain copy before every dump commit.
Reachability < 85 % → instant rejection. Real terrain never touched.
Passability threshold: dynamic = mean(height) + 2 * std(height).
Minimum dump spacing enforced as hard constraint before BFS.
"""
from collections import deque
import numpy as np


# ── free function: pure BFS reachability ─────────────────────────────────────

def bfs_reachable(height_map, mask, entry, passability_thresh):
    """4-connected BFS from *entry*.  Returns reachable / total_passable."""
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

    visited = np.zeros_like(passable, dtype=bool)
    visited[er, ec] = True
    q = deque([(er, ec)])
    count = 1

    while q:
        r, c = q.popleft()
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols \
               and passable[nr, nc] and not visited[nr, nc]:
                visited[nr, nc] = True
                count += 1
                q.append((nr, nc))

    total_passable = int(passable.sum())
    return count / max(total_passable, 1)


# ── IsolationValidator ───────────────────────────────────────────────────────

class IsolationValidator:
    """
    Callers (signature contract — do NOT change positional args):
        IsolationValidator(terrain, entry, threshold)     # 3-arg
        IsolationValidator(terrain, entry)                # 2-arg (default 0.85)
        .validate(r, c, payload_t)  → (bool, float)
    """

    def __init__(self, terrain, entry, reachability_threshold=0.85,
                 min_spacing=3):
        self.terrain = terrain
        self.entry = entry
        self.reach_thresh = reachability_threshold   # externally settable
        self.min_spacing = min_spacing
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
        sim_h = self.terrain.height.copy()
        sim_h[r, c] += payload_t

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
        """Return BFS passability ceiling.

        ERROR 2-E fix: use 97th-percentile of heights instead of mean+2σ.
        Early in simulation, mean+2σ ≈ 0.5, blocking cells with even slight
        Gaussian deposition and causing ISO_REJECTED(0.00).  The 97th-percentile
        correctly identifies only genuinely tall mounds as obstacles.
        """
        h = self.terrain.height[self.terrain.mask]
        if len(h) == 0:
            return 8.0
        return float(max(np.percentile(h, 97), 1.0))