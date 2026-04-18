import numpy as np
from typing import Tuple

MATERIALS = {
    "default": {"density": 1.8, "name": "Default"},
    "coal": {"density": 1.3, "name": "Coal"},
    "ore": {"density": 2.5, "name": "Ore"},
    "waste": {"density": 1.6, "name": "Waste"},
}

class Terrain:
    def __init__(self, height: np.ndarray, mask: np.ndarray, entry: Tuple[int, int]):
        self.height = height
        self.mask = mask
        self.entry = entry
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
        slope = np.sqrt(gx**2 + gy**2)
        return slope

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
        # Inverse of coefficient of variation
        return max(0.0, 1.0 - (std_h / (mean_h + 1e-6)))

    def mean_height(self) -> float:
        """Mean height in masked region"""
        if not self.mask.any():
            return 0.0
        return float(np.mean(self.height[self.mask]))

    def height_std(self) -> float:
        """Standard deviation of heights in masked region"""
        if not self.mask.any():
            return 0.0
        return float(np.std(self.height[self.mask]))

    @staticmethod
    def make_demo_polygon(rows: int, cols: int, material: str, seed: int) -> 'Terrain':
        rng = np.random.default_rng(seed)
        # Create a simple rectangular mask for demo
        mask = np.zeros((rows, cols), dtype=bool)
        # Create a polygon shape, e.g., a rectangle in the center
        start_r = rows // 4
        end_r = 3 * rows // 4
        start_c = cols // 4
        end_c = 3 * cols // 4
        mask[start_r:end_r, start_c:end_c] = True

        # Height starts at 0
        height = np.zeros((rows, cols), dtype=np.float32)

        # Entry point, say top center
        entry = (0, cols // 2)

        return Terrain(height, mask, entry)