"""
ADIOSOrchestrator — Physics & IoT-Informed fleet dispatch.

Architecture (CTDE — Centralised Training, Decentralised Execution):

  Physical Mine → IoT sensors → IoTTelemetry → Digital Twin (terrain)
       ↑                                              ↓
  terrain.apply_dump()       TruckAgent.propose_action(terrain_map, IoT context)
       ↑                                              ↓
  Central safety validation ← IsolationValidator / PathFinder / Scheduler

Each truck operates as an intelligent edge agent that generates candidate
dump actions from its local context.  The central orchestrator validates
safety (isolation, path, scheduling) before execution.
"""
import numpy as np
from scipy.ndimage import distance_transform_edt
from planning.scorer import ScoringEngine, DEFAULT_WEIGHTS
from planning.isolation_validator import IsolationValidator
from planning.scheduler import TimeSpaceScheduler
from planning.action_masker import ConstrainedActionMasker
from config import SITE_CONFIG


def _build_terrain_map(terrain) -> np.ndarray:
    """Compute the (5, ROWS, COLS) terrain observation channels matching DumpPackingEnv._obs()."""
    from scipy.ndimage import gaussian_filter

    h_norm = np.clip(terrain.height / SITE_CONFIG.max_height_m, 0.0, 1.0).astype(np.float32)
    mask = terrain.mask.astype(np.float32)
    dist_arr = distance_transform_edt(terrain.mask)
    dist = np.asarray(dist_arr[0] if isinstance(dist_arr, tuple) else dist_arr, dtype=np.float32)
    dist_norm = dist / (dist.max() or 1.0)

    # Channel 3: pile detection mask
    pile_mask = (terrain.height > SITE_CONFIG.pile_detection_threshold_m).astype(np.float32)

    # Channel 4: smoothed local dump density
    pile_density = pile_mask * mask
    density = gaussian_filter(pile_density, sigma=SITE_CONFIG.staffed_spacing_cells)
    max_d = float(density.max())
    density = (density / max_d).astype(np.float32) if max_d > 0 else density.astype(np.float32)

    return np.stack([h_norm, mask, dist_norm, pile_mask, density], axis=0)


class ADIOSOrchestrator:
    """Orchestrates dump truck dispatching using scored cell selection."""

    def __init__(self, terrain, weights=None, audit_path=None, n_trucks: int = 4):
        self.terrain = terrain
        self.weights = weights or dict(DEFAULT_WEIGHTS)
        self.audit_path = audit_path
        self.snapshots = []

        self.engine = ScoringEngine(terrain, terrain.entry, self.weights)
        self.validator = IsolationValidator(
            terrain, terrain.entry,
            SITE_CONFIG.iso_threshold, SITE_CONFIG.min_dump_spacing_cells,
        )
        self.reach_thresh = SITE_CONFIG.iso_threshold

        # IoT telemetry layer — feeds real-time fleet metrics into policy context
        from iot.telemetry import IoTTelemetry
        self.iot = IoTTelemetry(n_trucks=n_trucks)

        # CTDE truck agent fleet — one TruckAgent per active truck
        # Populated lazily from dispatch sequence profile information
        self._truck_agents = {}  # truck_id → TruckAgent

    # ── dispatch ─────────────────────────────────────────────────────────────

    def run(self, dispatches) -> list:
        log = []
        for _log_entry, _snapshot, _placed, _r, _c in self.run_generator(dispatches):
            log.append(_log_entry)
        return log

    def run_generator(self, dispatches, policy=None, ptype="heuristic"):
        """Generator that yields (log_entry, snapshot, placed, r, c) per step."""
        reserved = set()
        scheduler = TimeSpaceScheduler(
            self.terrain.rows, self.terrain.cols, T=len(dispatches) + 100
        )
        self.iot.reset()

        for i, dispatch in enumerate(dispatches):
            # Accept both (truck_id, payload_t) tuples and full dicts
            if isinstance(dispatch, (tuple, list)):
                truck_id, payload_t = dispatch[0], dispatch[1]
                truck_profile = "generic"
            else:
                truck_id     = dispatch["truck_id"]
                payload_t    = dispatch["payload_t"]
                truck_profile = dispatch.get("truck_profile", "generic")

            # Register / retrieve TruckAgent for this truck
            if truck_id not in self._truck_agents:
                from ml.policy import TruckAgent
                self._truck_agents[truck_id] = TruckAgent(truck_id, truck_profile)
            agent = self._truck_agents[truck_id]

            # Update IoT telemetry with truck arrival
            er, ec = self.terrain.entry
            noisy_payload = self.iot.update_truck(truck_id, (er, ec), payload_t, tick=i)

            placed = False
            for _attempt in range(50):
                masker = ConstrainedActionMasker(self.terrain, self.validator)
                action_mask = masker.mask(
                    payload_t, reserved_cells=reserved,
                    include_iso=True, include_path=False,
                )

                if policy is not None:
                    if not action_mask.any():
                        r, c = None, None
                    else:
                        # CTDE: TruckAgent proposes action with IoT-enriched context
                        terrain_map = _build_terrain_map(self.terrain)
                        iot_features = self.iot.get_iot_feature_vector()
                        action = agent.propose_action(
                            terrain_map=terrain_map,
                            payload_t=noisy_payload,
                            material=self.terrain.material,
                            policy=policy,
                            action_masks=action_mask.ravel().copy(),
                            iot_features=iot_features,
                        )
                        r, c = divmod(int(action), self.terrain.cols)
                else:
                    iot_features = self.iot.get_iot_feature_vector()
                    r, c, _ = self.engine.score_all(
                        reserved_cells=reserved, action_mask=action_mask,
                        iot_features=iot_features,
                    )

                if r is None:
                    log_entry = {
                        "t": i, "truck": truck_id, "r": 0, "c": 0,
                        "status": "no_space", "payload_t": payload_t,
                    }
                    yield log_entry, None, placed, None, None
                    break

                safe, reach = self.validator.validate(r, c, payload_t)
                if not safe:
                    reserved.add((r, c))
                    yield {
                        "t": i, "truck": truck_id, "r": int(r), "c": int(c),
                        "status": f"iso_rejected({reach:.2f})",
                        "payload_t": payload_t,
                        "valid_action_count": int(action_mask.sum()),
                    }, None, False, r, c
                    continue

                from planning.pathfinder import find_path
                actual_path = find_path(
                    self.terrain.height, self.terrain.mask,
                    (int(er), int(ec)), (int(r), int(c)),
                )
                if not actual_path:
                    reserved.add((r, c))
                    yield {
                        "t": i, "truck": truck_id, "r": int(r), "c": int(c),
                        "status": "path_unreachable", "payload_t": payload_t,
                    }, None, False, r, c
                    continue

                sched_ok, start_t = scheduler.try_reserve(truck_id, actual_path, t0=i)
                if not sched_ok:
                    reserved.add((r, c))
                    yield {
                        "t": i, "truck": truck_id, "r": int(r), "c": int(c),
                        "status": "sched_rejected", "payload_t": payload_t,
                    }, None, False, r, c
                    continue

                ok, reason = self.terrain.apply_dump(r, c, payload_t)
                status = "dumped" if ok else reason

                if ok:
                    self.validator.record_dump(r, c)
                    scheduler.release(truck_id)
                    reserved.discard((r, c))
                    agent.record_dump()
                    # IoT: log successful dump for latency tracking
                    self.iot.record_dump(truck_id, tick=i)

                    # Periodic SLAM update — apply sensor-noise-aware terrain correction
                    if self.terrain.dump_count % 10 == 0 and hasattr(self.terrain, "simulate_slam_update"):
                        self.terrain.simulate_slam_update()

                log_entry = {
                    "t": i, "truck": truck_id,
                    "r": int(r), "c": int(c),
                    "status": status, "payload_t": payload_t,
                    "volume": self.terrain.total_volume(),
                    "coverage": self.terrain.coverage_fraction(),
                    "valid_action_count": int(action_mask.sum()),
                    "policy_source": ptype,
                    # IoT metrics snapshot at decision time
                    "iot": self.iot.get_fleet_metrics(),
                }
                snapshot = {
                    "dump_n": i, "truck": truck_id,
                    "r": int(r), "c": int(c),
                    "volume": self.terrain.total_volume(),
                    "coverage": self.terrain.coverage_fraction(),
                    "efficiency": self.terrain.packing_efficiency(),
                    "policy": ptype,
                    "surface": self.terrain.to_json_surface(),
                }
                self.snapshots.append(snapshot)
                placed = True
                yield log_entry, snapshot, placed, r, c
                break

            if not placed and (not self.snapshots or True):
                log_entry = {
                    "t": i, "truck": truck_id, "r": 0, "c": 0,
                    "status": "no_space", "payload_t": payload_t,
                }
                yield log_entry, None, placed, None, None

            if not placed:
                reserved.add((r, c) if r is not None else (0, 0))
