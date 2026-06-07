"""
IoTTelemetry — simulates the sensor layer between the physical mine and the
ADIOS Digital Twin.

Closed-loop data flow:
  Physical Mine → IoT sensors → IoTTelemetry → Digital Twin → ML Policy → Decisions

In production this class would consume a real-time message bus (MQTT / Kafka).
For simulation it injects configurable noise onto synthetic readings so the
model trains and infers against realistic sensor uncertainty.
"""
from __future__ import annotations

import numpy as np
from typing import Dict, List, Optional, Tuple
import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from config import IOT_CONFIG, IoTConfig, IOT_FEATURE_DIM


class IoTTelemetry:
    """
    Fleet-wide IoT telemetry aggregator.

    Tracks per-truck state (GPS position, payload, activity) and derives
    fleet-level metrics that the ML policy uses as additional context:

      fleet_congestion    — fraction of trucks currently active / in transit
      avg_haul_latency    — mean inter-dump interval (normalised)
      utilization         — cumulative dump density vs. elapsed ticks
      active_zone_density — fraction of trucks in active dumping state

    Sensor noise is injected at update() time so all downstream consumers
    automatically see realistic uncertainty.
    """

    def __init__(self, n_trucks: int, cfg: Optional[IoTConfig] = None, seed: int = 0):
        self.n_trucks = max(n_trucks, 1)
        self.cfg = cfg or IOT_CONFIG
        self._rng = np.random.default_rng(seed)

        # per-truck state: truck_id → {location, payload_t, active, last_tick,
        # equipment_health, dump_count}
        self._truck_states: Dict[str, dict] = {}
        # time-stamped dump events for latency estimation
        self._dump_log: List[Dict] = []
        self._tick: int = 0

        # ── Phase 2 synthetic sensor state ───────────────────────────────────
        # Site-wide weather visibility — slow random walk (OU-style) in [min, 1].
        self._weather_visibility: float = self.cfg.weather_visibility_base
        # Trucks currently queued at the active dump entry.
        self._queue_length: int = 0

    # ── update ────────────────────────────────────────────────────────────────

    def update_truck(
        self,
        truck_id: str,
        location: Tuple[int, int],
        payload_t: float,
        tick: int,
    ) -> float:
        """Register a truck arrival / state update.  Returns noisy payload reading."""
        noisy_payload = float(payload_t) * (
            1.0 + float(self._rng.normal(0.0, self.cfg.payload_noise_pct))
        )
        # GPS noise (not used by ML directly but available for logging)
        r, c = location
        noisy_r = r + float(self._rng.normal(0.0, self.cfg.gps_noise_m))
        noisy_c = c + float(self._rng.normal(0.0, self.cfg.gps_noise_m))

        prev = self._truck_states.get(truck_id)
        health = prev["equipment_health"] if prev else self.cfg.equipment_health_init
        # Idle recovery between updates (maintenance / cooldown), bounded to 1.0
        health = min(1.0, health + self.cfg.equipment_health_recovery)
        health = float(np.clip(
            health + self._rng.normal(0.0, self.cfg.equipment_health_noise), 0.0, 1.0
        ))

        self._truck_states[truck_id] = {
            "location": (noisy_r, noisy_c),
            "payload_t": noisy_payload,
            "active": True,
            "last_tick": tick,
            "equipment_health": health,
            "dump_count": prev["dump_count"] if prev else 0,
        }
        self._tick = max(self._tick, tick)
        return noisy_payload

    def record_dump(self, truck_id: str, tick: int) -> None:
        """Called after a successful dump to update activity tracking."""
        self._dump_log.append({"truck_id": truck_id, "tick": tick})
        if truck_id in self._truck_states:
            state = self._truck_states[truck_id]
            state["active"] = False
            state["dump_count"] = state.get("dump_count", 0) + 1
            # Each dump cycle wears equipment down slightly (load-bearing stress).
            state["equipment_health"] = float(np.clip(
                state.get("equipment_health", self.cfg.equipment_health_init)
                - self.cfg.equipment_health_wear_per_dump,
                0.0, 1.0,
            ))

    def step_environment(self, queue_length: Optional[int] = None) -> None:
        """Advance site-wide synthetic sensors by one tick.

        Call once per simulation tick to evolve weather visibility (slow
        random walk) and record the current entry-queue length. Both feed
        the IoT feature vector and the heuristic scoring modulation.
        """
        drift = float(self._rng.normal(0.0, self.cfg.weather_visibility_drift))
        self._weather_visibility = float(np.clip(
            self._weather_visibility + drift,
            self.cfg.weather_visibility_min, 1.0,
        ))
        if queue_length is not None:
            self._queue_length = max(int(queue_length), 0)
        else:
            # Fall back to active-truck count as a proxy for queue pressure.
            self._queue_length = sum(
                1 for s in self._truck_states.values() if s.get("active", False)
            )

    def gps_location(self, truck_id: str) -> Optional[Tuple[float, float]]:
        """Return the last noisy GPS reading (row, col) recorded for a truck.

        Surfaces the sensor-noise model end-to-end — the same noisy fix
        stored at update_truck() time, available for audit/log display.
        """
        state = self._truck_states.get(truck_id)
        if state is None:
            return None
        loc = state.get("location")
        return (round(loc[0], 3), round(loc[1], 3)) if loc else None

    def ground_bearing_capacity(self, local_height_m: float) -> float:
        """Estimate ground bearing capacity (0-1) under a candidate dump cell.

        Taller existing piles mean softer / less consolidated ground beneath —
        bearing capacity drops roughly linearly with local pile height, plus
        sensor noise. Used to flag cells where dumping risks truck instability.
        """
        capacity = self.cfg.ground_bearing_base - self.cfg.ground_bearing_height_penalty * max(local_height_m, 0.0)
        capacity += float(self._rng.normal(0.0, self.cfg.ground_bearing_noise))
        return float(np.clip(capacity, 0.0, 1.0))

    # ── metrics ───────────────────────────────────────────────────────────────

    def get_fleet_metrics(self) -> Dict[str, float]:
        """Compute real-time fleet KPIs from buffered telemetry."""
        active_count = sum(
            1 for s in self._truck_states.values() if s.get("active", False)
        )
        fleet_congestion = active_count / self.n_trucks

        # average inter-dump latency — configurable rolling window (param 11)
        try:
            from config import SITE_CONFIG as _SC
            _window = _SC.iot_haul_latency_window
        except Exception:
            _window = 20
        if len(self._dump_log) >= 2:
            recent_ticks = [d["tick"] for d in self._dump_log[-_window:]]
            intervals = [t2 - t1 for t1, t2 in zip(recent_ticks, recent_ticks[1:])]
            avg_latency = float(np.mean(intervals))
        else:
            avg_latency = 0.0

        # throughput utilisation
        elapsed = max(self._tick + 1, 1)
        utilization = min(len(self._dump_log) / elapsed, 1.0)

        # Fleet-average equipment health (defaults to "healthy" with no trucks yet).
        healths = [s.get("equipment_health", self.cfg.equipment_health_init)
                   for s in self._truck_states.values()]
        avg_equipment_health = float(np.mean(healths)) if healths else self.cfg.equipment_health_init

        return {
            "fleet_congestion": float(fleet_congestion),
            "avg_haul_latency": float(avg_latency),
            "utilization": float(utilization),
            "active_zone_density": float(fleet_congestion),
            "weather_visibility": float(self._weather_visibility),
            "equipment_health": avg_equipment_health,
            "queue_length": int(self._queue_length),
        }

    def get_iot_feature_vector(self, local_height_m: float = 0.0) -> np.ndarray:
        """Returns the normalised IOT_FEATURE_DIM-vector consumed by the ML policy.

        `local_height_m` lets callers fold the candidate cell's pile height into
        the ground-bearing estimate (defaults to 0 = bare ground reading).
        """
        m = self.get_fleet_metrics()
        latency_norm = min(m["avg_haul_latency"] / max(self.cfg.latency_norm_s, 1.0), 1.0)
        queue_norm = min(m["queue_length"] / max(self.cfg.queue_norm_cap, 1e-6), 1.0)
        vec = np.array([
            m["fleet_congestion"],
            latency_norm,
            m["utilization"],
            m["active_zone_density"],
            m["weather_visibility"],
            m["equipment_health"],
            self.ground_bearing_capacity(local_height_m),
            queue_norm,
        ], dtype=np.float32)
        assert vec.shape == (IOT_FEATURE_DIM,)
        return vec

    # ── terrain noise ─────────────────────────────────────────────────────────

    def inject_terrain_noise(self, height_map: np.ndarray) -> np.ndarray:
        """Apply SLAM-style sensor noise to a terrain height grid.

        Adds Gaussian noise at configured height_noise_m sigma.  Used to keep
        the Digital Twin consistent with what on-board sensors would observe.
        """
        noise = self._rng.normal(0.0, self.cfg.height_noise_m, size=height_map.shape)
        return np.clip(height_map.astype(np.float32) + noise.astype(np.float32), 0.0, None)

    # ── helpers ───────────────────────────────────────────────────────────────

    def reset(self) -> None:
        """Clear all telemetry state (call between simulation episodes)."""
        self._truck_states.clear()
        self._dump_log.clear()
        self._tick = 0
        self._weather_visibility = self.cfg.weather_visibility_base
        self._queue_length = 0

    @property
    def tick(self) -> int:
        return self._tick

    def __repr__(self) -> str:
        return (
            f"IoTTelemetry(trucks={self.n_trucks}, "
            f"dumps={len(self._dump_log)}, tick={self._tick})"
        )
