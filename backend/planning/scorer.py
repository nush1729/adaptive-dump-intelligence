import numpy as np

DEFAULT_WEIGHTS = {
    'volume': 1.0,
    'coverage': 1.0,
    'slope': 0.5,
    'isolation': 0.8,
}

class ScoringEngine:
    def __init__(self, terrain, entry, weights=None):
        self.terrain = terrain
        self.entry = entry
        self.weights = weights or DEFAULT_WEIGHTS

    def score_all(self, reserved_cells=None):
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

        # vectorised score
        w_dist = self.weights.get('coverage', 1.0)
        w_slope = self.weights.get('slope', 0.5)
        w_height = self.weights.get('volume', 1.0)
        scores = 1.0 / (1.0 + w_dist * dist_penalty + w_slope * slope_penalty + w_height * height_norm)
        score_map = np.where(mask, scores, np.nan)

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
        ok = np.isfinite(score_map) & mask
        if ok.any():
            masked = np.where(ok, score_map, -np.inf)
            flat = int(np.argmax(masked))
            best_r, best_c = divmod(flat, cols)
            return int(best_r), int(best_c), score_map

        return None, None, score_map