"""
Policy architecture for ADIOS — Physics & IoT-Informed Reinforcement Learning.

Architecture:
  ADIOSMultiInputExtractor:
    - Terrain CNN:   (3, 100, 100) → 256-d spatial features
    - Context MLP:   (CONTEXT_DIM,) → 64-d operational features
    - Combined FC:   320-d → 512-d feature vector

  CTDE (Centralised Training, Decentralised Execution):
    - TruckAgent: per-truck inference wrapper that injects truck-specific
      context into observations; shares policy weights across the fleet.
    - Central orchestrator validates and executes approved actions.

Backward compatibility:
  TerrainCNNExtractor is retained for loading legacy (pre-enrichment) PPO
  checkpoints.  New training should always use ADIOSMultiInputExtractor.
"""
import numpy as np
import torch
import torch.nn as nn
from typing import Optional, Dict as TypingDict
from stable_baselines3.common.torch_layers import BaseFeaturesExtractor
import gymnasium as gym
from gymnasium import spaces

import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from config import TRUCK_PROFILES, IOT_FEATURE_DIM


# ── Legacy extractor (kept for loading pre-enrichment checkpoints) ────────────

class TerrainCNNExtractor(BaseFeaturesExtractor):
    """
    Processes (3, 100, 100) terrain observation → features_dim-d vector.
    Retained for backward compatibility with existing PPO checkpoints.
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


# ── New multi-input extractor for enriched observations ──────────────────────

class ADIOSMultiInputExtractor(BaseFeaturesExtractor):
    """
    Processes Dict observation {terrain_map, context_vector} for CTDE PPO.

    terrain_map  (5, ROWS, COLS) → dual-stream CNN → 384-d spatial features
      Stream A (geometry): channels 0-2 (height, mask, dist-boundary)
      Stream B (semantics): channels 3-4 (pile detection, spacing density)
    context_vector (CONTEXT_DIM,) → MLP → 128-d operational features
    concatenated                   → FC  → features_dim (512)

    The dual-stream design lets the model learn geometry (where is the
    polygon, how full is it) and semantics (where are piles, how dense is
    packing) as separate representations before merging them with truck/IoT
    context for action selection.
    """

    GEO_OUT_DIM: int = 256
    SEM_OUT_DIM: int = 128
    CTX_OUT_DIM: int = 128

    def __init__(
        self,
        observation_space: spaces.Dict,
        features_dim: int = 512,
    ):
        super().__init__(observation_space, features_dim)

        terrain_space = observation_space["terrain_map"]
        ctx_dim = observation_space["context_vector"].shape[0]
        n_channels = terrain_space.shape[0]

        # Geometry stream: channels 0,1,2 (height map, polygon mask, dist-to-boundary)
        self.geo_cnn = nn.Sequential(
            nn.Conv2d(3, 32, kernel_size=8, stride=4),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.Conv2d(32, 64, kernel_size=4, stride=2),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            nn.Conv2d(64, 128, kernel_size=3, stride=1),
            nn.BatchNorm2d(128),
            nn.ReLU(),
            nn.Flatten(),
        )
        with torch.no_grad():
            geo_sample = torch.zeros(1, 3, terrain_space.shape[1], terrain_space.shape[2])
            geo_flat = self.geo_cnn(geo_sample).shape[1]

        self.geo_proj = nn.Sequential(
            nn.Linear(geo_flat, self.GEO_OUT_DIM),
            nn.LayerNorm(self.GEO_OUT_DIM),
            nn.ReLU(),
        )

        # Semantic stream: channels 3,4 (pile mask, spacing density)
        # Uses wider receptive field to capture local packing patterns
        sem_in = n_channels - 3
        self.sem_cnn = nn.Sequential(
            nn.Conv2d(sem_in, 16, kernel_size=5, stride=2, padding=2),
            nn.BatchNorm2d(16),
            nn.ReLU(),
            nn.Conv2d(16, 32, kernel_size=5, stride=2, padding=2),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.Conv2d(32, 64, kernel_size=3, stride=2, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            nn.Flatten(),
        )
        with torch.no_grad():
            sem_sample = torch.zeros(1, sem_in, terrain_space.shape[1], terrain_space.shape[2])
            sem_flat = self.sem_cnn(sem_sample).shape[1]

        self.sem_proj = nn.Sequential(
            nn.Linear(sem_flat, self.SEM_OUT_DIM),
            nn.LayerNorm(self.SEM_OUT_DIM),
            nn.ReLU(),
        )

        # Context MLP — truck type + material + IoT features
        self.ctx_mlp = nn.Sequential(
            nn.Linear(ctx_dim, 128),
            nn.LayerNorm(128),
            nn.ReLU(),
            nn.Linear(128, self.CTX_OUT_DIM),
            nn.ReLU(),
        )

        # Fusion head
        fused_dim = self.GEO_OUT_DIM + self.SEM_OUT_DIM + self.CTX_OUT_DIM
        self.fusion = nn.Sequential(
            nn.Linear(fused_dim, features_dim),
            nn.LayerNorm(features_dim),
            nn.ReLU(),
        )

    def forward(self, obs: TypingDict[str, torch.Tensor]) -> torch.Tensor:
        terrain = obs["terrain_map"]
        geo_feat = self.geo_proj(self.geo_cnn(terrain[:, :3, :, :]))
        sem_feat = self.sem_proj(self.sem_cnn(terrain[:, 3:, :, :]))
        ctx_feat = self.ctx_mlp(obs["context_vector"])
        return self.fusion(torch.cat([geo_feat, sem_feat, ctx_feat], dim=1))


# ── TruckAgent — per-truck CTDE inference wrapper ────────────────────────────

class TruckAgent:
    """
    Lightweight per-truck inference agent for Centralised Training,
    Decentralised Execution (CTDE).

    Each truck maintains its own operational context (type, payload,
    historical dump count) while sharing the central policy weights.
    The central orchestrator validates and executes the proposed actions.

    Architecture story:
      "Each truck operates as an intelligent edge agent that generates
       candidate dump actions from its local context, while the central
       Digital Twin validates safety before execution."
    """

    def __init__(
        self,
        truck_id: str,
        profile_name: str = "generic",
        dump_count: int = 0,
    ):
        self.truck_id = truck_id
        self.profile = TRUCK_PROFILES.get(profile_name, TRUCK_PROFILES["generic"])
        self.profile_name = profile_name
        self.dump_count = dump_count

    def build_context_vector(
        self,
        payload_t: float,
        material: str,
        iot_features: Optional[np.ndarray] = None,
    ) -> np.ndarray:
        """Build normalised CONTEXT_DIM context vector for this truck state."""
        from ml.environment import build_context_vector
        if iot_features is None:
            iot_features = np.zeros(IOT_FEATURE_DIM, dtype=np.float32)
        return build_context_vector(
            self.profile_name, payload_t, self.dump_count, material, iot_features
        )

    def build_obs(
        self,
        terrain_map: np.ndarray,
        payload_t: float,
        material: str,
        iot_features: Optional[np.ndarray] = None,
    ) -> dict:
        """Assemble a full Dict observation for policy inference."""
        ctx = self.build_context_vector(payload_t, material, iot_features)
        return {"terrain_map": terrain_map, "context_vector": ctx}

    def propose_action(
        self,
        terrain_map: np.ndarray,
        payload_t: float,
        material: str,
        policy,
        action_masks: Optional[np.ndarray] = None,
        iot_features: Optional[np.ndarray] = None,
    ) -> int:
        """Generate candidate dump cell index using shared policy weights."""
        obs = self.build_obs(terrain_map, payload_t, material, iot_features)
        return policy.predict(obs, action_masks)

    def record_dump(self) -> None:
        """Called after a successful dump to update per-truck state."""
        self.dump_count += 1

    def __repr__(self) -> str:
        return (
            f"TruckAgent(id={self.truck_id!r}, profile={self.profile_name!r}, "
            f"dumps={self.dump_count})"
        )


# ── Policy loading ────────────────────────────────────────────────────────────

def _probe_ppo_obs_type(ppo_artifact) -> str:
    """Read the obs-space type from the zip without fully loading the model.

    Returns 'multi_input', 'cnn', or 'unknown'.
    """
    import zipfile, json as _json
    try:
        with zipfile.ZipFile(str(ppo_artifact), "r") as zf:
            # SB3 stores observation_space in data/data.json or data.json
            candidates = [n for n in zf.namelist() if n.endswith("data.json") or n == "data"]
            for name in candidates:
                raw = zf.read(name)
                obj = _json.loads(raw)
                obs_cls = (
                    obj.get("observation_space", {}).get(":type:", "")
                    or obj.get("policy_class", {}).get(":type:", "")
                )
                if "Dict" in obs_cls or "MultiInput" in obs_cls:
                    return "multi_input"
                if "Box" in obs_cls or "Cnn" in obs_cls:
                    return "cnn"
        return "unknown"
    except Exception:
        return "unknown"


def _validate_multi_input_ppo(model) -> bool:
    """Smoke-test: run a dummy forward pass to confirm the loaded model
    matches the current 5-channel MultiInput observation space.
    Returns True if the model accepts Dict obs without error.
    """
    import sys, os
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    from config import SITE_CONFIG, CONTEXT_DIM
    try:
        dummy_obs = {
            "terrain_map": np.zeros((5, SITE_CONFIG.rows, SITE_CONFIG.cols), dtype=np.float32),
            "context_vector": np.zeros(CONTEXT_DIM, dtype=np.float32),
        }
        model.policy.set_training_mode(False)
        import torch
        with torch.no_grad():
            obs_t = model.policy.obs_to_tensor(dummy_obs)[0]
            model.policy.extract_features(obs_t)
        return True
    except Exception as e:
        print(f"  PPO forward-pass probe failed: {e}")
        return False


def load_policy(weights_path: str, device: str = "cpu"):
    """Load a trained policy. Returns inference wrapper.

    Tries in order:
    1. MaskablePPO with MultiInputPolicy — validated with dummy forward pass
       to ensure obs-space matches current 5-channel architecture
    2. MaskablePPO with CnnPolicy (legacy 3-channel flat obs)
    3. Standard PPO artifact
    4. Supervised imitation artifact (behavioural cloning) — explicit fallback
    5. Raises RuntimeError — no silent fallback to heuristic
    """
    import pathlib, json as _json

    wp = pathlib.Path(weights_path)
    if wp.suffix == ".zip":
        ppo_artifact = wp
    else:
        # Path without .zip extension — look for .zip alongside or in parent
        ppo_artifact = pathlib.Path(str(wp) + ".zip")
        if not ppo_artifact.exists():
            # Also try: parent_dir/<name>.zip (e.g. weights/ckpt_160000_steps.zip)
            ppo_artifact = wp.parent / (wp.name + ".zip")

    # ── metadata sidecar: check both directory and alongside zip ─────────────
    metadata_path = wp / "metadata.json"
    if not metadata_path.exists():
        metadata_path = wp.parent / (wp.name + "_metadata.json")
    metadata = {}
    if metadata_path.exists():
        try:
            with open(metadata_path) as f:
                metadata = _json.load(f)
            print(f"  Policy metadata: {metadata}")
        except Exception:
            pass

    # ── short-circuit: metadata says this dir only has BC weights ────────────
    if metadata.get("obs_type") == "bc_imitation":
        bc_candidates = [
            wp / "imitation_bc.pt",
            wp.parent / "imitation_bc.pt",
        ]
        for _sup in bc_candidates:
            if _sup.exists():
                try:
                    from ml.train_supervised import load_supervised_policy
                    policy = load_supervised_policy(str(_sup), device)
                    print(f"  Loaded BC imitation policy from {_sup} "
                          f"(type: {policy.display_name})")
                    return policy
                except Exception as _e:
                    print(f"  BC weights at {_sup} failed to load: {_e}")

    # ── attempt 1: MaskablePPO MultiInput (enriched 5-channel) ───────────────
    if ppo_artifact.exists():
        obs_hint = metadata.get("obs_type", _probe_ppo_obs_type(ppo_artifact))
        print(f"  PPO artifact obs hint: {obs_hint!r}")

        if obs_hint in ("multi_input", "unknown"):
            try:
                from sb3_contrib import MaskablePPO  # type: ignore
                model = MaskablePPO.load(str(ppo_artifact), device=device)
                if _validate_multi_input_ppo(model):
                    print("  Loaded MaskablePPO (MultiInput, 5-channel enriched)")
                    return MaskableInferenceWrapper(model, artifact_type="maskable_ppo")
                else:
                    print("  MaskablePPO loaded but failed obs-space validation — trying BC")
            except ImportError:
                print("  sb3_contrib not available — skipping MaskablePPO")
            except Exception as e:
                print(f"  MaskablePPO MultiInput load failed: {e}")

        # ── attempt 2: MaskablePPO legacy CnnPolicy ──────────────────────────
        if obs_hint in ("cnn", "unknown"):
            try:
                from sb3_contrib import MaskablePPO  # type: ignore
                model = MaskablePPO.load(str(ppo_artifact), device=device)
                print("  Loaded MaskablePPO (legacy CnnPolicy)")
                return StandardInferenceWrapper(model, artifact_type="maskable_ppo_legacy")
            except Exception as e:
                print(f"  MaskablePPO CnnPolicy load failed: {e}")

        # ── attempt 3: standard PPO ───────────────────────────────────────────
        try:
            from stable_baselines3 import PPO
            model = PPO.load(str(ppo_artifact), device=device)
            print("  Loaded standard PPO")
            return StandardInferenceWrapper(model, artifact_type="ppo")
        except Exception as e:
            print(f"  Standard PPO load failed: {e}")

    # ── attempt 4: supervised imitation (BC) ─────────────────────────────────
    bc_candidates = [
        wp / "imitation_bc.pt",
        wp.parent / "imitation_bc.pt",
    ]
    for _sup in bc_candidates:
        if _sup.exists():
            try:
                from ml.train_supervised import load_supervised_policy
                policy = load_supervised_policy(str(_sup), device)
                print(f"  Loaded imitation BC policy from {_sup} "
                      f"(type: {policy.display_name})")
                return policy
            except Exception as _e:
                print(f"  BC weights at {_sup} failed to load: {_e}")

    raise RuntimeError(
        f"No valid policy artifact found at {weights_path}. "
        f"Run `python pretrain.py` from the backend directory to generate BC weights."
    )


# ── Inference wrappers ────────────────────────────────────────────────────────

class MaskableInferenceWrapper:
    def __init__(self, model, artifact_type: str = "maskable_ppo"):
        self.model = model
        self.artifact_type = artifact_type
        self.display_name = "Maskable PPO (IoT-Enriched)"

    def predict(self, obs, action_masks: Optional[np.ndarray] = None) -> int:
        action, _ = self.model.predict(obs, action_masks=action_masks, deterministic=True)
        return int(action)


class StandardInferenceWrapper:
    def __init__(self, model, artifact_type: str = "ppo"):
        self.model = model
        self.artifact_type = artifact_type
        self.display_name = "PPO"

    def predict(self, obs, action_masks: Optional[np.ndarray] = None) -> int:
        action, _ = self.model.predict(obs, deterministic=True)
        if action_masks is not None and not action_masks[int(action)]:
            valid = np.where(action_masks)[0]
            action = int(np.random.choice(valid)) if len(valid) else int(action)
        return int(action)


class HeuristicFallbackPolicy:
    """Used when no trained weights exist."""
    def __init__(self, terrain, entry, weights=None):
        from planning.scorer import ScoringEngine, DEFAULT_WEIGHTS
        self.engine = ScoringEngine(terrain, entry, weights or dict(DEFAULT_WEIGHTS))
        self._terrain = terrain
        self.artifact_type = "heuristic"
        self.display_name = "Heuristic"

    def predict(self, _obs, action_masks: Optional[np.ndarray] = None) -> int:
        mask_2d = None
        if action_masks is not None:
            mask_2d = action_masks.reshape(self._terrain.rows, self._terrain.cols)
        r, c, _ = self.engine.score_all(action_mask=mask_2d)
        if r is None or c is None:
            valid = np.argwhere(self._terrain.mask)
            if len(valid):
                rc = valid[np.random.randint(len(valid))]
                r, c = int(rc[0]), int(rc[1])
            else:
                return 0
        return int(r) * self._terrain.cols + int(c)
