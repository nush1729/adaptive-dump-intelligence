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

    def run_iter(self, dispatches):
        """Generator: yields one dispatch event dict per truck.

        This is the single-source-of-truth dispatch loop used by both
        the REST /simulate endpoint and the WebSocket /ws/simulate handler.

        Args:
            dispatches: List of (truck_id, payload_tonnes) tuples
        Yields:
            dict with keys: t, truck, r, c, status, payload_t, volume,
            coverage, efficiency, policy, full_surface (optional)
        """
        reserved = set()

        for i, (truck_id, payload_t) in enumerate(dispatches):
            placed = False
            for _attempt in range(50):
                r, c, _ = self.engine.score_all(reserved_cells=reserved)

                if r is None:
                    yield {"t": i, "truck": truck_id,
                           "r": 0, "c": 0,
                           "status": "no_space",
                           "payload_t": payload_t}
                    break

                safe, reach = self.validator.validate(r, c, payload_t)
                if not safe:
                    reserved.add((r, c))
                    yield {"t": i, "truck": truck_id,
                           "r": int(r), "c": int(c),
                           "status": f"iso_rejected({reach:.2f})",
                           "payload_t": payload_t,
                           "reach": reach}
                    continue

                ok, reason = self.terrain.apply_dump(r, c, payload_t)
                status = "dumped" if ok else reason

                if ok:
                    self.validator.record_dump(r, c)

                vol = self.terrain.total_volume()
                cov = self.terrain.coverage_fraction()
                eff = self.terrain.packing_efficiency()

                self.snapshots.append({
                    "dump_n": i, "truck": truck_id,
                    "r": int(r), "c": int(c),
                    "volume": vol,
                    "coverage": cov,
                    "efficiency": eff,
                    "policy": "heuristic",
                })

                yield {"t": i, "truck": truck_id,
                       "r": int(r), "c": int(c),
                       "status": status, "payload_t": payload_t,
                       "volume": vol,
                       "coverage": cov,
                       "efficiency": eff,
                       "policy": "heuristic",
                       "full_surface": self.terrain.to_json_surface()}
                placed = True
                break

            if not placed and (not self.snapshots or self.snapshots[-1].get("dump_n") != i):
                # Already yielded a no_space or iso_rejected event above
                pass

    def run(self, dispatches) -> list:
        """Run simulation with dispatch sequence.

        Args:
            dispatches: List of (truck_id, payload_tonnes) tuples
        Returns:
            Log of dispatch events (only successful dumps + no_space events)
        """
        log = []
        for event in self.run_iter(dispatches):
            log.append(event)
        return log