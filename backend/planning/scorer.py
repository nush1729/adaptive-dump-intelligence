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

    def score_all(self):
        """Compute score map for all cells in the terrain.
        
        Returns: (r, c, score_map) where score_map is a 2D array of scores.
        Heuristic: score = 1.0 / (1 + dist_to_entry + dist_to_mask_edge + slope)
        """
        terrain = self.terrain
        mask = terrain.mask
        rows, cols = mask.shape
        
        # Build score map based on accessibility and slope
        score_map = np.zeros((rows, cols))
        
        if not mask.any():
            return None, None, None
        
        # Distance to entry point
        er, ec = self.entry
        dist_grid = np.sqrt((np.arange(rows)[:, None] - er)**2 + (np.arange(cols)[None, :] - ec)**2)
        
        # Slope penalty (higher slope = lower score)
        slope = terrain.slope_map()
        slope_penalty = (slope / (np.max(slope) + 1e-6)) if np.max(slope) > 0 else 0
        
        # Coverage penalty (already-filled cells score lower)
        height = terrain.height.copy()
        height_norm = height / (np.max(height) + 1e-6) if np.max(height) > 0 else 0
        
        # Score: closer to entry and lower slope = higher score
        for r in range(rows):
            for c in range(cols):
                if mask[r, c]:
                    dist_penalty = dist_grid[r, c] / (rows + cols)
                    score_map[r, c] = 1.0 / (1.0 + dist_penalty + slope_penalty[r, c] + height_norm[r, c])
                else:
                    score_map[r, c] = np.nan
        
        # Normalize to [0, 1]
        valid_scores = score_map[np.isfinite(score_map)]
        if len(valid_scores) > 0:
            min_s = np.min(valid_scores)
            max_s = np.max(valid_scores)
            if max_s > min_s:
                score_map = (score_map - min_s) / (max_s - min_s)
        
        return None, None, score_map