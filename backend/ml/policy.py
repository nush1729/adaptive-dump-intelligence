"""
Custom CNN policy for ADIOS dump-packing.

Architecture:
  - Shared encoder: 3 conv layers → 256-d feature vector
  - Actor head:     linear → 10000 logits → masked softmax
  - Critic head:    linear → scalar value

Designed for stable-baselines3 MaskablePPO from sb3-contrib.
Falls back gracefully to standard PPO without masking.
"""
import numpy as np
import torch
import torch.nn as nn
from typing import Optional
from stable_baselines3.common.torch_layers import BaseFeaturesExtractor
import gymnasium as gym


class TerrainCNNExtractor(BaseFeaturesExtractor):
    """
    Processes (3, 100, 100) terrain observation → 256-dim feature vector.

    Layer design:
      Conv1: 3→32 ch, 8×8 stride 4  → 32×24×24
      Conv2: 32→64 ch, 4×4 stride 2 → 64×11×11
      Conv3: 64→64 ch, 3×3 stride 1 → 64×9×9  → flatten 5184
      FC: 5184 → 256
    """

    def __init__(self, observation_space: gym.Space, features_dim: int = 512):
        super().__init__(observation_space, features_dim)
        n_input_channels = observation_space.shape[0]  # type: ignore

        self.cnn = nn.Sequential(
            nn.Conv2d(n_input_channels, 32, kernel_size=8, stride=4, padding=0),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.Conv2d(32, 64, kernel_size=4, stride=2, padding=0),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            nn.Conv2d(64, 128, kernel_size=3, stride=1, padding=0),
            nn.BatchNorm2d(128),
            nn.ReLU(),
            nn.Flatten(),
        )

        # compute flattened size
        with torch.no_grad():
            sample = torch.zeros(1, *observation_space.shape)  # type: ignore
            n_flat = self.cnn(sample).shape[1]

        self.linear = nn.Sequential(
            nn.Linear(n_flat, features_dim),
            nn.BatchNorm1d(features_dim),
            nn.ReLU(),
        )

    def forward(self, obs: torch.Tensor) -> torch.Tensor:
        return self.linear(self.cnn(obs))


def load_policy(weights_path: str, device: str = "cpu"):
    """Load a trained policy. Returns inference wrapper.
    
    Tries in order:
    1. Supervised MLP (fastest, fully neural)
    2. MaskablePPO (best if converged)
    3. Standard PPO (fallback)
    """
    import pathlib
    
    # Try supervised MLP first
    _sup = pathlib.Path(weights_path).parent / "supervised_mlp.pt"
    if _sup.exists():
        try:
            from ml.train_supervised import load_supervised_policy
            print(f"  Loading supervised MLP from {_sup}")
            return load_supervised_policy(str(_sup), device)
        except Exception as _e:
            print(f"  Supervised weights found but failed to load: {_e}")
    
    # Try MaskablePPO
    try:
        from sb3_contrib import MaskablePPO  # type: ignore
        model = MaskablePPO.load(weights_path, device=device)
        return MaskableInferenceWrapper(model)
    except ImportError:
        pass
    except Exception as e:
        print(f"  MaskablePPO load failed: {e}")
    
    # Fall back to standard PPO
    try:
        from stable_baselines3 import PPO
        model = PPO.load(weights_path, device=device)
        return StandardInferenceWrapper(model)
    except Exception as e:
        print(f"  PPO load failed: {e}")
        raise


class MaskableInferenceWrapper:
    def __init__(self, model):
        self.model = model

    def predict(self, obs: np.ndarray, action_masks: Optional[np.ndarray] = None) -> int:
        action, _ = self.model.predict(obs, action_masks=action_masks, deterministic=True)
        return int(action)


class StandardInferenceWrapper:
    def __init__(self, model):
        self.model = model

    def predict(self, obs: np.ndarray, action_masks: Optional[np.ndarray] = None) -> int:
        action, _ = self.model.predict(obs, deterministic=True)
        # force valid cell
        if action_masks is not None and not action_masks[int(action)]:
            valid = np.where(action_masks)[0]
            action = int(np.random.choice(valid)) if len(valid) else int(action)
        return int(action)


class HeuristicFallbackPolicy:
    """
    Used when no trained weights exist.
    Wraps the existing ScoringEngine so the API has a consistent interface.
    """
    def __init__(self, terrain, entry, weights=None):
        from planning.scorer import ScoringEngine, DEFAULT_WEIGHTS
        self.engine = ScoringEngine(terrain, entry, weights or dict(DEFAULT_WEIGHTS))
        self._terrain = terrain

    def predict(self, obs: np.ndarray, action_masks: Optional[np.ndarray] = None) -> int:
        r, c, _ = self.engine.score_all()
        if r is None or c is None:
            # fallback: random valid cell
            valid = np.argwhere(self._terrain.mask)
            if len(valid):
                rc = valid[np.random.randint(len(valid))]
                r, c = int(rc[0]), int(rc[1])
            else:
                return 0
        return int(r) * 100 + int(c)
