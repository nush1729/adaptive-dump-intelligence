"""
ADIOS v3 FastAPI backend.

Endpoints:
  GET  /health               system + model status
  GET  /fleet_specs          truck specs
  POST /simulate             full run → returns terrain, metrics, snapshots
  POST /simulate/ml          same but uses trained PPO policy
  POST /tune                 weight auto-tuner
  GET  /benchmark            load pre-computed benchmark results
  GET  /audit                load last audit log
  WS   /ws/simulate          real-time step-by-step streaming (heuristic)
  WS   /ws/simulate/ml       real-time step-by-step streaming (ML policy)
"""
import asyncio
import json, os, sys, time
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any, List, Optional, Dict

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from environment.terrain import Terrain
from fleet.truck import make_fleet, CAT_SPECS
from planning.orchestrator import ADIOSOrchestrator
from planning.weight_tuner import WeightTuner
from planning.scorer import ScoringEngine, DEFAULT_WEIGHTS
from planning.isolation_validator import IsolationValidator

# ── optional ML imports ───────────────────────────────────────────────────────
ML_AVAILABLE = False
_policy_cache = {}
WEIGHTS_PATH = os.path.join(os.path.dirname(__file__), "..", "ml", "weights", "ppo_adios")

def _load_policy_cached(device="cpu", raise_on_fail=False):
    if "policy" not in _policy_cache:
        try:
            from ml.policy import load_policy
            _policy_cache["policy"] = load_policy(WEIGHTS_PATH, device)
            _policy_cache["type"] = "ppo"
            print("  ML policy loaded from weights")
        except Exception as e:
            print(f"  ML weights not found ({e})")
            if raise_on_fail:
                raise RuntimeError(f"ML policy load failed: {e}")
            _policy_cache["policy"] = None
            _policy_cache["type"] = "heuristic"
    elif raise_on_fail and _policy_cache["policy"] is None:
        raise RuntimeError("ML policy was not found previously.")
    return _policy_cache["policy"], _policy_cache["type"]

try:
    from ml.environment import DumpPackingEnv
    ML_AVAILABLE = True
except ImportError:
    pass

# ── app ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="ADIOS v3 API", version="3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

AUDIT_PATH = "/tmp/adios_audit_v3.json"

# ── models ────────────────────────────────────────────────────────────────────
class SimConfig(BaseModel):
    rows: int = 100
    cols: int = 100
    material: str = "default"
    n_dumps: int = 60
    fleet_models: List[str] = ["Cat793", "Cat777", "Cat797", "Cat793"]
    weights: Optional[dict] = None
    iso_threshold: float = 0.85
    auto_tune: bool = False
    seed: int = 42
    use_ml: bool = False

class TuneConfig(BaseModel):
    material: str = "default"
    n_trials: int = 30
    seed: int = 42

# ── helpers ───────────────────────────────────────────────────────────────────
def _sanitize_for_json(value: Any) -> Any:
    """
    Recursively convert numpy/scalar containers into JSON-safe values.
    Replaces NaN/Inf/-Inf with finite numbers so FastAPI serialization never fails.
    """
    if isinstance(value, np.ndarray):
        cleaned = np.nan_to_num(value, nan=0.0, posinf=0.0, neginf=0.0)
        return cleaned.tolist()

    if isinstance(value, (np.floating, float)):
        scalar = float(value)
        if not np.isfinite(scalar):
            return 0.0
        return scalar

    if isinstance(value, (np.integer, int)):
        return int(value)

    if isinstance(value, (np.bool_, bool)):
        return bool(value)

    if isinstance(value, tuple):
        return [_sanitize_for_json(item) for item in value]

    if isinstance(value, list):
        return [_sanitize_for_json(item) for item in value]

    if isinstance(value, dict):
        return {key: _sanitize_for_json(item) for key, item in value.items()}

    return value

def _terrain_payload(terrain: Terrain, weights: Optional[dict] = None) -> dict:
    sm = None
    try:
        if weights is None:
            weights = DEFAULT_WEIGHTS
        eng = ScoringEngine(terrain, terrain.entry, weights)
        _, _, sm_arr = eng.score_all()
        if sm_arr is not None:
            sm_clean = np.zeros_like(sm_arr, dtype=float)
            sm_clean[terrain.mask] = np.nan_to_num(
                sm_arr[terrain.mask], nan=0.0, posinf=0.0, neginf=0.0
            )
            sm = sm_clean.tolist()
    except Exception as e:
        print(f"  [scorer] Error computing score_map: {e}")
        pass
    return _sanitize_for_json({
        "surface": terrain.to_json_surface(),
        "slope_map": terrain.slope_map().tolist(),
        "mask": terrain.mask.tolist(),
        "entry": list(terrain.entry),
        "score_map": sm,
    })

def _build_obs(t):
    from scipy.ndimage import distance_transform_edt
    import numpy as np
    h = t.height
    mask = t.mask.astype(np.float32)
    max_h = 15.0
    h_norm = np.clip(h / max_h, 0.0, 1.0).astype(np.float32)
    dist_arr = distance_transform_edt(t.mask)  # type: ignore
    if isinstance(dist_arr, tuple):
        dist_arr = dist_arr[0]
    dist = np.asarray(dist_arr, dtype=np.float32)
    dist_norm = dist / (dist.max() or 1.0)
    return np.stack([h_norm, mask, dist_norm], axis=0)

def _run_ml_episode(terrain: Terrain, fleet, n_dumps: int, iso_threshold: float) -> tuple:
    """Run one episode with the PPO policy. Returns (log, snapshots)."""
    try:
        policy, ptype = _load_policy_cached(raise_on_fail=True)
    except RuntimeError as e:
        return None, None

    val = IsolationValidator(terrain, terrain.entry, iso_threshold)
    log, snapshots = [], []
    mask_flat = terrain.mask.ravel()
    COLS = terrain.cols

    dispatches = [(t.truck_id, t.payload_t) for t in fleet] * (n_dumps // len(fleet) + 1)
    dispatches = dispatches[:n_dumps]

    for i, (truck_id, payload_t) in enumerate(dispatches):
        placed = False
        masks_arr = mask_flat.copy().reshape((ROWS, COLS))
        
        for _attempt in range(50):
            obs = _build_obs(terrain)
            action = policy.predict(obs, masks_arr.ravel())
            r, c = divmod(int(action), COLS)

            safe, reach = val.validate(r, c, payload_t)
            if not safe:
                masks_arr[r, c] = 0  # mask out and retry
                log.append({"t": i, "truck": truck_id, "r": r, "c": c,
                            "status": f"iso_rejected({reach:.2f})", "payload_t": payload_t,
                            "volume": terrain.total_volume(), "coverage": terrain.coverage_fraction()})
                continue

            ok, reason = terrain.apply_dump(r, c, payload_t)
            status = "dumped" if ok else reason
            log.append({"t": i, "truck": truck_id, "r": r, "c": c, "status": status,
                        "payload_t": payload_t, "reach": reach if ok else None,
                        "volume": terrain.total_volume(), "coverage": terrain.coverage_fraction()})
            
            if ok:
                val.record_dump(r, c)
                placed = True
            else:
                masks_arr[r, c] = 0
                continue
            
            break

        if placed:
            snapshots.append({
                "dump_n": terrain.dump_count, "truck": truck_id, "r": r, "c": c,
                "volume": terrain.total_volume(),
                "coverage": terrain.coverage_fraction(),
                "efficiency": terrain.packing_efficiency(),
                "policy": ptype,
            })
    return log, snapshots

# ── routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    policy, ptype = _load_policy_cached()
    return {
        "status": "ok",
        "version": "3.0",
        "ml_available": ML_AVAILABLE,
        "policy_type": ptype,
        "weights_path": WEIGHTS_PATH,
    }

@app.get("/fleet_specs")
def fleet_specs():
    return CAT_SPECS

def _run_simulation_sync(cfg: SimConfig) -> dict:
    """
    Synchronous simulation runner.
    This is the CPU-bound work that gets offloaded to a thread pool.
    """
    t0 = time.time()
    terrain = Terrain.make_demo_polygon(cfg.rows, cfg.cols, cfg.material, cfg.seed)
    weights = cfg.weights or dict(DEFAULT_WEIGHTS)

    if cfg.auto_tune:
        def factory(): return Terrain.make_demo_polygon(cfg.rows, cfg.cols, cfg.material, cfg.seed)
        tuner = WeightTuner(weights, n_trials=20)
        weights, _ = tuner.tune(factory)

    fleet = make_fleet(cfg.fleet_models)

    actual_policy = "heuristic"  # Track what was ACTUALLY used
    if cfg.use_ml:
        try:
            log, snapshots = _run_ml_episode(terrain, fleet, cfg.n_dumps, cfg.iso_threshold)
            if log is not None:
                actual_policy = "ml_ppo"
            else:
                # ML returned None — fall back
                cfg.use_ml = False
        except RuntimeError:
            cfg.use_ml = False
            log = None

    if not cfg.use_ml or log is None:
        orch = ADIOSOrchestrator(terrain, weights=weights, audit_path=AUDIT_PATH)
        orch.validator.reach_thresh = cfg.iso_threshold
        dispatches = [(t.truck_id, t.payload_t) for t in fleet] * (cfg.n_dumps // len(fleet) + 1)
        dispatches = dispatches[:cfg.n_dumps]
        log = orch.run(dispatches)
        snapshots = orch.snapshots
        actual_policy = "heuristic"

    summary = {
        "total_dispatched": len(log),
        "successful_dumps": sum(1 for x in log if x["status"] == "dumped"),
        "rejected": sum(1 for x in log if x["status"] != "dumped"),
        "total_volume": terrain.total_volume(),
        "coverage_pct": round(terrain.coverage_fraction() * 100, 2),
        "packing_efficiency": round(terrain.packing_efficiency() * 100, 2),
        "mean_height": round(terrain.mean_height(), 3),
        "height_uniformity": round(terrain.packing_efficiency(), 3),
        "isolation_events": sum(1 for x in log if "iso" in str(x.get("status", ""))),
        "latency_ms": round((time.time() - t0) * 1000, 1),
        "policy": actual_policy,
    }

    # static baseline
    static_t = Terrain.make_demo_polygon(cfg.rows, cfg.cols, cfg.material, cfg.seed)
    step = 8
    rs, cs = np.where(static_t.mask)
    for r in range(int(rs.min()), int(rs.max()), step):
        for c in range(int(cs.min()), int(cs.max()), step):
            if static_t.mask[r, c]:
                static_t.apply_dump(r, c, 100.0)

    payload = _terrain_payload(terrain, weights)
    payload.update({
        "summary": summary,
        "weights_used": weights,
        "static_surface": static_t.to_json_surface(),
        "snapshots": snapshots,
        "log": log[-30:],
        "static_summary": {
            "volume": static_t.total_volume(),
            "coverage_pct": round(static_t.coverage_fraction() * 100, 2),
            "packing_efficiency": round(static_t.packing_efficiency() * 100, 2),
        },
    })
    return _sanitize_for_json(payload)

@app.post("/simulate")
async def simulate(cfg: SimConfig):
    """
    Async endpoint that offloads heavy simulation to thread pool.
    This prevents the event loop from blocking while running CPU-bound work.
    """
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _run_simulation_sync, cfg)
    return _sanitize_for_json(result)

@app.post("/tune")
async def tune_weights(cfg: TuneConfig):
    """Async weight tuning — offload CPU-bound tuner to thread pool"""
    def _tune_sync():
        def factory(): return Terrain.make_demo_polygon(rows=100, cols=100, material=cfg.material, seed=cfg.seed)
        tuner = WeightTuner(dict(DEFAULT_WEIGHTS), n_trials=cfg.n_trials)
        best_w, best_score = tuner.tune(factory)
        return {"weights": best_w, "score": best_score}
    
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _tune_sync)
    return _sanitize_for_json(result)

@app.get("/benchmark")
def get_benchmark():
    base = os.path.join(os.path.dirname(__file__), "..", "data", "benchmark")
    # Prefer full results (has both heuristic + static_grid per seed + summaries)
    full_path = os.path.join(base, "benchmark_results.json")
    if os.path.exists(full_path):
        with open(full_path) as f:
            return _sanitize_for_json(json.load(f))
    # Fall back to baseline (legacy: only heuristic rows in simplified format)
    baseline_path = os.path.join(base, "benchmark_baseline.json")
    if os.path.exists(baseline_path):
        with open(baseline_path) as f:
            return _sanitize_for_json(json.load(f))
    return _sanitize_for_json({"error": "Benchmark not generated yet. Run: python evaluation/benchmark.py"})

@app.get("/audit")
def get_audit():
    if os.path.exists(AUDIT_PATH):
        with open(AUDIT_PATH) as f:
            return _sanitize_for_json(json.load(f))
    return []

@app.get("/eval_result")
def get_eval_result():
    path = os.path.join(os.path.dirname(__file__), "..", "ml", "weights", "eval_result.json")
    if os.path.exists(path):
        with open(path) as f:
            return _sanitize_for_json(json.load(f))
    return _sanitize_for_json({"ml_efficiency": None, "heuristic_efficiency": None, "delta": None})

# ── WebSocket: real-time streaming ───────────────────────────────────────────

@app.get("/schedule")
def get_schedule(n_trucks: int = 4, n_dumps: int = 40, seed: int = 42):
    """
    Build a truck dispatch timeline using the real TimeSpaceScheduler
    and the actual ADIOSOrchestrator log to map physical paths to time.
    """
    import numpy as np
    from planning.scheduler import TimeSpaceScheduler
    from planning.pathfinder import find_path

    rng = np.random.default_rng(seed)

    # ── terrain + fleet + orchestrator ───────────────────────────────────────
    terrain = Terrain.make_demo_polygon(100, 100, "default", seed)
    truck_names = [f"T{i+1}" for i in range(n_trucks)]
    payloads = rng.choice([50.0, 100.0, 240.0, 400.0], size=n_trucks, replace=True)
    
    orch = ADIOSOrchestrator(terrain)
    dispatches = []
    for i in range(n_dumps):
        tid = i % n_trucks
        p = round(float(payloads[tid]) * float(rng.uniform(0.9, 1.1)), 1)
        dispatches.append((truck_names[tid], p))
        
    log = orch.run(dispatches)

    # ── scheduler ───────────────────────────────────────────────────────────
    total_ticks = n_dumps * 8 + 50
    scheduler = TimeSpaceScheduler(rows=terrain.rows, cols=terrain.cols, T=total_ticks)

    timeline = []
    truck_free_at = [0] * n_trucks

    start_r, start_c = terrain.entry
    
    for i, event in enumerate(log):
        tid = int(i % n_trucks)
        truck = truck_names[tid]
        p = event["payload_t"]
        status = event["status"]
        r, c = event["r"], event["c"]
        
        start = int(truck_free_at[tid])
        
        if status == "dumped" or status.startswith("iso_rejected") or status.startswith("slope"):
            # find actual path
            actual_path = find_path(terrain.height, terrain.mask, (int(start_r), int(start_c)), (r, c))
            if not actual_path:
                actual_path = [(r, c)]
            
            # approximate travel duration based on path length (e.g. 1 tick per 2 cells) + dump time
            travel_ticks = max(1, len(actual_path) // 2)
            duration = travel_ticks + int(rng.integers(2, 5))
            
            reserved, actual_start = scheduler.try_reserve(truck, actual_path, t0=start)
            
            t_start = actual_start if reserved else start
            t_end = t_start + duration
        else:
            # no space / invalid
            t_start = start
            duration = int(rng.integers(1, 3))
            t_end = t_start + duration
            
        truck_free_at[tid] = t_end + int(rng.integers(1, 3))
        
        # Deadlock check
        if scheduler.has_cycle():
            for stuck in scheduler.livelock_trucks(thresh=8):
                scheduler.release(stuck)

        timeline.append({
            "truck_id": truck,
            "payload_t": p,
            "start_tick": t_start,
            "end_tick": t_end,
            "status": status,
            "r": r, "c": c,
            "dump_seq": i,
        })

    # queue = last known state per truck
    queue: dict = {}
    for item in timeline:
        queue[item["truck_id"]] = item
    queue_list = sorted(queue.values(), key=lambda x: x["truck_id"])

    actual_total = max((x["end_tick"] for x in timeline), default=0) + 5

    return _sanitize_for_json({
        "timeline":    timeline,
        "queue":       queue_list,
        "n_trucks":    n_trucks,
        "total_ticks": actual_total,
    })
@app.websocket("/ws/simulate")
async def ws_simulate(ws: WebSocket):
    await ws.accept()
    try:
        raw = await ws.receive_text()
        cfg = SimConfig(**json.loads(raw))
        terrain = Terrain.make_demo_polygon(cfg.rows, cfg.cols, cfg.material, cfg.seed)
        weights = cfg.weights or dict(DEFAULT_WEIGHTS)
        fleet = make_fleet(cfg.fleet_models)

        # FIX: use ScoringEngine for intelligent cell selection
        from planning.scorer import ScoringEngine
        eng = ScoringEngine(terrain, terrain.entry, weights)
        val = IsolationValidator(terrain, terrain.entry, cfg.iso_threshold)

        dispatches = [(t.truck_id, t.payload_t) for t in fleet] * (cfg.n_dumps // len(fleet) + 1)
        dispatches = dispatches[:cfg.n_dumps]
        success_count = 0
        reject_count  = 0

        policy = None
        ptype = "heuristic"
        if cfg.use_ml:
            policy, ptype = _load_policy_cached(raise_on_fail=True)
            
        orch = ADIOSOrchestrator(terrain, weights=weights, audit_path=AUDIT_PATH)
        orch.validator.reach_thresh = cfg.iso_threshold
        
        success_count = 0
        reject_count = 0
        
        for log_entry, snapshot, placed, r, c in orch.run_generator(dispatches, policy=policy, ptype=ptype):
            if log_entry["status"] == "no_space":
                await ws.send_json(_sanitize_for_json({
                    "type": "skip", "dump": log_entry["t"]
                }))
                continue
                
            if log_entry["status"].startswith("iso_rejected"):
                reject_count += 1
                reach = float(log_entry["status"].split("(")[1].strip(")")) if "(" in log_entry["status"] else 0.0
                await ws.send_json(_sanitize_for_json({
                    "type": "rejected", "dump": log_entry["t"], "r": r, "c": c, "reach": reach
                }))
                continue
                
            if placed and log_entry["status"] == "dumped":
                success_count += 1
                await ws.send_json(_sanitize_for_json({
                    "type":         "dump",
                    "dump":         log_entry["t"],
                    "truck":        log_entry["truck"],
                    "r":            r,
                    "c":            c,
                    "payload_t":    log_entry["payload_t"],
                    "volume":       terrain.total_volume(),
                    "coverage":     terrain.coverage_fraction(),
                    "efficiency":   terrain.packing_efficiency(),
                    "full_surface": terrain.to_json_surface(),
                    "policy":       ptype,
                }))
                await asyncio.sleep(0)  # Yield control to the event loop

        # completion summary
        summary = {
            "total_dispatched":  len(dispatches),
            "successful_dumps":  success_count,
            "rejected":          reject_count,
            "total_volume":      terrain.total_volume(),
            "coverage_pct":      round(terrain.coverage_fraction() * 100, 2),
            "packing_efficiency": round(terrain.packing_efficiency() * 100, 2),
            "policy":            ptype,
        }
        await ws.send_json(_sanitize_for_json({"type": "done", "summary": summary}))

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await ws.send_json(_sanitize_for_json({"type": "error", "msg": str(e)}))
        except Exception:
            pass
