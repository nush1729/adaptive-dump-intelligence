"""
Layer 4 — Multi-Truck Time-Space Scheduler.

reserved[row][col][time_step] reservation grid.
Full path reserved before truck moves.
Deadlock cycle detection (DFS on wait-for graph) before every dispatch.
"""
from collections import defaultdict
import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


class TimeSpaceScheduler:
    """Conflict-free truck scheduling over a (rows × cols × T) grid."""

    def __init__(self, rows, cols, T=120):
        self.rows = rows
        self.cols = cols
        self.T = T
        self.reserved: dict = {}            # (r, c, t) → truck_id
        self.truck_paths: dict = {}         # truck_id → [(r, c, t), …]
        self.starvation: dict = defaultdict(int)
        self.wait_for: dict = defaultdict(set)   # tid → {blocking tids}
        try:
            from config import SITE_CONFIG
            self._max_delay = SITE_CONFIG.scheduler_max_delay_steps
        except Exception:
            self._max_delay = 40

    # ── reservation ──────────────────────────────────────────────────────

    def try_reserve(self, tid, path, t0=0, _depth=0):
        """Try to reserve *path* for truck *tid* starting at *t0*.

        Searches up to 25 time-step delays for a conflict-free slot.

        Returns (success: bool, actual_start_time: int).
        """
        blockers = set()
        path_len = len(path)
        for delay in range(25):
            t = t0 + delay
            if t + path_len > self.T:
                break
            
            conflict = False
            for i, (r, c) in enumerate(path):
                s = (r, c, t + i)
                if s in self.reserved:
                    blockers.add(self.reserved[s])
                    conflict = True
                    break
            
            if not conflict:
                slots = [(r, c, t + i) for i, (r, c) in enumerate(path)]
                for s in slots:
                    self.reserved[s] = tid
                self.truck_paths[tid] = slots
                self.starvation[tid] = 0
                self.wait_for.pop(tid, None)
                return True, t
            self.starvation[tid] = self.starvation.get(tid, 0) + 1

        # record who blocked this truck (for cycle detection)
        if blockers:
            self.wait_for[tid] = blockers
            # ERROR 2-F fix: detect and break deadlock cycles at dispatch time
            if self.has_cycle() and _depth < 3:
                # Break cycle: release the blocker with the highest starvation count.
                # Tie-break on tid for determinism — `blockers` is a set, whose
                # iteration order is hash-based and would otherwise make deadlock
                # resolution (and thus replay/audit reproducibility) non-deterministic.
                worst = max(blockers, key=lambda x: (self.starvation.get(x, 0), x))
                self.release(worst)
                # Retry once with the freed slot
                return self.try_reserve(tid, path, t0, _depth + 1)
        return False, -1

    def release(self, tid):
        """Free all reservations held by *tid*."""
        for s in self.truck_paths.pop(tid, []):
            self.reserved.pop(s, None)
        self.wait_for.pop(tid, None)
        # Bug B2 fix: remove tid from all other trucks' wait sets
        # (prevents phantom cycle detection on already-resolved trucks)
        for other in list(self.wait_for):
            self.wait_for[other].discard(tid)
            if not self.wait_for[other]:
                del self.wait_for[other]

    # ── deadlock detection ───────────────────────────────────────────────

    def has_cycle(self):
        """DFS on wait-for graph — True iff a deadlock cycle exists.

        An edge tid_a → tid_b means truck A failed to reserve because
        truck B holds a conflicting slot.  A cycle = mutual blocking.
        """
        WHITE, GRAY, BLACK = 0, 1, 2
        color: dict = defaultdict(int)

        def dfs(u):
            color[u] = GRAY
            for v in self.wait_for.get(u, set()):
                if color[v] == GRAY:
                    return True
                if color[v] == WHITE and dfs(v):
                    return True
            color[u] = BLACK
            return False

        return any(dfs(n) for n in list(self.wait_for)
                   if color[n] == WHITE)

    # ── livelock detection ───────────────────────────────────────────────

    def livelock_trucks(self, thresh=12):
        """Return truck IDs that have been starved *thresh* or more times."""
        return [tid for tid, cnt in self.starvation.items()
                if cnt >= thresh]