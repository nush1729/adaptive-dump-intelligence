"""
ADIOSOrchestrator — uses ScoringEngine + IsolationValidator for dispatch.
"""
import numpy as np
from planning.scorer import ScoringEngine, DEFAULT_WEIGHTS
from planning.isolation_validator import IsolationValidator
from planning.scheduler import TimeSpaceScheduler


class ADIOSOrchestrator:
    """Orchestrates dump truck dispatching using scored cell selection."""

    def __init__(self, terrain, weights=None, audit_path=None):
        self.terrain = terrain
        self.weights = weights or dict(DEFAULT_WEIGHTS)
        self.audit_path = audit_path
        self.snapshots = []

        self.engine = ScoringEngine(terrain, terrain.entry, self.weights)
        self.validator = IsolationValidator(terrain, terrain.entry)
        self.reach_thresh = 0.85          # kept for compat

    def run(self, dispatches) -> list:
        """Run simulation with dispatch sequence.

        Args:
            dispatches: List of (truck_id, payload_tonnes) tuples
        Returns:
            Log of dispatch events
        """
        log = []
        for _log_entry, _snapshot, _placed, _r, _c in self.run_generator(dispatches):
            log.append(_log_entry)
        return log

    def run_generator(self, dispatches, policy=None, ptype="heuristic"):
        """Generator that yields after each dispatch step, used for streaming."""
        log = []
        reserved = set()
        scheduler = TimeSpaceScheduler(self.terrain.rows, self.terrain.cols, T=len(dispatches) + 100)

        for i, (truck_id, payload_t) in enumerate(dispatches):
            placed = False
            # retry with expanding reserved set until a safe cell is found
            for _attempt in range(50):
                if policy is not None:
                    # ML inference provided from outside to avoid circular dependency
                    import numpy as np
                    from scipy.ndimage import distance_transform_edt
                    h = self.terrain.height
                    mask = self.terrain.mask.astype(np.float32)
                    max_h = h[self.terrain.mask].max() if self.terrain.mask.any() else 1.0
                    h_norm = (h / max(max_h, 1e-6)).astype(np.float32)
                    dist_arr = distance_transform_edt(self.terrain.mask)
                    dist = np.asarray(dist_arr[0] if isinstance(dist_arr, tuple) else dist_arr, dtype=np.float32)
                    dist_norm = dist / (dist.max() or 1.0)
                    obs = np.stack([h_norm, mask, dist_norm], axis=0)
                    
                    action = policy.predict(obs, self.terrain.mask.ravel().copy())
                    r, c = divmod(int(action), self.terrain.cols)
                else:
                    r, c, _ = self.engine.score_all(reserved_cells=reserved)

                if r is None:
                    log_entry = {"t": i, "truck": truck_id,
                                "r": 0, "c": 0,
                                "status": "no_space",
                                "payload_t": payload_t}
                    log.append(log_entry)
                    yield log_entry, None, placed, None, None
                    break

                safe, reach = self.validator.validate(r, c, payload_t)
                if not safe:
                    reserved.add((r, c))
                    yield {"t": i, "truck": truck_id, "r": int(r), "c": int(c), "status": f"iso_rejected({reach:.2f})", "payload_t": payload_t}, None, False, r, c
                    continue  # try next best cell

                # TimeSpaceScheduler Deadlock & Conflict Check
                sched_ok, start_t = scheduler.try_reserve(truck_id, [(r, c)], t0=i)
                if not sched_ok:
                    reserved.add((r, c))
                    yield {"t": i, "truck": truck_id, "r": int(r), "c": int(c), "status": "sched_rejected", "payload_t": payload_t}, None, False, r, c
                    continue

                ok, reason = self.terrain.apply_dump(r, c, payload_t)
                status = "dumped" if ok else reason

                if ok:
                    self.validator.record_dump(r, c)
                    scheduler.release(truck_id)

                log_entry = {"t": i, "truck": truck_id,
                            "r": int(r), "c": int(c),
                            "status": status, "payload_t": payload_t,
                            "volume": self.terrain.total_volume(),
                            "coverage": self.terrain.coverage_fraction()}
                log.append(log_entry)

                snapshot = {
                    "dump_n": i, "truck": truck_id,
                    "r": int(r), "c": int(c),
                    "volume": self.terrain.total_volume(),
                    "coverage": self.terrain.coverage_fraction(),
                    "efficiency": self.terrain.packing_efficiency(),
                    "policy": ptype,
                }
                self.snapshots.append(snapshot)
                placed = True
                yield log_entry, snapshot, placed, r, c
                break

            if not placed and (not log or log[-1]["t"] != i):
                log_entry = {"t": i, "truck": truck_id,
                            "r": 0, "c": 0,
                            "status": "no_space",
                            "payload_t": payload_t}
                log.append(log_entry)
                yield log_entry, None, placed, None, None
            
            if not placed:
                reserved.add((r, c) if r is not None else (0, 0))