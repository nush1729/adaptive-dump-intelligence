"""
ADIOSOrchestrator — uses ScoringEngine + IsolationValidator for dispatch.
"""
import numpy as np
from planning.scorer import ScoringEngine, DEFAULT_WEIGHTS
from planning.isolation_validator import IsolationValidator


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
        reserved = set()

        for i, (truck_id, payload_t) in enumerate(dispatches):
            placed = False
            # retry with expanding reserved set until a safe cell is found
            for _attempt in range(50):
                r, c, _ = self.engine.score_all(reserved_cells=reserved)

                if r is None:
                    log.append({"t": i, "truck": truck_id,
                                "r": 0, "c": 0,
                                "status": "no_space",
                                "payload_t": payload_t})
                    break

                safe, reach = self.validator.validate(r, c, payload_t)
                if not safe:
                    reserved.add((r, c))
                    continue  # try next best cell

                ok, reason = self.terrain.apply_dump(r, c, payload_t)
                status = "dumped" if ok else reason

                if ok:
                    self.validator.record_dump(r, c)

                log.append({"t": i, "truck": truck_id,
                            "r": int(r), "c": int(c),
                            "status": status, "payload_t": payload_t,
                            "volume": self.terrain.total_volume(),
                            "coverage": self.terrain.coverage_fraction()})

                self.snapshots.append({
                    "dump_n": i, "truck": truck_id,
                    "r": int(r), "c": int(c),
                    "volume": self.terrain.total_volume(),
                    "coverage": self.terrain.coverage_fraction(),
                    "efficiency": self.terrain.packing_efficiency(),
                    "policy": "heuristic",
                })
                placed = True
                break

            if not placed and (not log or log[-1]["t"] != i):
                log.append({"t": i, "truck": truck_id,
                            "r": 0, "c": 0,
                            "status": "no_space",
                            "payload_t": payload_t})

        return log