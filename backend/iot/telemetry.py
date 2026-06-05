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

        # per-truck state: truck_id → {location, payload_t, active, last_tick}
        self._truck_states: Dict[str, dict] = {}
        # time-stamped dump events for latency estimation
        self._dump_log: List[Dict] = []
        self._tick: int = 0

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

        self._truck_states[truck_id] = {
            "location": (noisy_r, noisy_c),
            "payload_t": noisy_payload,
            "active": True,
            "last_tick": tick,
        }
        self._tick = max(self._tick, tick)
        return noisy_payload

    def record_dump(self, truck_id: str, tick: int) -> None:
        """Called after a successful dump to update activity tracking."""
        self._dump_log.append({"truck_id": truck_id, "tick": tick})
        if truck_id in self._truck_states:
            self._truck_states[truck_id]["active"] = False

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

        return {
            "fleet_congestion": float(fleet_congestion),
            "avg_haul_latency": float(avg_latency),
            "utilization": float(utilization),
            "active_zone_density": float(fleet_congestion),
        }

    def get_iot_feature_vector(self) -> np.ndarray:
        """Returns the normalised IOT_FEATURE_DIM-vector consumed by the ML policy."""
        m = self.get_fleet_metrics()
        latency_norm = min(m["avg_haul_latency"] / max(self.cfg.latency_norm_s, 1.0), 1.0)
        vec = np.array([
            m["fleet_congestion"],
            latency_norm,
            m["utilization"],
            m["active_zone_density"],
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

    @property
    def tick(self) -> int:
        return self._tick

    def __repr__(self) -> str:
        return (
            f"IoTTelemetry(trucks={self.n_trucks}, "
            f"dumps={len(self._dump_log)}, tick={self._tick})"
        )
