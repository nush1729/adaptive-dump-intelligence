import numpy as np
from typing import Tuple

from scipy.ndimage import distance_transform_edt, gaussian_filter1d

from config import MATERIALS as CONFIG_MATERIALS
from environment.dump_physics import apply_dump_to_height
from evaluation.metrics import coverage_fraction, packing_efficiency, site_uniformity, total_volume_m3

MATERIALS = {
    name: {"density": cfg.density_t_per_m3, "name": cfg.name}
    for name, cfg in CONFIG_MATERIALS.items()
}

MATERIAL_COMPATIBILITY = {
    # (dump_material, existing_material) -> penalty multiplier
    # 1.0 = no penalty, 0.0 = incompatible (hard block)
    ("ore", "waste"): 0.0,
    ("waste", "ore"): 0.0,
    ("ore", "coal"): 0.3,
    ("coal", "ore"): 0.3,
}

class Terrain:
    def __init__(self, height: np.ndarray, mask: np.ndarray,
                 entry: Tuple[int, int], material: str = "default"):
        self.height = height
        self.mask = mask
        self.entry = entry
        self.material = material
        self.dump_count = 0
        self.cols = height.shape[1]
        self.rows = height.shape[0]
        # Material segregation: track what material was dumped at each cell
        self.material_map: np.ndarray = np.full((self.rows, self.cols), "", dtype=object)
        # Distance-to-boundary cache — `mask` is fixed for the lifetime of a
        # Terrain (only `height`/`material_map` mutate on dumps), so this EDT
        # only needs computing once instead of redundantly per dispatch/attempt
        # across orchestrator, action_masker, and obs-builder call sites.
        self._dist_to_boundary: np.ndarray | None = None

    @property
    def dist_to_boundary(self) -> np.ndarray:
        if self._dist_to_boundary is None:
            self._dist_to_boundary = distance_transform_edt(self.mask).astype(np.float32)
        return self._dist_to_boundary

    def apply_dump(self, r, c, volume):
        """Apply a dump payload in tonnes at position (r, c)."""
        if not self.mask[r, c]:
            return False, "outside_polygon"

        apply_dump_to_height(self.height, self.mask, int(r), int(c), float(volume), self.material, mutate=True)

        self.dump_count += 1
        # Record material at dump centre for segregation tracking
        self.material_map[r, c] = self.material
        return True, "dumped"

    def simulate_slam_update(self):
        """Simulate real-world SLAM sensor updates and terrain settling."""
        if not self.mask.any():
            return
            
        # Minor Gaussian blur to settle sharp peaks
        h = gaussian_filter1d(self.height, sigma=0.5, axis=0)
        h = gaussian_filter1d(h, sigma=0.5, axis=1)
        
        # Add tiny random noise representing sensor variation
        noise = np.random.normal(0, 0.05, h.shape)
        h += noise * self.mask
        
        # Ensure height doesn't go below 0
        self.height = np.maximum(h, 0.0) * self.mask

    def to_json_surface(self) -> list:
        """Convert height grid to JSON-serializable format"""
        return self.height.tolist()

    def slope_map(self) -> np.ndarray:
        """Compute slope as gradient magnitude"""
        gy, gx = np.gradient(self.height)
        return np.sqrt(gx**2 + gy**2)

    def total_volume(self) -> float:
        """Total dumped volume in masked region"""
        return total_volume_m3(self)

    def coverage_fraction(self) -> float:
        """Fraction of polygon with height > 0.1"""
        return coverage_fraction(self)

    def packing_efficiency(self) -> float:
        """Deposited volume divided by configured feasible site capacity."""
        return packing_efficiency(self)

    def mean_height(self) -> float:
        if not self.mask.any():
            return 0.0
        return float(np.mean(self.height[self.mask]))

    def height_std(self) -> float:
        if not self.mask.any():
            return 0.0
        return float(np.std(self.height[self.mask]))

    def site_uniformity(self) -> float:
        return site_uniformity(self)

    @staticmethod
    def from_height_grid(height: np.ndarray, material: str = "default", entry: Tuple[int, int] | None = None) -> 'Terrain':
        """Build a Terrain from a real (e.g. CSV-uploaded) height-map grid.

        Cells are masked-active wherever the supplied height is finite and
        non-negative — mirrors how a survey/LiDAR export marks "no data" with
        NaN or sentinel negatives outside the site boundary. `entry` defaults
        to the lowest sufficiently-wide row, matching make_demo_polygon's
        dynamic-entry heuristic so live-CSV terrains dispatch identically to
        synthetic ones.
        """
        height = np.asarray(height, dtype=np.float32)
        rows, cols = height.shape
        mask = np.isfinite(height) & (height >= 0)
        height = np.where(mask, height, 0.0).astype(np.float32)

        if entry is None:
            mc = np.argwhere(mask)
            if len(mc) == 0:
                entry = (rows // 2, cols // 2)
            else:
                entry_r = int(mc[0, 0])
                col_mid = int(np.mean(mc[:, 1]))
                for rr in range(rows - 1, -1, -1):
                    if np.sum(mask[rr, :]) >= 15:
                        cols_in_row = np.where(mask[rr, :])[0]
                        entry_r = rr
                        col_mid = int(cols_in_row[len(cols_in_row) // 2])
                        break
                entry = (entry_r, col_mid)

        return Terrain(height, mask, entry, material)

    @staticmethod
    def make_demo_polygon(rows: int, cols: int, material: str, seed: int) -> 'Terrain':
        rng = np.random.default_rng(seed)

        # ── organic radial polygon — every seed produces different shape ──
        n_ctrl = 14
        angles = np.linspace(0, 2 * np.pi, n_ctrl, endpoint=False)
        radii = rng.uniform(28, 44, n_ctrl)
        radii = gaussian_filter1d(radii, sigma=1.5, mode='wrap')

        cx, cy = cols * 0.5, rows * 0.5
        vx = cx + radii * np.cos(angles)
        vy = cy + radii * np.sin(angles)

        # close polygon, clip to grid
        vx = np.clip(np.append(vx, vx[0]), 2, cols - 2)
        vy = np.clip(np.append(vy, vy[0]), 2, rows - 2)

        # rasterise with matplotlib Path
        from matplotlib.path import Path as MplPath
        poly = MplPath(np.column_stack([vx, vy]))
        yi, xi = np.mgrid[0:rows, 0:cols]
        pts = np.column_stack([xi.ravel(), yi.ravel()])
        mask = poly.contains_points(pts).reshape(rows, cols)

        height = np.zeros((rows, cols), dtype=np.float32)

        # ── dynamic entry: bottom-centre of polygon ──
        # ── dynamic entry: lowest stable width ──
        # Find the lowest row that is wide enough to prevent trapped corners
        mc = np.argwhere(mask)
        entry_r = int(mc[0, 0])
        col_mid = int(np.mean(mc[:, 1]))
        
        for rr in range(rows - 1, -1, -1):
            if np.sum(mask[rr, :]) >= 15:
                cols_in_row = np.where(mask[rr, :])[0]
                entry_r = rr
                col_mid = int(cols_in_row[len(cols_in_row) // 2])
                break
        entry = (entry_r, col_mid)
        return Terrain(height, mask, entry, material)
