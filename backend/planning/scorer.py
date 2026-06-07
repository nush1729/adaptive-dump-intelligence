"""
scorer.py — Scoring engine that ranks every candidate dump cell on the terrain.

Each cell gets a composite score from five components:
  volume     — how much material the cell can absorb (payload / density / height)
  coverage   — how much unfilled polygon area this dump reaches
  slope      — penalise cells on steep ground (stability concern)
  isolation  — reward cells that don't fragment the polygon into cut-off sections
  spacing    — penalise cells too close to existing dumps (tighter = higher score)

At runtime, _iot_modulated_weights() scales these weights based on live IoT
telemetry — so the engine adapts without retraining the ML policy.
"""
import numpy as np

from config import DEFAULT_SCORE_WEIGHTS, SITE_CONFIG
from environment.terrain import MATERIAL_COMPATIBILITY

DEFAULT_WEIGHTS = dict(DEFAULT_SCORE_WEIGHTS)


def _iot_modulated_weights(base_weights: dict, iot_features=None) -> dict:
    """Return a copy of base_weights adjusted by real-time IoT metrics.

    IoT feature vector layout (from IoTTelemetry.get_iot_feature_vector):
      [0] fleet_congestion       : fraction of trucks active (0-1)
      [1] haul_latency_norm      : normalised mean haul interval (0-1)
      [2] utilisation            : cumulative dump rate (0-1)
      [3] zone_density           : active zone density (0-1)
      [4] weather_visibility     : site visibility, 1 = clear (0-1)
      [5] equipment_health       : fleet-average equipment health, 1 = perfect (0-1)
      [6] ground_bearing_capacity: soil/pile load-bearing capacity, 1 = firm (0-1)
      [7] queue_length_norm      : entry-queue pressure, normalised (0-1)

    Modulation rules:
    - High fleet congestion (>0.7):  increase spacing weight to spread trucks out
    - Low utilisation (<0.3):        increase coverage weight to fill faster
    - High zone density (>0.6):      increase spacing to avoid cluster collisions
    - Low haul latency (<0.2):       trucks arriving fast, slightly relax coverage
    - Poor visibility (<0.5):        favour cells closer to entry / flatter slope
                                     (raise slope weight, dampen far-reaching coverage)
    - Degraded equipment (<0.7):     prefer gentler slopes and shorter hauls —
                                     raise slope weight to protect worn machines
    - Weak ground bearing (<0.6):    raise slope weight sharply — soft ground under
                                     load risk; avoid stacking onto unstable terrain
    - Long queue (>0.5):             raise coverage weight to spread dumps and
                                     shorten wait times at the active face
    """
    if iot_features is None or len(iot_features) < 4:
        return dict(base_weights)

    w = dict(base_weights)
    congestion   = float(iot_features[0])
    latency_norm = float(iot_features[1])
    utilisation  = float(iot_features[2])
    zone_density = float(iot_features[3])

    # Congestion → spread trucks out more (higher spacing penalty)
    if congestion > 0.7:
        w["spacing"] = w.get("spacing", 3.0) * (1.0 + 0.5 * (congestion - 0.7) / 0.3)

    # Low utilisation → prioritise coverage to fill underused polygon sections
    if utilisation < 0.3:
        w["coverage"] = w.get("coverage", 1.8) * 1.4

    # Dense active zone → push trucks to periphery (raise isolation penalty)
    if zone_density > 0.6:
        w["isolation"] = w.get("isolation", 0.8) * (1.0 + 0.4 * (zone_density - 0.6) / 0.4)

    # Fast truck arrival (low latency) → slightly relax coverage greed
    if latency_norm < 0.2:
        w["coverage"] = w.get("coverage", 1.8) * 0.85

    # ── Phase 2 synthetic channels ───────────────────────────────────────────
    if len(iot_features) >= 8:
        visibility    = float(iot_features[4])
        equip_health  = float(iot_features[5])
        ground_bearing = float(iot_features[6])
        queue_norm    = float(iot_features[7])

        # Poor visibility → favour safer, closer, flatter cells over far coverage
        if visibility < 0.5:
            w["slope"] = w.get("slope", 0.5) * (1.0 + 0.6 * (0.5 - visibility) / 0.5)
            w["coverage"] = w.get("coverage", 1.8) * 0.8

        # Degraded fleet equipment → bias toward gentler terrain to reduce strain
        if equip_health < 0.7:
            w["slope"] = w.get("slope", 0.5) * (1.0 + 0.5 * (0.7 - equip_health) / 0.7)

        # Weak ground bearing capacity → strongly avoid steep / soft cells
        if ground_bearing < 0.6:
            w["slope"] = w.get("slope", 0.5) * (1.0 + 0.8 * (0.6 - ground_bearing) / 0.6)

        # Long entry queue → spread dumps to relieve congestion at the active face
        if queue_norm > 0.5:
            w["coverage"] = w.get("coverage", 1.8) * (1.0 + 0.3 * (queue_norm - 0.5) / 0.5)

    return w


def explain_modulation(base_weights: dict, iot_features=None) -> dict:
    """Return a structured "why this cell" explanation: which weights the live
    IoT feed nudged, by how much (%), and the plain-language trigger for each.

    This re-derives exactly the same deltas _iot_modulated_weights() applies —
    it's a transparent readout of the real modulation the scorer used, not a
    separate/cosmetic computation.
    """
    modulated = _iot_modulated_weights(base_weights, iot_features)
    deltas = []
    for key, base_v in base_weights.items():
        mod_v = modulated.get(key, base_v)
        if abs(mod_v - base_v) > 1e-9 and base_v != 0:
            pct = (mod_v - base_v) / abs(base_v) * 100.0
            deltas.append({
                "weight": key,
                "base": round(float(base_v), 4),
                "modulated": round(float(mod_v), 4),
                "pct_change": round(float(pct), 1),
            })

    triggers = []
    if iot_features is not None and len(iot_features) >= 4:
        congestion   = float(iot_features[0])
        latency_norm = float(iot_features[1])
        utilisation  = float(iot_features[2])
        zone_density = float(iot_features[3])
        if congestion > 0.7:
            triggers.append(f"high fleet congestion ({congestion:.0%}) → spacing weight raised to spread trucks out")
        if utilisation < 0.3:
            triggers.append(f"low utilisation ({utilisation:.0%}) → coverage weight raised to fill faster")
        if zone_density > 0.6:
            triggers.append(f"dense active zone ({zone_density:.0%}) → isolation weight raised to push trucks to periphery")
        if latency_norm < 0.2:
            triggers.append(f"fast truck arrival (latency {latency_norm:.0%}) → coverage weight relaxed slightly")
        if len(iot_features) >= 8:
            visibility     = float(iot_features[4])
            equip_health   = float(iot_features[5])
            ground_bearing = float(iot_features[6])
            queue_norm     = float(iot_features[7])
            if visibility < 0.5:
                triggers.append(f"poor visibility ({visibility:.0%}) → favouring closer/flatter cells (slope weight up, coverage down)")
            if equip_health < 0.7:
                triggers.append(f"degraded equipment ({equip_health:.0%} health) → slope weight raised to protect worn machines")
            if ground_bearing < 0.6:
                triggers.append(f"weak ground bearing ({ground_bearing:.0%}) → slope weight sharply raised to avoid soft ground")
            if queue_norm > 0.5:
                triggers.append(f"long entry queue ({queue_norm:.0%}) → coverage weight raised to spread dumps")

    return {"deltas": deltas, "triggers": triggers}


class ScoringEngine:
    def __init__(self, terrain, entry, weights=None):
        self.terrain = terrain
        self.entry = entry
        self.weights = weights or DEFAULT_WEIGHTS

    def score_all(self, reserved_cells=None, action_mask=None, iot_features=None):
        """Compute score map and return (best_r, best_c, score_map).

        Args:
            reserved_cells: optional set of (r,c) tuples to exclude
        Returns:
            (best_r, best_c, score_map) — best_r/c are None when no
            valid cell remains.
        """
        terrain = self.terrain
        mask = terrain.mask
        rows, cols = mask.shape

        score_map = np.full((rows, cols), np.nan)
        if not mask.any():
            return None, None, score_map

        # Apply IoT-adaptive weight modulation
        active_weights = _iot_modulated_weights(self.weights, iot_features)

        # distance to entry
        er, ec = self.entry
        ri = np.arange(rows)[:, None]
        ci = np.arange(cols)[None, :]
        dist_penalty = np.sqrt((ri - er)**2 + (ci - ec)**2) / (rows + cols)

        # slope penalty
        slope = terrain.slope_map()
        slope_penalty = slope / (np.max(slope) + 1e-6)

        # height penalty (already-filled cells score lower)
        height_norm = terrain.height / (np.max(terrain.height) + 1e-6)

        # material segregation penalty: vectorised via material_map
        segregation_penalty = np.zeros((rows, cols))
        if hasattr(terrain, 'material_map') and terrain.material_map is not None:
            current_mat = terrain.material
            existing_mat = terrain.material_map
            has_other = (existing_mat != "") & (existing_mat != current_mat)
            if has_other.any():
                for r_idx, c_idx in zip(*np.where(has_other)):
                    ex = terrain.material_map[r_idx, c_idx]
                    compat = MATERIAL_COMPATIBILITY.get((current_mat, ex), 1.0)
                    segregation_penalty[r_idx, c_idx] = 1.0 - compat

        # spacing penalty: prefer cells near staffed spacing target from existing piles
        w_dist = active_weights.get('coverage', 1.8)
        w_slope = active_weights.get('slope', 0.5)
        w_height = active_weights.get('volume', 1.5)
        w_seg = active_weights.get('isolation', DEFAULT_WEIGHTS['isolation'])
        w_spacing = active_weights.get('spacing', 3.0)

        pile_present = (terrain.height > SITE_CONFIG.pile_detection_threshold_m)
        if pile_present.any():
            from scipy.ndimage import distance_transform_edt as _edt
            dist_to_pile = _edt(~pile_present).astype(np.float32)
            target_s = SITE_CONFIG.staffed_spacing_cells
            sigma_s = target_s * 0.6
            # penalty = 0 at ideal spacing, approaches 1 when too close or too far
            spacing_penalty = (1.0 - np.exp(-0.5 * ((dist_to_pile - target_s) / sigma_s) ** 2)).astype(np.float32)
        else:
            spacing_penalty = np.zeros((rows, cols), dtype=np.float32)

        scores = 1.0 / (1.0 + w_dist * dist_penalty + w_slope * slope_penalty + w_height * height_norm + w_seg * segregation_penalty + w_spacing * spacing_penalty)
        valid_mask = mask if action_mask is None else (mask & action_mask)
        score_map = np.where(valid_mask, scores, np.nan)

        # normalise to [0, 1]
        valid = score_map[np.isfinite(score_map)]
        if len(valid) > 0:
            lo, hi = np.min(valid), np.max(valid)
            if hi > lo:
                score_map = np.where(np.isfinite(score_map),
                                     (score_map - lo) / (hi - lo), np.nan)

        # block reserved cells
        if reserved_cells:
            for (br, bc) in reserved_cells:
                score_map[br, bc] = np.nan

        # find best valid cell
        ok = np.isfinite(score_map) & valid_mask
        if ok.any():
            masked = np.where(ok, score_map, -np.inf)
            flat = int(np.argmax(masked))
            best_r, best_c = divmod(flat, cols)
            return int(best_r), int(best_c), score_map

        return None, None, score_map
