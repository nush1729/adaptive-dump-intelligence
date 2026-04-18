import numpy as np

class WeightTuner:
    """Simple weight tuner for dump packing optimization."""
    
    def __init__(self, initial_weights: dict, n_trials: int = 30):
        self.initial_weights = initial_weights
        self.n_trials = n_trials
    
    def tune(self, terrain_factory) -> tuple:
        """Tune weights using random search.
        
        Args:
            terrain_factory: Callable that returns a new Terrain instance
        
        Returns:
            (best_weights, best_score) tuple
        """
        best_score = 0.0
        best_weights = dict(self.initial_weights)
        
        for trial in range(self.n_trials):
            # Random perturbation
            weights = {k: v * np.random.uniform(0.5, 1.5) 
                      for k, v in self.initial_weights.items()}
            
            # Evaluate on test terrain
            terrain = terrain_factory()
            score = terrain.coverage_fraction() + terrain.packing_efficiency()
            
            if score > best_score:
                best_score = score
                best_weights = weights
        
        return best_weights, best_score