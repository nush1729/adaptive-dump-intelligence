"""
DumpPackingEnv — Physics & IoT-Informed RL environment for autonomous dump packing.

Observation (Dict):
  terrain_map    : (5, ROWS, COLS) float32
                   channel 0 = normalised height map
                   channel 1 = polygon mask (0/1)
                   channel 2 = distance-to-boundary map (normalised)
                   channel 3 = pile detection mask (cells with height > pile_threshold)
                   channel 4 = spacing density map (local dump density, smoothed)
  context_vector : (CONTEXT_DIM,) float32
                   [0:4]  truck type one-hot (N_TRUCK_TYPES categories)
                   [4]    payload_t normalised (/ MAX_PAYLOAD_T)
                   [5]    truck dump-count normalised (/ 100)
                   [6]    material density normalised
                   [7]    material compaction rate normalised
                   [8]    material angle-of-repose normalised
                   [9]    IoT fleet congestion (0-1)
                   [10]   IoT haul latency normalised
                   [11]   IoT utilisation (0-1)
                   [12]   IoT active-zone density (0-1)

Action : flat integer in [0, ROWS*COLS)
         masked to valid polygon cells; invalid actions are penalised

Reward (shaped for dense packing near staffed-op density):
  +vol_delta * 0.05              volumetric gain per dump
  +cov_delta * 2.0               coverage improvement bonus
  +spacing_bonus(r,c)            reward for tight-but-valid spacing (closing gap to staffed ops)
  +uniformity_delta * 1.5        incremental uniformity improvement
  -spacing_penalty(r,c)          penalise over-sparse placement
  -1.0                           invalid cell (outside polygon)
  -1.0                           isolation constraint violation
  -2.0                           slope violation
  -0.5                           turning-radius violation (dump inaccessible by current truck)
  terminal bonus: cov*0.6 + uniformity*0.4 + density_score*0.3
"""
import numpy as np
import gymnasium as gym
from gymnasium import spaces
import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from environment.terrain import Terrain
from planning.isolation_validator import IsolationValidator
from planning.action_masker import ConstrainedActionMasker
from config import (
    SITE_CONFIG, MATERIALS, material_config,
    TRUCK_PROFILES, N_TRUCK_TYPES, MAX_PAYLOAD_T, CONTEXT_DIM,
)

from scipy.ndimage import distance_transform_edt, gaussian_filter

ROWS, COLS = SITE_CONFIG.rows, SITE_CONFIG.cols

STAFFED_SPACING_CELLS: float = SITE_CONFIG.staffed_spacing_cells
AUTONOMOUS_SPACING_CELLS: float = SITE_CONFIG.autonomous_spacing_cells
PILE_THRESHOLD_M: float = SITE_CONFIG.pile_detection_threshold_m

_TRUCK_PROFILE_NAMES = list(TRUCK_PROFILES.keys())


def build_context_vector(
    truck_profile_name: str,
    payload_t: float,
    truck_dump_count: int,
    material: str,
    iot_features: np.ndarray,
) -> np.ndarray:
    """Build the CONTEXT_DIM-length context vector for one truck dispatch.

    Shared helper used by DumpPackingEnv (training) and TruckAgent (CTDE inference)
    so training and inference see identical feature representations.
    """
    profile = TRUCK_PROFILES.get(truck_profile_name, TRUCK_PROFILES["generic"])
    mat = material_config(material)

    type_vec = np.zeros(N_TRUCK_TYPES, dtype=np.float32)
    type_vec[profile.type_index] = 1.0

    payload_norm = float(payload_t) / MAX_PAYLOAD_T
    dump_norm = min(float(truck_dump_count) / 100.0, 1.0)

    density_norm = (mat.density_t_per_m3 - 1.0) / 2.0
    compaction_norm = 1.0 - SITE_CONFIG.compaction_floor
    angle_norm = mat.angle_of_repose_deg / 45.0

    ctx = np.concatenate([
        type_vec,
        [payload_norm, dump_norm, density_norm, compaction_norm, angle_norm],
        iot_features.astype(np.float32),
    ]).astype(np.float32)
    return ctx


def _compute_pile_mask(height: np.ndarray) -> np.ndarray:
    """Binary mask: 1 where a pile exists (height > threshold)."""
    return (height > PILE_THRESHOLD_M).astype(np.float32)


def _compute_spacing_density(height: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """
    Local dump density map: smoothed pile presence.
    High values = crowded area, low values = sparse area.
    Used by reward function and as observation channel.
    """
    pile_mask = (height > PILE_THRESHOLD_M).astype(np.float32)
    pile_mask *= mask.astype(np.float32)
    density = gaussian_filter(pile_mask, sigma=STAFFED_SPACING_CELLS)
    max_d = density.max()
    if max_d > 0:
        density /= max_d
    return density.astype(np.float32)


def _turning_radius_accessible(terrain, r: int, c: int, profile_name: str) -> bool:
    """
    Check if truck with given turning radius can reach cell (r,c) from entry.
    Approximation: ensure a corridor of width >= turning_radius_cells exists
    along the path from entry to target. Uses distance-transform heuristic.
    """
    profile = TRUCK_PROFILES.get(profile_name, TRUCK_PROFILES["generic"])
    turning_radius_cells = profile.turning_radius_m  # 1m² cells → direct mapping
    dist_to_boundary = distance_transform_edt(terrain.mask)
    if dist_to_boundary[r, c] < turning_radius_cells * 0.5:
        return False
    return True


class DumpPackingEnv(gym.Env):
    metadata = {"render_modes": []}

    # New 5-channel terrain map (added pile detection + spacing density)
    N_TERRAIN_CHANNELS: int = 5

    def __init__(
        self,
        material: str = "default",
        n_trucks: int = 4,
        payload_t: float = SITE_CONFIG.training_payload_t,
        max_dumps: int = 80,
        iso_threshold: float = SITE_CONFIG.iso_threshold,
        seed_range: tuple = (0, 9999),
        fixed_seed: int = None,
        truck_profiles: list = None,
        curriculum_stage: int = 0,
    ):
        super().__init__()
        self.material = material
        self.n_trucks = n_trucks
        self.payload_t = payload_t
        self.max_dumps = max_dumps
        self.iso_threshold = iso_threshold
        self.seed_range = seed_range
        self.fixed_seed = fixed_seed
        self.truck_profiles = truck_profiles or _TRUCK_PROFILE_NAMES
        # 0=easy (large polygon, few trucks), 1=medium, 2=hard (mixed fleet, irregular shapes)
        self.curriculum_stage = curriculum_stage

        self.observation_space = spaces.Dict({
            "terrain_map": spaces.Box(
                low=0.0, high=1.0,
                shape=(self.N_TERRAIN_CHANNELS, ROWS, COLS),
                dtype=np.float32
            ),
            "context_vector": spaces.Box(
                low=-0.1, high=1.1, shape=(CONTEXT_DIM,), dtype=np.float32
            ),
        })
        self.action_space = spaces.Discrete(ROWS * COLS)

        self.terrain = None
        self.validator = None
        self._dump_count = 0
        self._valid_mask_flat = None
        self._prev_vol = 0.0
        self._prev_cov = 0.0
        self._prev_uniformity = 0.0
        self._truck_idx = 0
        self._truck_dump_counts = {}
        self._dump_positions = []  # track placed dump centres for spacing reward

    # ── reset ────────────────────────────────────────────────────────────────
    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        rng_seed = self.fixed_seed
        if rng_seed is None:
            lo, hi = self.seed_range
            rng_seed = int(self.np_random.integers(lo, hi + 1))

        # Curriculum: easier seeds have rounder polygons (lower variance in radius)
        self.terrain = Terrain.make_demo_polygon(ROWS, COLS, self.material, rng_seed)
        self.validator = IsolationValidator(
            self.terrain, self.terrain.entry, self.iso_threshold
        )
        self._dump_count = 0
        self._prev_vol = 0.0
        self._prev_cov = 0.0
        self._prev_uniformity = 0.0
        self._valid_mask_flat = self.terrain.mask.ravel()
        self._truck_idx = 0
        self._truck_dump_counts = {name: 0 for name in self.truck_profiles}
        self._dump_positions = []
        return self._obs(), {}

    # ── step ─────────────────────────────────────────────────────────────────
    def step(self, action: int):
        r, c = divmod(int(action), COLS)
        reward = 0.0
        terminated = False

        # Out-of-polygon penalty
        if not self.terrain.mask[r, c]:
            reward = -1.0
            self._dump_count += 1
            terminated = self._dump_count >= self.max_dumps
            return self._obs(), reward, terminated, False, {}

        # Turning-radius accessibility check
        profile_name = self.truck_profiles[self._truck_idx % len(self.truck_profiles)]
        if not _turning_radius_accessible(self.terrain, r, c, profile_name):
            reward -= 0.5

        # Isolation constraint
        safe, reach = self.validator.validate(r, c, self.payload_t)
        if not safe:
            reward -= 1.0
        else:
            ok, reason = self.terrain.apply_dump(r, c, self.payload_t)
            if ok:
                new_vol = self.terrain.total_volume()
                new_cov = self.terrain.coverage_fraction()

                # Volume + coverage (base signals — reduced so spacing reward dominates)
                reward += (new_vol - self._prev_vol) * 0.02
                reward += (new_cov - self._prev_cov) * 1.5

                # Uniformity shaping
                new_uni = self._compute_uniformity()
                reward += max(0.0, new_uni - self._prev_uniformity) * 1.0
                self._prev_uniformity = new_uni

                # Spacing density reward: tighter Gaussian, higher magnitude
                spacing_r = self._spacing_reward(r, c)
                reward += spacing_r

                # Milestone bonuses at 25/50/75% of max_dumps
                n_total = self.max_dumps
                for pct in [0.25, 0.5, 0.75]:
                    checkpoint = int(n_total * pct)
                    if self._dump_count == checkpoint and len(self._dump_positions) > 4:
                        cur_mean = self._mean_pairwise_spacing()
                        gap = (AUTONOMOUS_SPACING_CELLS - cur_mean) / max(AUTONOMOUS_SPACING_CELLS - STAFFED_SPACING_CELLS, 1.0)
                        reward += max(0.0, gap) * 1.5

                self._prev_vol = new_vol
                self._prev_cov = new_cov
                self._dump_positions.append((r, c))

                cur_profile = self.truck_profiles[self._truck_idx % len(self.truck_profiles)]
                self._truck_dump_counts[cur_profile] = (
                    self._truck_dump_counts.get(cur_profile, 0) + 1
                )
                self._truck_idx += 1
            else:
                reward -= 2.0  # slope violation

        self._dump_count += 1
        terminated = self._dump_count >= self.max_dumps

        if terminated:
            cov = self.terrain.coverage_fraction()
            uni = self._compute_uniformity()
            density_score = self._packing_density_score()
            # Increased density weight — critical for spacing gap closure
            reward += cov * 0.5 + max(0.0, uni) * 0.3 + density_score * 0.8

        return self._obs(), reward, terminated, False, {}

    # ── reward helpers ────────────────────────────────────────────────────────

    def _spacing_reward(self, r: int, c: int) -> float:
        """
        Reward tight packing approaching staffed-operation density.

        Three-part reward:
        1. Gaussian peak at STAFFED_SPACING_CELLS (σ=1.0, sharper than before)
        2. Pile-proximity bonus: extra reward for dumping adjacent to an existing
           pile (semantic segmentation use-case — truck recognises pile and gets
           close, like a staffed operator would)
        3. Hard penalties: over-sparse (> autonomous baseline) and too-close
           (< 2 cells, truck-body collision risk)
        """
        if not self._dump_positions:
            return 0.0

        recent = self._dump_positions[-8:]
        dists = [np.sqrt((r - pr) ** 2 + (c - pc) ** 2) for pr, pc in recent]
        nearest = min(dists)
        target = STAFFED_SPACING_CELLS

        # 1. Sharper Gaussian — peaks at staffed spacing
        sigma = 1.0
        reward = 1.4 * np.exp(-0.5 * ((nearest - target) / sigma) ** 2)

        # 2. Pile-proximity bonus: extra +0.6 if dumping within 1 cell of existing pile
        #    (encourages the model to behave like a staffed operator who edges up to piles)
        h = self.terrain.height
        pile_present = h > PILE_THRESHOLD_M
        r_lo, r_hi = max(0, r - 1), min(h.shape[0] - 1, r + 1)
        c_lo, c_hi = max(0, c - 1), min(h.shape[1] - 1, c + 1)
        if pile_present[r_lo:r_hi+1, c_lo:c_hi+1].any():
            reward += 0.6

        # 3. Distribution penalty: mean of 4 nearest recent dumps still too sparse
        if len(dists) >= 3:
            mean_near = float(np.mean(sorted(dists)[:4]))
            if mean_near > AUTONOMOUS_SPACING_CELLS * 0.85:
                reward -= 0.5 * (mean_near / AUTONOMOUS_SPACING_CELLS)

        # 4. Hard linear penalty for over-sparse
        if nearest > AUTONOMOUS_SPACING_CELLS:
            reward -= min(2.0, 0.4 * (nearest - AUTONOMOUS_SPACING_CELLS))

        # 5. Dangerous proximity penalty
        if nearest < 2.0:
            reward -= 0.8

        return float(reward)

    def _mean_pairwise_spacing(self) -> float:
        """Mean spacing of last 20 dump positions (used for milestone bonuses)."""
        if len(self._dump_positions) < 2:
            return float(AUTONOMOUS_SPACING_CELLS)
        pos = np.array(self._dump_positions[-20:])
        dists = []
        for i in range(len(pos)):
            for j in range(i + 1, min(i + 5, len(pos))):
                dists.append(float(np.sqrt(((pos[i] - pos[j]) ** 2).sum())))
        return float(np.mean(dists)) if dists else AUTONOMOUS_SPACING_CELLS

    def _compute_uniformity(self) -> float:
        h = self.terrain.height
        mask = self.terrain.mask
        vals = h[mask]
        if len(vals) == 0 or vals.mean() < 1e-6:
            return 0.0
        return float(1.0 - vals.std() / max(vals.mean(), 1e-6))

    def _packing_density_score(self) -> float:
        """
        Score how close we got to staffed packing density.
        Ratio: (filled cells / total masked cells) weighted by local spacing.
        """
        n_filled = int((self.terrain.height[self.terrain.mask] > PILE_THRESHOLD_M).sum())
        n_total = int(self.terrain.mask.sum())
        if n_total == 0:
            return 0.0
        fill_ratio = n_filled / n_total

        # Penalise if mean spacing is still >> staffed target
        if len(self._dump_positions) >= 2:
            positions = np.array(self._dump_positions)
            from sklearn.neighbors import KDTree
            try:
                tree = KDTree(positions)
                dists, _ = tree.query(positions, k=2)
                mean_spacing = float(dists[:, 1].mean())
                spacing_factor = min(1.0, STAFFED_SPACING_CELLS / max(mean_spacing, 1.0))
            except Exception:
                spacing_factor = 0.5
        else:
            spacing_factor = 0.5

        return fill_ratio * spacing_factor

    # ── observation builder ────────────────────────────────────────────────────
    def _obs(self) -> dict:
        h = self.terrain.height
        mask = self.terrain.mask.astype(np.float32)
        h_norm = np.clip(h / SITE_CONFIG.max_height_m, 0.0, 1.0).astype(np.float32)

        dist = distance_transform_edt(self.terrain.mask).astype(np.float32)
        dist_norm = dist / (dist.max() or 1.0)

        # Channel 3: pile detection (semantic segmentation — where piles are)
        pile_mask = _compute_pile_mask(h)

        # Channel 4: spacing density (how crowded nearby cells are)
        spacing_density = _compute_spacing_density(h, self.terrain.mask)

        terrain_map = np.stack(
            [h_norm, mask, dist_norm, pile_mask, spacing_density], axis=0
        )

        profile_name = self.truck_profiles[self._truck_idx % len(self.truck_profiles)]
        truck_dump_count = self._truck_dump_counts.get(profile_name, 0)

        progress = self._dump_count / max(self.max_dumps, 1)
        rng = self.np_random if self.np_random else np.random.default_rng(42)
        iot = np.array([
            min(progress * 1.5, 1.0),
            float(rng.uniform(0.0, 0.6)),
            progress,
            min(progress * 1.2, 1.0),
        ], dtype=np.float32)

        context = build_context_vector(
            profile_name, self.payload_t, truck_dump_count,
            self.terrain.material, iot,
        )
        return {"terrain_map": terrain_map, "context_vector": context}

    def action_masks(self) -> np.ndarray:
        masker = ConstrainedActionMasker(self.terrain, self.validator, self.iso_threshold)
        return masker.mask(self.payload_t, include_iso=True, include_path=False).ravel()

    def render(self):
        pass
