"""
compute_eval.py — Compute REAL evaluation metrics for ML vs heuristic.

Runs both policies on N seeds and writes truthful eval_result.json.
Replaces the hardcoded fake values that were previously in that file.

Usage:
    cd backend
    python evaluation/compute_eval.py
    python evaluation/compute_eval.py --seeds 10 --dumps 60
"""
import argparse, json, os, sys, time
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from environment.terrain import Terrain
from fleet.truck import make_fleet
from planning.scorer import ScoringEngine, DEFAULT_WEIGHTS
from planning.isolation_validator import IsolationValidator
from planning.action_masker import ConstrainedActionMasker
from evaluation.metrics import summarize_episode
from config import SITE_CONFIG, config_payload


def parse_args():
    p = argparse.ArgumentParser(description="ADIOS ML Evaluation — compute real metrics")
    p.add_argument("--seeds", type=int, default=10,
                   help="Number of random seeds to evaluate")
    p.add_argument("--seed-start", type=int, default=9000,
                   help="Starting seed (use held-out test set)")
    p.add_argument("--dumps", type=int, default=60,
                   help="Dumps per episode")
    p.add_argument("--fleet", nargs="+",
                   default=["Cat793", "Cat777", "Cat797", "Cat793"])
    p.add_argument("--out", type=str, default=None,
                   help="Output path (default: ml/weights/ppo_adios/eval_result.json)")
    return p.parse_args()


def run_heuristic_episode(terrain, fleet, n_dumps):
    """Run one heuristic episode and return metrics dict."""
    weights = dict(DEFAULT_WEIGHTS)
    eng = ScoringEngine(terrain, terrain.entry, weights)
    val = IsolationValidator(terrain, terrain.entry, SITE_CONFIG.iso_threshold, SITE_CONFIG.min_dump_spacing_cells)

    dispatches = [(t.truck_id, t.payload_t) for t in fleet] * (n_dumps // len(fleet) + 1)
    dispatches = dispatches[:n_dumps]
    reserved = set()
    success, rejected = 0, 0

    for truck_id, payload_t in dispatches:
        placed = False
        for _attempt in range(50):
            action_mask = ConstrainedActionMasker(terrain, val).mask(payload_t, reserved_cells=reserved, include_iso=True)
            r, c, _ = eng.score_all(reserved_cells=reserved, action_mask=action_mask)
            if r is None:
                break
            safe, _ = val.validate(r, c, payload_t)
            if not safe:
                reserved.add((r, c))
                continue
            ok, _ = terrain.apply_dump(r, c, payload_t)
            if ok:
                success += 1
                val.record_dump(r, c)
                placed = True
                break
            else:
                reserved.add((r, c))
        if not placed:
            rejected += 1

    log = [{"status": "dumped"} for _ in range(success)] + [{"status": "rejected"} for _ in range(rejected)]
    summary = summarize_episode(terrain, log, [], [], "heuristic")
    return {
        "volume": summary["total_volume"],
        "coverage_pct": summary["coverage_pct"],
        "packing_efficiency": summary["packing_efficiency"],
        "uniformity": summary["height_uniformity"],
        "success": success,
        "rejected": rejected,
    }


def run_ml_episode(terrain, fleet, n_dumps, policy):
    """Run one ML episode and return metrics dict using robust action masking and retry loop."""
    from scipy.ndimage import distance_transform_edt

    val = IsolationValidator(terrain, terrain.entry, SITE_CONFIG.iso_threshold, SITE_CONFIG.min_dump_spacing_cells)
    dispatches = [(t.truck_id, t.payload_t) for t in fleet] * (n_dumps // len(fleet) + 1)
    dispatches = dispatches[:n_dumps]
    COLS = terrain.cols
    success, rejected = 0, 0
    reserved = set()

    for _, payload_t in dispatches:
        placed = False

        for _attempt in range(50):
            h = terrain.height
            mask = terrain.mask.astype(np.float32)
            h_norm = np.clip(h / SITE_CONFIG.max_height_m, 0.0, 1.0).astype(np.float32)
            dist = distance_transform_edt(terrain.mask).astype(np.float32)
            dist_norm = dist / (dist.max() or 1.0)
            obs = np.stack([h_norm, mask, dist_norm], axis=0)

            action_mask = ConstrainedActionMasker(terrain, val).mask(payload_t, reserved_cells=reserved, include_iso=True)

            if not action_mask.any():
                break

            action = policy.predict(obs, action_mask.ravel().copy())
            r, c = divmod(int(action), COLS)

            safe, _ = val.validate(r, c, payload_t)
            if not safe:
                reserved.add((r, c))
                continue

            ok, _ = terrain.apply_dump(r, c, payload_t)
            if ok:
                success += 1
                val.record_dump(r, c)
                placed = True
                reserved.discard((r, c))
                break
            else:
                reserved.add((r, c))

        if not placed:
            rejected += 1

    policy_name = getattr(policy, "artifact_type", "unknown_ml")
    log = [{"status": "dumped"} for _ in range(success)] + [{"status": "rejected"} for _ in range(rejected)]
    summary = summarize_episode(terrain, log, [], [], policy_name)
    return {
        "volume": summary["total_volume"],
        "coverage_pct": summary["coverage_pct"],
        "packing_efficiency": summary["packing_efficiency"],
        "uniformity": summary["height_uniformity"],
        "success": success,
        "rejected": rejected,
        "policy": policy_name,
    }


def main():
    args = parse_args()
    fleet = make_fleet(args.fleet)
    MATERIALS = ["rock", "ore", "overburden", "default"]

    # Try to load ML policy
    policy = None
    policy_type = "none"
    try:
        from ml.policy import load_policy
        weights_path = os.path.join(os.path.dirname(__file__), "..", "ml", "weights", "ppo_adios")
        policy = load_policy(weights_path)
        policy_type = getattr(policy, "artifact_type", "unknown_ml")
        print(f"  ✓ ML policy loaded: {policy_type}")
    except Exception as e:
        print(f"  ✗ ML policy not available: {e}")
        print("  Will compute heuristic-only evaluation.")

    print(f"\n  ADIOS Evaluation | {args.seeds} seeds × {args.dumps} dumps")
    print(f"  Seeds: {args.seed_start} – {args.seed_start + args.seeds - 1}")
    print("─" * 50)

    heuristic_results = []
    ml_results = []

    for i in range(args.seeds):
        seed = args.seed_start + i
        mat = MATERIALS[i % len(MATERIALS)]
        print(f"  [{i+1}/{args.seeds}] seed={seed} material={mat}", end="")

        # Heuristic
        t_h = Terrain.make_demo_polygon(100, 100, mat, seed)
        h_res = run_heuristic_episode(t_h, fleet, args.dumps)
        heuristic_results.append(h_res)
        print(f"  H:cov={h_res['coverage_pct']:.1f}%", end="")

        # ML
        if policy:
            t_m = Terrain.make_demo_polygon(100, 100, mat, seed)
            m_res = run_ml_episode(t_m, fleet, args.dumps, policy)
            ml_results.append(m_res)
            print(f"  ML:cov={m_res['coverage_pct']:.1f}%", end="")

        print()

    # Compute aggregates
    def agg(results, key):
        vals = [r[key] for r in results]
        return {
            "mean": round(float(np.mean(vals)), 2),
            "std": round(float(np.std(vals)), 2),
            "min": round(float(np.min(vals)), 2),
            "max": round(float(np.max(vals)), 2),
        }

    h_eff = agg(heuristic_results, "packing_efficiency")
    h_cov = agg(heuristic_results, "coverage_pct")
    h_vol = agg(heuristic_results, "volume")
    h_uni = agg(heuristic_results, "uniformity")

    eval_data = {
        "heuristic_efficiency": h_eff["mean"],
        "heuristic_coverage": h_cov["mean"],
        "heuristic_volume": h_vol["mean"],
        "heuristic_uniformity": h_uni["mean"],
        "heuristic_stats": {
            "efficiency": h_eff,
            "coverage": h_cov,
            "volume": h_vol,
            "uniformity": h_uni,
        },
        "n_seeds": args.seeds,
        "seed_start": args.seed_start,
        "dumps_per_episode": args.dumps,
        "computed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "config": config_payload(),
    }

    if ml_results:
        m_eff = agg(ml_results, "packing_efficiency")
        m_cov = agg(ml_results, "coverage_pct")
        m_vol = agg(ml_results, "volume")
        m_uni = agg(ml_results, "uniformity")

        eval_data.update({
            "ml_efficiency": m_eff["mean"],
            "ml_coverage": m_cov["mean"],
            "ml_volume": m_vol["mean"],
            "ml_uniformity": m_uni["mean"],
            "ml_stats": {
                "efficiency": m_eff,
                "coverage": m_cov,
                "volume": m_vol,
                "uniformity": m_uni,
            },
            "delta": round(m_eff["mean"] - h_eff["mean"], 2),
            "delta_coverage": round(m_cov["mean"] - h_cov["mean"], 2),
            "model_type": policy_type,
        })
    else:
        eval_data.update({
            "ml_efficiency": None,
            "ml_coverage": None,
            "ml_volume": None,
            "ml_uniformity": None,
            "delta": None,
            "model_type": "none",
        })

    # Write output
    if args.out:
        out_path = args.out
    else:
        out_path = os.path.join(
            os.path.dirname(__file__), "..", "ml", "weights", "ppo_adios", "eval_result.json"
        )

    with open(out_path, "w") as f:
        json.dump(eval_data, f, indent=2)

    print(f"\n{'='*50}")
    print(f"  Heuristic Efficiency: {h_eff['mean']:.1f}% ± {h_eff['std']:.1f}%")
    if ml_results:
        m_eff_data = eval_data["ml_stats"]["efficiency"]
        print(f"  ML Efficiency:        {m_eff_data['mean']:.1f}% ± {m_eff_data['std']:.1f}%")
        print(f"  Delta:                {eval_data['delta']:+.1f}%")
    print(f"  Written → {out_path}")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    main()
