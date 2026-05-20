import numpy as np

class WeightTuner:
    """Simple weight tuner for dump packing optimization."""
    
    def __init__(self, initial_weights: dict, n_trials: int = 30):
        self.initial_weights = initial_weights
        self.n_trials = n_trials
    
    def tune(self, terrain_factory) -> tuple:
        """Tune weights using random search over 30-dump episodes.

        Each trial runs 30 heuristic dumps so coverage/packing metrics
        are non-zero before scoring.  Returns (best_weights, best_score).
        """
        from planning.scorer import ScoringEngine
        from planning.isolation_validator import IsolationValidator

        best_score = -1.0
        best_weights = dict(self.initial_weights)

        for trial in range(self.n_trials):
            # Random perturbation of weights
            weights = {k: v * np.random.uniform(0.5, 1.5)
                       for k, v in self.initial_weights.items()}

            terrain = terrain_factory()
            eng = ScoringEngine(terrain, terrain.entry, weights)
            val = IsolationValidator(terrain, terrain.entry, 0.85)
            reserved = set()

            # Run 30 dumps so the terrain has actual material before scoring
            for _ in range(30):
                r, c, _ = eng.score_all(reserved_cells=reserved)
                if r is None:
                    break
                safe, _ = val.validate(r, c, 100.0)
                if safe:
                    terrain.apply_dump(r, c, 100.0)
                else:
                    reserved.add((r, c))

            score = terrain.coverage_fraction() + terrain.packing_efficiency()
            if score > best_score:
                best_score = score
                best_weights = weights

        return best_weights, best_score