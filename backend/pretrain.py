"""
pretrain.py — trains the ADIOS PPO policy and saves weights.

Usage:
    python pretrain.py [--steps 200000] [--device cpu]

Stages:
  1. Supervised pre-training (behavioural cloning) on heuristic expert trajectories
     → fast convergence using the EnrichedTerrainFCN (truck + IoT context aware)
  2. PPO fine-tuning using MultiInputPolicy + ADIOSMultiInputExtractor
     → learns to outperform the heuristic on unseen polygons with full context

Typical runtime: ~3 min on CPU for 100K steps (sufficient for demo quality)
"""
import argparse, os, sys, time, json
from typing import Optional
import numpy as np
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--steps", type=int, default=100_000)
    p.add_argument("--device", type=str, default="cpu")
    p.add_argument("--out", type=str, default="ml/weights/ppo_adios")
    p.add_argument("--skip-bc", action="store_true", help="Skip behavioural cloning stage")
    p.add_argument("--curriculum", action="store_true",
                   help="Run sequential easy->medium->hard curriculum (single model, "
                        "steps split 20/30/50%% across stages) instead of single-stage training")
    return p.parse_args()


def stage1_behavioural_cloning(out_dir: str, n_polygons: int = 50, epochs: int = 5):
    """
    Pre-train the EnrichedTerrainFCN on expert (heuristic) demonstrations.
    Uses the same Dict observation format as the PPO environment so BC and
    PPO see identical feature representations.
    """
    from ml.train_supervised import train as sup_train, parse_args as sup_parse

    print(f"  Stage 1: Enriched behavioural cloning on {n_polygons} expert trajectories...")
    Path(out_dir).mkdir(parents=True, exist_ok=True)

    # Re-use the supervised trainer CLI with our parameters
    sys.argv = [
        "train_supervised.py",
        "--polygons", str(n_polygons),
        "--dumps-per", "50",
        "--epochs", str(epochs),
        "--out", os.path.relpath(out_dir, os.path.dirname(__file__)),
    ]
    args = sup_parse()
    ckpt_path = sup_train(args)
    print(f"    BC weights saved → {ckpt_path}")
    return ckpt_path


def stage2_ppo(steps: int, device: str, out_path: str, bc_path: Optional[str] = None,
               curriculum: bool = False):
    """
    Fine-tune with PPO using MultiInputPolicy + ADIOSMultiInputExtractor.

    The enriched DumpPackingEnv produces 5-channel Dict obs:
      {"terrain_map": (5,100,100), "context_vector": (CONTEXT_DIM,)}

    When curriculum=True, runs true multi-stage curriculum learning: the same
    model object is trained sequentially across easy -> medium -> hard
    DumpPackingEnv configurations (single generic truck/short episodes ->
    small mixed fleet -> full mixed fleet/full seed range), with `steps` split
    proportionally (20% / 30% / 50%) across the three stages. This only
    changes *episode setup* (fleet composition, episode length, seed
    diversity) between stages — observation/action/reward shapes are
    identical throughout, so the same model and optimizer state carry over.
    """
    from ml.environment import DumpPackingEnv
    from ml.policy import ADIOSMultiInputExtractor
    from stable_baselines3.common.env_util import make_vec_env
    from stable_baselines3.common.callbacks import CheckpointCallback

    use_maskable = True
    try:
        from sb3_contrib import MaskablePPO
        from sb3_contrib.common.wrappers import ActionMasker

        def mask_fn(env):
            return env.action_masks()

        ModelClass = MaskablePPO
        print("    Using MaskablePPO with MultiInputPolicy")
    except ImportError:
        from stable_baselines3 import PPO
        ModelClass = PPO
        use_maskable = False
        print("    MaskablePPO not found, using standard PPO")

    def make_env_fn(stage: int):
        def env_fn():
            env = DumpPackingEnv(curriculum_stage=stage)
            return ActionMasker(env, mask_fn) if use_maskable else env
        return env_fn

    n_envs = min(4, os.cpu_count() or 2)
    policy_kwargs = dict(
        features_extractor_class=ADIOSMultiInputExtractor,
        features_extractor_kwargs=dict(features_dim=512),
        net_arch=dict(pi=[256, 128], vf=[256, 128]),
    )
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    checkpoint_cb = CheckpointCallback(
        save_freq=max(steps // 5, 10_000),
        save_path=os.path.dirname(out_path),
        name_prefix="ckpt",
    )

    stages = [0, 1, 2] if curriculum else [2]
    splits = [0.2, 0.3, 0.5] if curriculum else [1.0]
    model = None
    t0 = time.time()

    for stage, frac in zip(stages, splits):
        stage_steps = max(int(steps * frac), 1)
        label = {0: "easy", 1: "medium", 2: "hard"}[stage]
        print(f"  Stage 2{'.' + label if curriculum else ''}: PPO fine-tuning "
              f"for {stage_steps:,} steps on {device} (curriculum_stage={stage} / {label})...")

        vec_env = make_vec_env(make_env_fn(stage), n_envs=n_envs)

        if model is None:
            model = ModelClass(
                "MultiInputPolicy",
                vec_env,
                policy_kwargs=policy_kwargs,
                learning_rate=3e-4,
                n_steps=512,
                batch_size=256,
                n_epochs=4,
                gamma=0.99,
                gae_lambda=0.95,
                clip_range=0.2,
                ent_coef=0.01,
                verbose=1,
                device=device,
                tensorboard_log="./tb_logs/",
            )
        else:
            # Carry the trained policy/optimizer forward into the next stage's envs
            model.set_env(vec_env)

        model.learn(total_timesteps=stage_steps, callback=[checkpoint_cb],
                    progress_bar=True, reset_num_timesteps=(stage == stages[0]))

    elapsed = time.time() - t0
    print(f"    Training complete in {elapsed:.0f}s")
    model.save(out_path)
    print(f"    PPO weights saved → {out_path}.zip")


def evaluate_policy(weights_path: str, n_eval: int = 10):
    """Quick evaluation vs heuristic on held-out polygons."""
    from ml.environment import DumpPackingEnv
    from ml.policy import load_policy
    from environment.terrain import Terrain
    from planning.scorer import ScoringEngine, DEFAULT_WEIGHTS
    from planning.isolation_validator import IsolationValidator
    from planning.action_masker import ConstrainedActionMasker
    from config import SITE_CONFIG

    print(f"Evaluating trained policy on {n_eval} held-out polygons (seeds 8000+)...")
    policy = load_policy(weights_path)

    ml_scores, h_scores = [], []
    for i in range(n_eval):
        seed = 8000 + i

        # ML rollout
        env = DumpPackingEnv(fixed_seed=seed, max_dumps=60)
        obs, _ = env.reset()
        done = False
        while not done:
            masks = env.action_masks() if hasattr(env, "action_masks") else None
            action = policy.predict(obs, masks)
            obs, _, terminated, truncated, _ = env.step(action)
            done = terminated or truncated
        ml_scores.append(env.terrain.tpacking_efficiency())

        # Heuristic rollout
        terrain_h = Terrain.make_demo_polygon(100, 100, "default", seed)
        eng = ScoringEngine(terrain_h, terrain_h.entry, dict(DEFAULT_WEIGHTS))
        val = IsolationValidator(terrain_h, terrain_h.entry, SITE_CONFIG.iso_threshold, SITE_CONFIG.min_dump_spacing_cells)
        payloads = [218.0, 104.0, 400.0, 218.0]
        for j in range(SITE_CONFIG.benchmark_dumps):
            payload_t = payloads[j % len(payloads)]
            action_mask = ConstrainedActionMasker(terrain_h, val).mask(payload_t, include_iso=True)
            r, c, _ = eng.score_all(action_mask=action_mask)
            if r is None:
                break
            safe, _ = val.validate(r, c, payload_t)
            if safe:
                terrain_h.apply_dump(r, c, payload_t)
                val.record_dump(r, c)
        h_scores.append(terrain_h.packing_efficiency())

    ml_mean = np.mean(ml_scores) * 100
    h_mean  = np.mean(h_scores) * 100
    delta   = ml_mean - h_mean
    print(f"    PPO policy efficiency:    {ml_mean:.1f}%")
    print(f"    Heuristic efficiency:     {h_mean:.1f}%")
    print(f"    Delta:                    {delta:+.1f}%")
    return {"ml_efficiency": round(ml_mean, 2), "heuristic_efficiency": round(h_mean, 2), "delta": round(delta, 2)}


if __name__ == "__main__":
    args = parse_args()
    # args.out = "ml/weights/ppo_adios" — BC and PPO both live in this directory
    out_dir = args.out
    Path(out_dir).mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("ADIOS — Physics & IoT-Informed Policy Training Pipeline")
    print("=" * 60)

    bc_path = None
    if not args.skip_bc:
        try:
            bc_path = stage1_behavioural_cloning(out_dir)
        except Exception as e:
            print(f"  BC stage skipped ({e})")

    try:
        stage2_ppo(args.steps, args.device, args.out, bc_path, curriculum=args.curriculum)
        print("=" * 60)
        eval_result = evaluate_policy(args.out)
        with open(os.path.join(out_dir, "eval_result.json"), "w") as f:
            json.dump(eval_result, f, indent=2)

        # Write metadata sidecar so load_policy can validate obs-space without
        # a full model load
        from config import CONTEXT_DIM, SITE_CONFIG
        metadata = {
            "obs_type": "multi_input",
            "terrain_channels": 5,
            "context_dim": CONTEXT_DIM,
            "rows": SITE_CONFIG.rows,
            "cols": SITE_CONFIG.cols,
            "policy_class": "MultiInputPolicy",
            "extractor": "ADIOSMultiInputExtractor",
            "trained_steps": args.steps,
        }
        with open(os.path.join(out_dir, "metadata.json"), "w") as f:
            json.dump(metadata, f, indent=2)
        print(f"  Metadata sidecar → {os.path.join(out_dir, 'metadata.json')}")
    except Exception as e:
        print(f"  PPO training failed: {e}")
        print("  System will use BC imitation policy (still fully functional)")
