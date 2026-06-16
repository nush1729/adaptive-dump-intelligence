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
from planning.action_masker import ConstrainedActionMasker
from evaluation.metrics import mean_spacing, summarize_episode
from config import SITE_CONFIG, config_payload


class NumpyEncoder(json.JSONEncoder):
    """JSON encoder that handles numpy types."""
    def default(self, obj):
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)


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

def run_heuristic(terrain: Terrain, fleet, n_dumps: int) -> dict:
    """Run one episode with the heuristic scorer. Returns KPI dict."""
    weights = dict(DEFAULT_WEIGHTS)
    entry   = terrain.entry
    eng     = ScoringEngine(terrain, entry, weights)
    val     = IsolationValidator(terrain, entry, SITE_CONFIG.iso_threshold, SITE_CONFIG.min_dump_spacing_cells)

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
                dump_positions.append((r, c))
                val.record_dump(r, c)
                placed = True
            else:
                reserved.add((r, c))
                continue
            break

        latency_ms = (time.perf_counter() - t0) * 1000
        latencies.append(latency_ms)
        if not placed:
            rejected += 1
            print(f"TRUCK REJECTED: last r, c = {r}, {c}")

    log = [{"status": "dumped"} for _ in range(success)] + [{"status": "rejected"} for _ in range(rejected)]
    summary = summarize_episode(terrain, log, latencies, dump_positions, "heuristic")
    return {
        "policy":           "heuristic",
        "dumps_attempted":  total,
        "dumps_succeeded":  success,
        "volume_m3":        summary["total_volume"],
        "coverage_pct":     summary["coverage_pct"],
        "packing_efficiency": summary["packing_efficiency"],
        "height_uniformity":  summary["height_uniformity"],
        "filled_uniformity":  summary["filled_uniformity"],
        "rejection_rate":     summary["rejection_rate"],
        "iso_rejection_rate": summary["iso_rejection_rate"],
        "mean_spacing_m":     summary["mean_spacing_m"],
        "latency_ms":         summary["latency_ms"],
        "latency_p95_ms":     summary["latency_p95_ms"],
    }


def run_static(terrain: Terrain, fleet, n_dumps: int = 60, step: int | None = None) -> dict:
    """Autonomous fixed-grid baseline — uniform lattice spaced at the
    real-world autonomous dump spacing (SITE_CONFIG.autonomous_spacing_m,
    ~7.38m), not an arbitrary grid stride. This is the conservative,
    rule-based pattern autonomous haul systems fall back to: sparse,
    perfectly regular, and prone to leaving coverage gaps near irregular
    polygon edges (matches the 'Autonomous Dump Pattern with missed Dumps'
    reference imagery)."""
    rs, cs = np.where(terrain.mask)
    cell_side_m = SITE_CONFIG.cell_area_m2 ** 0.5
    step = int(step or round(SITE_CONFIG.autonomous_spacing_m / cell_side_m))
    step = max(step, 1)
    t0 = time.perf_counter()
    positions = []
    log = []
    val = IsolationValidator(terrain, terrain.entry, SITE_CONFIG.iso_threshold, SITE_CONFIG.min_dump_spacing_cells)
    dispatches = [(t.truck_id, t.payload_t) for t in fleet] * (n_dumps // len(fleet) + 1)
    dispatches = dispatches[:n_dumps]
    grid_cells = [(int(r), int(c)) for r in range(int(rs.min()), int(rs.max()) + 1, step)
                  for c in range(int(cs.min()), int(cs.max()) + 1, step) if terrain.mask[r, c]]
    cell_i = 0
    for i, (truck_id, payload_t) in enumerate(dispatches):
        placed = False
        while cell_i < len(grid_cells):
            r, c = grid_cells[cell_i]
            cell_i += 1
            safe, _ = val.validate(r, c, payload_t)
            if not safe:
                continue
            ok, reason = terrain.apply_dump(r, c, payload_t)
            if ok:
                val.record_dump(r, c)
                positions.append((r, c))
                log.append({"t": i, "truck": truck_id, "status": "dumped", "r": r, "c": c})
                placed = True
                break
        if not placed:
            log.append({"t": i, "truck": truck_id, "status": "no_space", "r": 0, "c": 0})
    latency_ms = (time.perf_counter() - t0) * 1000 / max(len(dispatches), 1)
    summary = summarize_episode(terrain, log, [latency_ms] * len(dispatches), positions, "static_grid")
    return {
        "policy":             "static_grid",
        "dumps_succeeded":    len(positions),
        "volume_m3":          summary["total_volume"],
        "coverage_pct":       summary["coverage_pct"],
        "packing_efficiency": summary["packing_efficiency"],
        "height_uniformity":  summary["height_uniformity"],
        "filled_uniformity":  summary["filled_uniformity"],
        "rejection_rate":     summary["rejection_rate"],
        "iso_rejection_rate": summary["iso_rejection_rate"],
        "mean_spacing_m":     summary["mean_spacing_m"],
        "latency_ms":         summary["latency_ms"],
        "latency_p95_ms":     summary["latency_p95_ms"],
    }


def run_staffed(terrain: Terrain, fleet, n_dumps: int = 60, seed: int = 0) -> dict:
    """Staffed/manual operator baseline — tight, organic spacing
    (SITE_CONFIG.staffed_spacing_m, ~3.03m) with randomised local jitter
    rather than a rigid lattice. Models a human operator who packs piles
    closer together and adapts placement to terrain by eye, producing the
    dense, irregular row patterns seen in the 'Staffed Dump Pattern with
    no missed Dumps' reference imagery — denser and less wasteful of
    polygon area than a fixed autonomous grid, but not constraint-aware
    like ADIOS."""
    rng = np.random.default_rng(seed)
    rs, cs = np.where(terrain.mask)
    cell_side_m = SITE_CONFIG.cell_area_m2 ** 0.5
    base_step = max(1, round(SITE_CONFIG.staffed_spacing_m / cell_side_m))
    jitter = max(1, base_step // 2)

    t0 = time.perf_counter()
    positions = []
    log = []
    val = IsolationValidator(terrain, terrain.entry, SITE_CONFIG.iso_threshold, SITE_CONFIG.min_dump_spacing_cells)
    dispatches = [(t.truck_id, t.payload_t) for t in fleet] * (n_dumps // len(fleet) + 1)
    dispatches = dispatches[:n_dumps]

    r0, r1 = int(rs.min()), int(rs.max())
    c0, c1 = int(cs.min()), int(cs.max())
    # Loosely-spaced lattice of "intended" spots, each perturbed by the
    # operator's eye — organic rather than perfectly regular.
    candidates = []
    for r in range(r0, r1 + 1, base_step):
        for c in range(c0, c1 + 1, base_step):
            jr = int(np.clip(r + rng.integers(-jitter, jitter + 1), r0, r1))
            jc = int(np.clip(c + rng.integers(-jitter, jitter + 1), c0, c1))
            if terrain.mask[jr, jc]:
                candidates.append((jr, jc))
    # Row-major order (not shuffled) — an operator works the site
    # methodically row by row, producing tight neighbour spacing rather
    # than scattering dumps randomly across the polygon.

    cell_i = 0
    for i, (truck_id, payload_t) in enumerate(dispatches):
        placed = False
        while cell_i < len(candidates):
            r, c = candidates[cell_i]
            cell_i += 1
            safe, _ = val.validate(r, c, payload_t)
            if not safe:
                continue
            ok, reason = terrain.apply_dump(r, c, payload_t)
            if ok:
                val.record_dump(r, c)
                positions.append((r, c))
                log.append({"t": i, "truck": truck_id, "status": "dumped", "r": r, "c": c})
                placed = True
                break
        if not placed:
            log.append({"t": i, "truck": truck_id, "status": "no_space", "r": 0, "c": 0})
    latency_ms = (time.perf_counter() - t0) * 1000 / max(len(dispatches), 1)
    summary = summarize_episode(terrain, log, [latency_ms] * len(dispatches), positions, "staffed_manual")
    return {
        "policy":             "staffed_manual",
        "dumps_succeeded":    len(positions),
        "volume_m3":          summary["total_volume"],
        "coverage_pct":       summary["coverage_pct"],
        "packing_efficiency": summary["packing_efficiency"],
        "height_uniformity":  summary["height_uniformity"],
        "filled_uniformity":  summary["filled_uniformity"],
        "rejection_rate":     summary["rejection_rate"],
        "iso_rejection_rate": summary["iso_rejection_rate"],
        "mean_spacing_m":     summary["mean_spacing_m"],
        "latency_ms":         summary["latency_ms"],
        "latency_p95_ms":     summary["latency_p95_ms"],
    }


def run_ml(terrain: Terrain, fleet, n_dumps: int, weights_path: str) -> dict:
    """Run one episode with the neural policy using robust action masking and retry loop."""
    try:
        from ml.policy import load_policy
        from scipy.ndimage import distance_transform_edt
        from ml.environment import build_context_vector, _compute_pile_mask, _compute_spacing_density
        policy = load_policy(weights_path)
    except Exception as e:
        return {"policy": "ml_error", "error": str(e)}

    val = IsolationValidator(terrain, terrain.entry, SITE_CONFIG.iso_threshold, SITE_CONFIG.min_dump_spacing_cells)
    dispatches = [(t.truck_id, t.payload_t) for t in fleet] * (n_dumps // len(fleet) + 1)
    dispatches  = dispatches[:n_dumps]
    COLS        = terrain.cols
    _dump_counts: dict = {}

    def _obs(t: Terrain, truck_id: str, payload_t: float, dump_idx: int) -> dict:
        h      = t.height
        mask   = t.mask.astype(np.float32)
        h_n    = np.clip(h / SITE_CONFIG.max_height_m, 0.0, 1.0).astype(np.float32)
        dist   = distance_transform_edt(t.mask).astype(np.float32)
        d_n    = dist / (dist.max() or 1.0)
        pile   = _compute_pile_mask(h)
        density = _compute_spacing_density(h, t.mask)
        terrain_map = np.stack([h_n, mask, d_n, pile, density], axis=0)
        progress = dump_idx / max(n_dumps, 1)
        iot = np.array([
            min(progress * 1.5, 1.0), float(np.random.uniform(0.0, 0.6)),
            progress, min(progress * 1.2, 1.0),
            float(np.clip(np.random.uniform(0.6, 1.0), 0.0, 1.0)),
            float(np.clip(1.0 - 0.15 * progress, 0.0, 1.0)),
            0.8, float(np.random.uniform(0.0, 0.7)),
        ], dtype=np.float32)
        ctx = build_context_vector(truck_id, payload_t, _dump_counts.get(truck_id, 0), t.material, iot)
        return {"terrain_map": terrain_map, "context_vector": ctx}

    total, success, rejected = 0, 0, 0
    latencies, dump_positions = [], []
    reserved = set()

    for dump_idx, (truck_id, payload_t) in enumerate(dispatches):
        total += 1
        t0 = time.perf_counter()
        placed = False

        for _attempt in range(50):
            obs = _obs(terrain, truck_id, payload_t, dump_idx)

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
                dump_positions.append((r, c))
                val.record_dump(r, c)
                _dump_counts[truck_id] = _dump_counts.get(truck_id, 0) + 1
                placed = True
                reserved.discard((r, c))
                break
            else:
                reserved.add((r, c))

        latency_ms = (time.perf_counter() - t0) * 1000
        latencies.append(latency_ms)
        if not placed:
            rejected += 1

    policy_name = getattr(policy, "artifact_type", "unknown_ml")
    log = [{"status": "dumped"} for _ in range(success)] + [{"status": "rejected"} for _ in range(rejected)]
    summary = summarize_episode(terrain, log, latencies, dump_positions, policy_name)

    return {
        "policy":             policy_name,
        "dumps_attempted":    total,
        "dumps_succeeded":    success,
        "volume_m3":          summary["total_volume"],
        "coverage_pct":       summary["coverage_pct"],
        "packing_efficiency": summary["packing_efficiency"],
        "height_uniformity":  summary["height_uniformity"],
        "filled_uniformity":  summary["filled_uniformity"],
        "rejection_rate":     summary["rejection_rate"],
        "iso_rejection_rate": summary["iso_rejection_rate"],
        "mean_spacing_m":     summary["mean_spacing_m"],
        "latency_ms":         summary["latency_ms"],
        "latency_p95_ms":     summary["latency_p95_ms"],
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
    print(f"│ {'KPI':<24} │ {'ADIOS (heuristic)':^14} │ {'Static Grid':^14} │ {'ML':^9} │")
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
    ml = next((s for s in summaries if s["policy"] not in ("heuristic", "static_grid")), None)

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

    # Always try to load ML policy for evaluation (graceful if missing)
    ml_available = False
    if not args.use_ml:
        # Even without --use-ml flag, attempt ML for baseline generation
        try:
            from ml.policy import load_policy
            _test_policy = load_policy(args.ml_weights)
            ml_available = True
            if not args.quiet:
                print(f"  ML policy found — including ML evaluation")
        except Exception as e:
            if not args.quiet:
                print(f"  ML policy not available ({e}) — heuristic + static only")
    else:
        ml_available = True

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
        s_kpis = run_static(t_s, fleet, n_dumps=args.dumps)
        s_kpis.update({"seed": seed, "material": mat})
        results.append(s_kpis)

        # ── ML (always attempt if weights exist)
        if ml_available or args.use_ml:
            t_m = Terrain.make_demo_polygon(100, 100, mat, seed)
            m_kpis = run_ml(t_m, fleet, args.dumps, args.ml_weights)
            m_kpis.update({"seed": seed, "material": mat})
            results.append(m_kpis)

    elapsed = time.time() - t_global
    print(f"\n  Completed {args.polygons} polygons in {elapsed:.1f}s")

    # ── Summaries
    # Determine which policies have results
    found_policies = set(r.get("policy") for r in results)
    policies = ["heuristic", "static_grid"]
    policies.extend(sorted(p for p in found_policies if p not in ("heuristic", "static_grid", "ml_error", None)))
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
            "config": config_payload(),
        },
        "per_polygon": results,
        "summaries": summaries,
    }
    out_path = os.path.join(os.path.dirname(__file__), "..", args.out)
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2, cls=NumpyEncoder)
    print(f"  Results written → {out_path}\n")

    if args.out != "data/benchmark/benchmark_results.json":
        return

    # ── Also write the "baseline" file that the frontend reads from /benchmark
    baseline_path = os.path.join(
        os.path.dirname(__file__), "..", "data/benchmark/benchmark_baseline.json"
    )
    Path(baseline_path).parent.mkdir(parents=True, exist_ok=True)
    # Reshape to the format BenchmarkPanel.tsx expects:
    # [ { seed, material, heuristic: {...}, ml: {...} (optional) } ]
    # Group results by seed
    by_seed = {}
    for r in results:
        seed = r.get("seed")
        if seed is None:
            continue
        if seed not in by_seed:
            by_seed[seed] = {"seed": seed, "material": r.get("material", "default")}
        policy = r.get("policy")
        row_data = {
            "dumps":        r.get("dumps_succeeded", 0),
            "volume":       r.get("volume_m3", 0),
            "coverage_pct": r.get("coverage_pct", 0),
            "efficiency":   r.get("packing_efficiency", 0),
            "uniformity":   r.get("height_uniformity", 0),
        }
        if policy == "heuristic":
            by_seed[seed]["heuristic"] = row_data
        elif policy not in ("heuristic", "static_grid"):
            by_seed[seed]["ml"] = row_data
        elif policy == "static_grid":
            by_seed[seed]["static"] = row_data
    baseline = list(by_seed.values())
    with open(baseline_path, "w") as f:
        json.dump(baseline, f, indent=2, cls=NumpyEncoder)
    print(f"  Frontend baseline → {baseline_path}")


if __name__ == "__main__":
    main()
