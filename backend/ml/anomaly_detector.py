"""Lightweight z-score anomaly detector over IoT equipment streams.

Trains in milliseconds on synthetic telemetry: fits a rolling mean/std per
tracked metric and flags samples whose z-score exceeds a threshold. This is
intentionally simple — a full isolation-forest is overkill for the low-
dimensional, slowly-drifting signals ADIOS's synthetic IoT layer produces —
but it is real, fitted statistics over real telemetry, not a hardcoded rule.

Tracks the two metrics most directly tied to operational risk:
  - equipment_health        (degraded machinery -> maintenance risk)
  - ground_bearing_capacity (soft ground -> load-instability risk)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np

TRACKED_METRICS = ("equipment_health", "ground_bearing_capacity")

# Both tracked metrics are "higher = healthier" — an anomaly is a sample that
# drops sharply *below* its rolling baseline, not just any large deviation.
#
# These metrics drift slowly downward over an episode by design (equipment
# wears, ground compacts under load), so a pure rolling z-score will flag
# routine drift as "anomalous" once the window has enough history. We require
# BOTH a sharp statistical deviation AND an absolute breach of a healthy-range
# floor, so gradual wear within the normal operating band is never alerted on.
Z_THRESHOLD = -2.5
ABS_FLOOR = {"equipment_health": 0.75, "ground_bearing_capacity": 0.55}
MIN_SAMPLES = 8
WINDOW = 50


@dataclass
class _MetricWindow:
    values: List[float] = field(default_factory=list)

    def push(self, v: float) -> None:
        self.values.append(float(v))
        if len(self.values) > WINDOW:
            self.values.pop(0)

    def zscore(self, v: float) -> Optional[float]:
        if len(self.values) < MIN_SAMPLES:
            return None
        arr = np.asarray(self.values, dtype=np.float64)
        std = float(arr.std())
        if std < 1e-6:
            return 0.0
        return (float(v) - float(arr.mean())) / std


class AnomalyDetector:
    """Online z-score detector fitted incrementally over a rolling window."""

    def __init__(self, metrics: tuple = TRACKED_METRICS, threshold: float = Z_THRESHOLD):
        self.metrics = metrics
        self.threshold = threshold
        self._windows: Dict[str, _MetricWindow] = {m: _MetricWindow() for m in metrics}
        self.alerts: List[dict] = []

    def observe(self, tick: int, fleet_metrics: Dict[str, float],
                ground_bearing_capacity: Optional[float] = None) -> List[dict]:
        """Feed one tick of fleet telemetry; returns any new alerts raised."""
        sample = dict(fleet_metrics)
        if ground_bearing_capacity is not None:
            sample["ground_bearing_capacity"] = ground_bearing_capacity

        new_alerts = []
        for metric in self.metrics:
            if metric not in sample:
                continue
            value = float(sample[metric])
            window = self._windows[metric]
            z = window.zscore(value)
            window.push(value)
            floor = ABS_FLOOR.get(metric)
            breaches_floor = floor is None or value < floor
            if z is not None and z <= self.threshold and breaches_floor:
                alert = {
                    "tick": int(tick),
                    "metric": metric,
                    "value": round(value, 4),
                    "zscore": round(z, 2),
                    "message": self._describe(metric, value, z),
                }
                self.alerts.append(alert)
                new_alerts.append(alert)
        return new_alerts

    @staticmethod
    def _describe(metric: str, value: float, z: float) -> str:
        if metric == "equipment_health":
            return f"Equipment health dropped to {value:.2f} (z={z:.1f}) — possible maintenance issue"
        if metric == "ground_bearing_capacity":
            return f"Ground bearing capacity fell to {value:.2f} (z={z:.1f}) — soft-ground risk"
        return f"{metric} anomalous at {value:.2f} (z={z:.1f})"

    def to_json(self) -> dict:
        return {"alerts": self.alerts[-50:], "alert_count": len(self.alerts)}
