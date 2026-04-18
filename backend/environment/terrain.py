import numpy as np
from typing import Tuple
from scipy.ndimage import gaussian_filter1d

MATERIALS = {
    "default": {"density": 1.8, "name": "Default"},
    "coal": {"density": 1.3, "name": "Coal"},
    "ore": {"density": 2.5, "name": "Ore"},
    "waste": {"density": 1.6, "name": "Waste"},
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

    def apply_dump(self, r, c, volume):
        """Apply a dump at position (r, c) and return (success, reason)"""
        if not self.mask[r, c]:
            return False, "outside_polygon"
        self.height[r, c] += volume
        self.dump_count += 1
        return True, "dumped"

    def to_json_surface(self) -> list:
        """Convert height grid to JSON-serializable format"""
        return self.height.tolist()

    def slope_map(self) -> np.ndarray:
        """Compute slope as gradient magnitude"""
        gy, gx = np.gradient(self.height)
        return np.sqrt(gx**2 + gy**2)

    def total_volume(self) -> float:
        """Total dumped volume in masked region"""
        return float(np.sum(self.height[self.mask]))

    def coverage_fraction(self) -> float:
        """Fraction of polygon with height > 0.1"""
        if not self.mask.any():
            return 0.0
        filled = np.sum(self.height[self.mask] > 0.1)
        total = np.sum(self.mask)
        return filled / max(total, 1)

    def packing_efficiency(self) -> float:
        """Roughness metric: how uniformly filled is the polygon"""
        if not self.mask.any():
            return 0.0
        heights_in_mask = self.height[self.mask]
        if heights_in_mask.size == 0:
            return 0.0
        mean_h = heights_in_mask.mean()
        if mean_h < 0.01:
            return 0.0
        std_h = heights_in_mask.std()
        return max(0.0, 1.0 - (std_h / (mean_h + 1e-6)))

    def mean_height(self) -> float:
        if not self.mask.any():
            return 0.0
        return float(np.mean(self.height[self.mask]))

    def height_std(self) -> float:
        if not self.mask.any():
            return 0.0
        return float(np.std(self.height[self.mask]))

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
        mc = np.argwhere(mask)
        col_mid = int(np.mean(mc[:, 1]))
        entry_r = int(mc[0, 0])          # fallback
        for rr in range(rows - 1, -1, -1):
            if mask[rr, col_mid]:
                entry_r = rr
                break
        # safety: if col_mid missed, pick nearest mask cell in bottom row
        if not mask[entry_r, col_mid]:
            bot = mc[mc[:, 0] == mc[:, 0].max()]
            col_mid = int(bot[len(bot) // 2, 1])
            entry_r = int(bot[0, 0])

        entry = (entry_r, col_mid)
        return Terrain(height, mask, entry, material)