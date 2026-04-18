"""
benchmark.py — ADIOS evaluation CLI.

Runs heuristic and (optionally) ML policy on N random polygons,
reports 8 KPIs per policy, and writes JSON + a terminal table.

Usage
-----
    cd adios-v3/backend
    python evaluation/benchmark.py
    python evaluation/benchmark.py --polygons 20 --dumps 60 --out data/benchmark/benchmark_results.json
    python evaluation/benchmark.py --polygons 5  --use-ml   # include ML policy comparison
    python evaluation/benchmark.py --seed-start 8000        # use held-out test seeds

KPIs Reported
-------------
  1. volume_m3          total material volume packed
  2. coverage_pct       fraction of polygon cells with material > 0
  3. packing_efficiency volume / theoretical_max (based on polygon area × max_height)
  4. height_uniformity  1 - std(height) / mean(height)  — higher = more even surface
  5. rejection_rate     fraction of dispatches rejected (iso or slope violations)
  6. mean_spacing_m     mean nearest-neighbour distance between dump centres (proxy for 7.38m target)
  7. latency_ms         wall-clock time per dispatch decision
  8. generalisation     std of packing_efficiency across all polygons (lower = more consistent)
"""
import argparse, json, os, sys, time
from pathlib import Path

import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from environment.terrain import Terrain
from fleet.truck import make_fleet
from planning.scorer import ScoringEngine, DEFAULT_WEIGHTS
from planning.isolation_validator import IsolationValidator


# ── CLI ──────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="ADIOS Benchmark Evaluation Suite")
    p.add_argument("--polygons",    type=int,   default=20,
                   help="Number of polygons to evaluate")
    p.add_argument("--dumps",       type=int,   default=60,
                   help="Max dumps per polygon per policy")
    p.add_argument("--seed-start",  type=int,   default=8000,
                   help="First seed (8000+ = held-out test set)")
    p.add_argument("--use-ml",      action="store_true",
                   help="Also benchmark the ML policy (requires trained weights)")
    p.add_argument("--ml-weights",  type=str,
                   default="ml/weights/ppo_adios",
                   help="Path to ML weights directory")
    p.add_argument("--fleet",       nargs="+",
                   default=["Cat793", "Cat777", "Cat797", "Cat793"])
    p.add_argument("--out",         type=str,
                   default="data/benchmark/benchmark_results.json")
    p.add_argument("--quiet",       action="store_true")
    return p.parse_args()


# ── KPI calculation helpers ───────────────────────────────────────────────────

def mean_spacing(dump_positions: list) -> float:
    """Mean nearest-neighbour distance between dump centres in grid cells."""
    if len(dump_positions) < 2:
        return 0.0
    pts = np.array(dump_positions, dtype=float)
    dists = []
    for i, p in enumerate(pts):
        others = np.delete(pts, i, axis=0)
        if len(others) == 0:
            continue
        nn_dist = np.min(np.linalg.norm(others - p, axis=1))
        dists.append(nn_dist)
    return float(np.mean(dists)) if dists else 0.0


def run_heuristic(terrain: Terrain, fleet, n_dumps: int) -> dict:
    """Run one episode with the heuristic scorer. Returns KPI dict."""
    weights = dict(DEFAULT_WEIGHTS)
    entry   = terrain.entry
    eng     = ScoringEngine(terrain, entry, weights)
    val     = IsolationValidator(terrain, entry, 0.85)

    dispatches = [(t.truck_id, t.payload_t) for t in fleet] * (n_dumps // len(fleet) + 1)
    dispatches  = dispatches[:n_dumps]
    reserved    = set()

    total, success, rejected = 0, 0, 0
    latencies = []
    dump_positions = []

    for truck_id, payload_t in dispatches:
        total += 1
        t0 = time.perf_counter()

        placed = False
        for _attempt in range(50):
            r, c, _ = eng.score_all(reserved_cells=reserved)
            latency_ms = (time.perf_counter() - t0) * 1000

            if r is None:
                break

            safe, _ = val.validate(r, c, payload_t)
            if not safe:
                reserved.add((r, c))
                continue

            ok, _ = terrain.apply_dump(r, c, payload_t)
            if ok:
                success += 1
                dump_positions.append((r, c))
                val.record_dump(r, c)
                placed = True
            else:
                reserved.add((r, c))
                continue
            break

        latencies.append(latency_ms if 'latency_ms' in dir() else 0)
        if not placed:
            rejected += 1

    vol  = terrain.total_volume()
    cov  = terrain.coverage_fraction()
    eff  = terrain.packing_efficiency()
    uni  = 1.0 - terrain.height_std() / max(terrain.mean_height(), 0.01)
    rej  = rejected / max(total, 1)
    spac = mean_spacing(dump_positions)
    lat  = float(np.mean(latencies)) if latencies else 0.0

    return {
        "policy":           "heuristic",
        "dumps_attempted":  total,
        "dumps_succeeded":  success,
        "volume_m3":        round(vol,  2),
        "coverage_pct":     round(cov * 100, 2),
        "packing_efficiency": round(eff * 100, 2),
        "height_uniformity":  round(uni, 4),
        "rejection_rate":     round(rej, 4),
        "mean_spacing_m":     round(spac, 3),
        "latency_ms":         round(lat, 3),
    }


def run_static(terrain: Terrain, payload_t: float = 100.0, step: int = 8) -> dict:
    """Uniform grid baseline — dumps every `step` cells."""
    rs, cs = np.where(terrain.mask)
    t0 = time.perf_counter()
    positions = []
    for r in range(int(rs.min()), int(rs.max()) + 1, step):
        for c in range(int(cs.min()), int(cs.max()) + 1, step):
            if terrain.mask[r, c]:
                ok, _ = terrain.apply_dump(r, c, payload_t)
                if ok:
                    positions.append((r, c))
    latency_ms = (time.perf_counter() - t0) * 1000 / max(len(positions), 1)
    vol = terrain.total_volume()
    cov = terrain.coverage_fraction()
    eff = terrain.packing_efficiency()
    uni = 1.0 - terrain.height_std() / max(terrain.mean_height(), 0.01)
    return {
        "policy":             "static_grid",
        "dumps_succeeded":    len(positions),
        "volume_m3":          round(vol, 2),
        "coverage_pct":       round(cov * 100, 2),
        "packing_efficiency": round(eff * 100, 2),
        "height_uniformity":  round(uni, 4),
        "rejection_rate":     0.0,
        "mean_spacing_m":     round(float(step), 3),
        "latency_ms":         round(latency_ms, 3),
    }


def run_ml(terrain: Terrain, fleet, n_dumps: int, weights_path: str) -> dict:
    """Run one episode with the neural policy."""
    try:
        from ml.policy import load_policy
        from scipy.ndimage import distance_transform_edt
        policy = load_policy(weights_path)
    except Exception as e:
        return {"policy": "ml_error", "error": str(e)}

    val = IsolationValidator(terrain, terrain.entry, 0.85)
    dispatches = [(t.truck_id, t.payload_t) for t in fleet] * (n_dumps // len(fleet) + 1)
    dispatches  = dispatches[:n_dumps]
    mask_flat   = terrain.mask.ravel()
    COLS        = terrain.cols

    def _obs(t: Terrain) -> np.ndarray:
        h     = t.height
        mask  = t.mask.astype(np.float32)
        max_h = h[t.mask].max() if t.mask.any() else 1.0
        h_n   = (h / max(max_h, 1e-6)).astype(np.float32)
        dist  = distance_transform_edt(t.mask).astype(np.float32)
        d_n   = dist / (dist.max() or 1.0)
        return np.stack([h_n, mask, d_n], axis=0)

    total, success, rejected = 0, 0, 0
    latencies, dump_positions = [], []

    for _, payload_t in dispatches:
        total += 1
        obs   = _obs(terrain)
        t0    = time.perf_counter()
        action = policy.predict(obs, mask_flat.copy())
        latency_ms = (time.perf_counter() - t0) * 1000
        latencies.append(latency_ms)

        r, c = divmod(int(action), COLS)
        safe, _ = val.validate(r, c, payload_t)
        if not safe:
            rejected += 1
            continue
        ok, _ = terrain.apply_dump(r, c, payload_t)
        if ok:
            success += 1
            dump_positions.append((r, c))
        else:
            rejected += 1

    vol = terrain.total_volume()
    cov = terrain.coverage_fraction()
    eff = terrain.packing_efficiency()
    uni = 1.0 - terrain.height_std() / max(terrain.mean_height(), 0.01)
    rej = rejected / max(total, 1)

    return {
        "policy":             "ml_ppo",
        "dumps_attempted":    total,
        "dumps_succeeded":    success,
        "volume_m3":          round(vol,  2),
        "coverage_pct":       round(cov * 100, 2),
        "packing_efficiency": round(eff * 100, 2),
        "height_uniformity":  round(uni, 4),
        "rejection_rate":     round(rej, 4),
        "mean_spacing_m":     round(mean_spacing(dump_positions), 3),
        "latency_ms":         round(float(np.mean(latencies)), 3),
    }


# ── Aggregate stats ───────────────────────────────────────────────────────────

def aggregate(rows: list, key: str) -> dict:
    vals = [r[key] for r in rows if key in r and isinstance(r[key], (int, float))]
    if not vals:
        return {"mean": None, "std": None, "min": None, "max": None}
    return {
        "mean": round(float(np.mean(vals)), 3),
        "std":  round(float(np.std(vals)),  3),
        "min":  round(float(np.min(vals)),  3),
        "max":  round(float(np.max(vals)),  3),
    }


KPI_KEYS = [
    "volume_m3", "coverage_pct", "packing_efficiency",
    "height_uniformity", "rejection_rate", "mean_spacing_m", "latency_ms",
]


def summarise(results: list, policy_name: str) -> dict:
    rows  = [r for r in results if r.get("policy") == policy_name]
    aggs  = {k: aggregate(rows, k) for k in KPI_KEYS}
    n     = len(rows)
    # generalisation = std of packing_efficiency across polygons (lower is better)
    eff_vals = [r["packing_efficiency"] for r in rows if "packing_efficiency" in r]
    gen_delta = round(float(np.std(eff_vals)), 3) if len(eff_vals) > 1 else 0.0
    aggs["generalisation_delta"] = gen_delta
    return {"policy": policy_name, "n_polygons": n, "kpis": aggs}


# ── Terminal table ────────────────────────────────────────────────────────────

def print_table(summaries: list):
    print()
    print("┌─────────────────────────────────────────────────────────────────────────┐")
    print("│                       ADIOS BENCHMARK RESULTS                          │")
    print("├──────────────────────────┬────────────────┬────────────────┬───────────┤")
    print(f"│ {'KPI':<24} │ {'ADIOS (heuristic)':^14} │ {'Static Grid':^14} │ {'ML PPO':^9} │")
    print("├──────────────────────────┼────────────────┼────────────────┼───────────┤")

    def _cell(s: dict | None, key: str) -> str:
        if s is None:
            return "  —  "
        v = s["kpis"].get(key, {})
        if isinstance(v, dict) and v.get("mean") is not None:
            return f"{v['mean']:>6.2f} ±{v['std']:.2f}"
        return "  N/A "

    rows_def = [
        ("Volume (m³)",          "volume_m3"),
        ("Coverage (%)",         "coverage_pct"),
        ("Pack Efficiency (%)",  "packing_efficiency"),
        ("Height Uniformity",    "height_uniformity"),
        ("Rejection Rate",       "rejection_rate"),
        ("Mean Spacing (cells)", "mean_spacing_m"),
        ("Latency (ms/dispatch)","latency_ms"),
        ("Generalisation δ",     "generalisation_delta"),
    ]

    by_policy = {s["policy"]: s for s in summaries}
    h = by_policy.get("heuristic")
    st = by_policy.get("static_grid")
    ml = by_policy.get("ml_ppo")

    for label, key in rows_def:
        if key == "generalisation_delta":
            hv  = f"{h['kpis'][key]:.3f}"  if h  else "—"
            stv = f"{st['kpis'][key]:.3f}" if st else "—"
            mlv = f"{ml['kpis'][key]:.3f}" if ml else "—"
        else:
            hv  = _cell(h,  key)
            stv = _cell(st, key)
            mlv = _cell(ml, key) if ml else "  —  "
        print(f"│ {label:<24} │ {hv:^14} │ {stv:^14} │ {mlv:^9} │")

    print("└──────────────────────────┴────────────────┴────────────────┴───────────┘")
    print()


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    args   = parse_args()
    fleet  = make_fleet(args.fleet)
    MATERIALS = ["rock", "ore", "overburden", "default"]

    results = []
    t_global = time.time()

    print(f"\nADIOS Benchmark  |  {args.polygons} polygons  |  {args.dumps} dumps each")
    print(f"Seeds {args.seed_start} – {args.seed_start + args.polygons - 1}")
    print("─" * 60)

    for i in range(args.polygons):
        seed = args.seed_start + i
        mat  = MATERIALS[i % len(MATERIALS)]
        if not args.quiet:
            print(f"  [{i+1:2d}/{args.polygons}] seed={seed}  material={mat}")

        # ── Heuristic
        t_h = Terrain.make_demo_polygon(100, 100, mat, seed)
        h_kpis = run_heuristic(t_h, fleet, args.dumps)
        h_kpis.update({"seed": seed, "material": mat})
        results.append(h_kpis)

        # ── Static baseline
        t_s = Terrain.make_demo_polygon(100, 100, mat, seed)
        s_kpis = run_static(t_s)
        s_kpis.update({"seed": seed, "material": mat})
        results.append(s_kpis)

        # ── ML (optional)
        if args.use_ml:
            t_m = Terrain.make_demo_polygon(100, 100, mat, seed)
            m_kpis = run_ml(t_m, fleet, args.dumps, args.ml_weights)
            m_kpis.update({"seed": seed, "material": mat})
            results.append(m_kpis)

    elapsed = time.time() - t_global
    print(f"\n  Completed {args.polygons} polygons in {elapsed:.1f}s")

    # ── Summaries
    policies = ["heuristic", "static_grid"]
    if args.use_ml:
        policies.append("ml_ppo")
    summaries = [summarise(results, p) for p in policies]

    print_table(summaries)

    # ── Persist
    out = {
        "meta": {
            "n_polygons": args.polygons,
            "n_dumps_per_polygon": args.dumps,
            "seed_start": args.seed_start,
            "fleet": args.fleet,
            "elapsed_s": round(elapsed, 1),
        },
        "per_polygon": results,
        "summaries": summaries,
    }
    out_path = os.path.join(os.path.dirname(__file__), "..", args.out)
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2)
    print(f"  Results written → {out_path}\n")

    # ── Also write the "baseline" file that the frontend reads from /benchmark
    baseline_path = os.path.join(
        os.path.dirname(__file__), "..", "data/benchmark/benchmark_baseline.json"
    )
    Path(baseline_path).parent.mkdir(parents=True, exist_ok=True)
    # Reshape to the format BenchmarkPanel.tsx expects:
    # [ { seed, material, heuristic: { dumps, volume, coverage_pct, efficiency, uniformity } } ]
    baseline = []
    for r in results:
        if r.get("policy") == "heuristic":
            baseline.append({
                "seed":     r["seed"],
                "material": r["material"],
                "heuristic": {
                    "dumps":        r.get("dumps_succeeded", 0),
                    "volume":       r.get("volume_m3", 0),
                    "coverage_pct": r.get("coverage_pct", 0),
                    "efficiency":   r.get("packing_efficiency", 0),
                    "uniformity":   r.get("height_uniformity", 0),
                },
            })
    with open(baseline_path, "w") as f:
        json.dump(baseline, f, indent=2)
    print(f"  Frontend baseline → {baseline_path}")


if __name__ == "__main__":
    main()
