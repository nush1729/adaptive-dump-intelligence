"""
DumpPackingEnv — gymnasium environment wrapping the ADIOS terrain engine.

State  : (3, ROWS, COLS) float32 tensor
         channel 0 = normalised height map
         channel 1 = polygon mask (0/1)
         channel 2 = distance-to-boundary map (normalised)

Action : flat integer in [0, ROWS*COLS)
         masked to valid polygon cells; invalid actions are penalised

Reward :
  +vol_delta * 0.01          volumetric gain per dump
  +cov_delta * 5.0           coverage improvement bonus
  -iso_penalty * 3.0         isolation event (reachability < threshold)
  -slope_penalty * 2.0       slope violation
  +uniformity_bonus * 2.0    end-of-episode height-uniformity reward
  +10.0                      terminal bonus when coverage > 90%
"""
import numpy as np
import gymnasium as gym
from gymnasium import spaces
import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from environment.terrain import Terrain  # type: ignore
from planning.isolation_validator import IsolationValidator  # type: ignore

from scipy.ndimage import distance_transform_edt

ROWS, COLS = 100, 100

class DumpPackingEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(
        self,
        material: str = "default",
        n_trucks: int = 4,
        payload_t: float = 100.0,
        max_dumps: int = 80,
        iso_threshold: float = 0.85,
        seed_range: tuple = (0, 9999),
        fixed_seed: int = None,
    ):
        super().__init__()
        self.material = material
        self.n_trucks = n_trucks
        self.payload_t = payload_t
        self.max_dumps = max_dumps
        self.iso_threshold = iso_threshold
        self.seed_range = seed_range
        self.fixed_seed = fixed_seed

        # spaces
        self.observation_space = spaces.Box(
            low=0.0, high=1.0, shape=(3, ROWS, COLS), dtype=np.float32
        )
        self.action_space = spaces.Discrete(ROWS * COLS)

        self.terrain = None
        self.validator = None
        self._dump_count = 0
        self._valid_mask_flat = None
        self._prev_vol = 0.0
        self._prev_cov = 0.0

    # ── reset ────────────────────────────────────────────────────────────────
    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        rng_seed = self.fixed_seed
        if rng_seed is None:
            lo, hi = self.seed_range
            rng_seed = int(self.np_random.integers(lo, hi + 1))

        self.terrain = Terrain.make_demo_polygon(ROWS, COLS, self.material, rng_seed)
        self.validator = IsolationValidator(self.terrain, self.terrain.entry, self.iso_threshold)
        self._dump_count = 0
        self._prev_vol = 0.0
        self._prev_cov = 0.0
        self._valid_mask_flat = self.terrain.mask.ravel()
        return self._obs(), {}

    # ── step ─────────────────────────────────────────────────────────────────
    def step(self, action: int):
        r, c = divmod(int(action), COLS)
        reward = 0.0
        terminated = False

        # invalid cell (outside polygon)
        if not self.terrain.mask[r, c]:
            reward = -1.0
            obs = self._obs()
            self._dump_count += 1
            terminated = self._dump_count >= self.max_dumps
            return obs, reward, terminated, False, {}

        # safety check
        safe, reach = self.validator.validate(r, c, self.payload_t)
        if not safe:
            reward -= 1.0   # ERROR 2-C fix: was -3.0, reduced to match vol reward scale
        else:
            ok, reason = self.terrain.apply_dump(r, c, self.payload_t)
            if ok:
                new_vol = self.terrain.total_volume()
                new_cov = self.terrain.coverage_fraction()
                # ERROR 2-C fix: raise vol reward 6x (was 0.008), halve cov reward (was 5.0)
                # Previously iso penalty (-3.0) was 64x the vol reward (0.047) making
                # the policy pathologically conservative.
                reward += (new_vol - self._prev_vol) * 0.05
                reward += (new_cov - self._prev_cov) * 2.0
                self._prev_vol = new_vol
                self._prev_cov = new_cov
            else:
                reward -= 2.0  # slope violation

        self._dump_count += 1
        terminated = self._dump_count >= self.max_dumps

        # terminal bonus (scaled to ≤3× typical step reward to avoid
        # PPO ignoring per-step placement quality)
        if terminated:
            cov = self.terrain.coverage_fraction()
            uni = 1.0 - self.terrain.height_std() / max(self.terrain.mean_height(), 0.01)
            reward += cov * 0.6 + max(0.0, uni) * 0.3

        return self._obs(), reward, terminated, False, {}

    # ── helpers ──────────────────────────────────────────────────────────────
    def _obs(self) -> np.ndarray:
        h = self.terrain.height
        mask = self.terrain.mask.astype(np.float32)
        h_norm = np.clip(h / 15.0, 0.0, 1.0).astype(np.float32)
        dist = distance_transform_edt(self.terrain.mask).astype(np.float32)
        max_d = dist.max() or 1.0
        dist_norm = dist / max_d
        return np.stack([h_norm, mask, dist_norm], axis=0)

    def action_masks(self) -> np.ndarray:
        """Returns bool array of valid actions for masked PPO.

        Vectorised: height saturation via numpy, spacing via cKDTree.
        """
        mask = self._valid_mask_flat.copy().reshape((ROWS, COLS))
        # vectorised height-saturation check
        mask[self.terrain.height >= 15.0] = False
        # vectorised spacing check using cKDTree
        if self._dump_count > 0 and self.validator is not None:
            dumps = np.array(self.validator.dump_history) if self.validator.dump_history else None
            if dumps is not None and len(dumps) > 0:
                from scipy.spatial import cKDTree
                tree = cKDTree(dumps)
                valid_rc = np.argwhere(mask)
                if len(valid_rc) > 0:
                    dists, _ = tree.query(valid_rc, k=1)
                    min_spacing = getattr(self.validator, 'min_spacing', 3)
                    too_close = dists < min_spacing
                    mask[valid_rc[too_close, 0], valid_rc[too_close, 1]] = False
        return mask.ravel()

    def render(self):
        pass
