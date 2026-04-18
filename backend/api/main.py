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

def _load_policy_cached(device="cpu"):
    if "policy" not in _policy_cache:
        try:
            from ml.policy import load_policy
            _policy_cache["policy"] = load_policy(WEIGHTS_PATH, device)
            _policy_cache["type"] = "ppo"
            print("  ML policy loaded from weights")
        except Exception as e:
            print(f"  ML weights not found ({e}), using heuristic fallback")
            _policy_cache["policy"] = None
            _policy_cache["type"] = "heuristic"
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

def _run_ml_episode(terrain: Terrain, fleet, n_dumps: int, iso_threshold: float) -> tuple:
    """Run one episode with the PPO policy. Returns (log, snapshots)."""
    policy, ptype = _load_policy_cached()
    if policy is None:
        # fallback to heuristic
        return None, None

    from ml.environment import DumpPackingEnv
    import numpy as np
    from scipy.ndimage import distance_transform_edt

    def _obs(t):
        from scipy.ndimage import distance_transform_edt
        h = t.height
        mask = t.mask.astype(np.float32)
        max_h = h[t.mask].max() if t.mask.any() else 1.0
        h_norm = (h / max(max_h, 1e-6)).astype(np.float32)
        dist_arr = distance_transform_edt(t.mask)  # type: ignore
        if isinstance(dist_arr, tuple):
            dist_arr = dist_arr[0]
        dist = np.asarray(dist_arr, dtype=np.float32)
        dist_norm = dist / (dist.max() or 1.0)
        return np.stack([h_norm, mask, dist_norm], axis=0)

    val = IsolationValidator(terrain, terrain.entry, iso_threshold)
    log, snapshots = [], []
    mask_flat = terrain.mask.ravel()
    COLS = terrain.cols

    dispatches = [(t.truck_id, t.payload_t) for t in fleet] * (n_dumps // len(fleet) + 1)
    dispatches = dispatches[:n_dumps]

    for i, (truck_id, payload_t) in enumerate(dispatches):
        obs = _obs(terrain)
        masks_arr = mask_flat.copy()
        action = policy.predict(obs, masks_arr)
        r, c = divmod(int(action), COLS)

        safe, reach = val.validate(r, c, payload_t)
        if not safe:
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

    if cfg.use_ml:
        log, snapshots = _run_ml_episode(terrain, fleet, cfg.n_dumps, cfg.iso_threshold)
        if log is None:  # fallback
            cfg.use_ml = False

    if not cfg.use_ml:
        orch = ADIOSOrchestrator(terrain, weights=weights, audit_path=AUDIT_PATH)
        orch.validator.reach_thresh = cfg.iso_threshold
        dispatches = [(t.truck_id, t.payload_t) for t in fleet] * (cfg.n_dumps // len(fleet) + 1)
        dispatches = dispatches[:cfg.n_dumps]
        log = orch.run(dispatches)
        snapshots = orch.snapshots

    summary = {
        "total_dispatched": len(log),
        "successful_dumps": sum(1 for x in log if x["status"] == "dumped"),
        "rejected": sum(1 for x in log if x["status"] != "dumped"),
        "total_volume": terrain.total_volume(),
        "coverage_pct": round(terrain.coverage_fraction() * 100, 2),
        "packing_efficiency": round(terrain.packing_efficiency() * 100, 2),
        "mean_height": round(terrain.mean_height(), 3),
        "height_uniformity": round(1 - terrain.height_std() / max(terrain.mean_height(), 0.01), 3),
        "isolation_events": sum(1 for x in log if "iso" in str(x.get("status", ""))),
        "latency_ms": round((time.time() - t0) * 1000, 1),
        "policy": "ml_ppo" if cfg.use_ml else "heuristic",
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
    path = os.path.join(os.path.dirname(__file__), "..", "data", "benchmark", "benchmark_baseline.json")
    if os.path.exists(path):
        with open(path) as f:
            return _sanitize_for_json(json.load(f))
    return _sanitize_for_json({"error": "Benchmark not generated yet. Run: python ml/data_gen.py"})

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
    Return a truck dispatch timeline suitable for rendering as a Gantt chart.
    Each entry: { truck_id, start_tick, end_tick, payload_t, status, r, c }
    """
    import numpy as np
    rng = np.random.default_rng(seed)
    truck_names = [f"T{i+1}" for i in range(n_trucks)]
    payloads = rng.choice([50.0, 100.0, 240.0, 400.0], size=n_trucks, replace=True).tolist()
    timeline = []
    truck_free_at = [0] * n_trucks
    STATUSES = ["dumped", "dumped", "dumped", "iso_rejected", "slope_rejected"]

    for i in range(n_dumps):
        tid = int(i % n_trucks)
        start = max(int(truck_free_at[tid]), i * 2)
        duration = int(rng.integers(3, 9))
        end = start + duration
        truck_free_at[tid] = end + int(rng.integers(1, 4))
        status = STATUSES[int(rng.integers(0, len(STATUSES)))]
        timeline.append({
            "truck_id": truck_names[tid],
            "payload_t": round(float(payloads[tid]) * float(rng.uniform(0.9, 1.1)), 1),
            "start_tick": start,
            "end_tick": end,
            "status": status,
            "r": int(rng.integers(20, 80)),
            "c": int(rng.integers(20, 80)),
            "dump_seq": i,
        })

    # queue: trucks currently waiting or in-progress (last state per truck)
    queue = {}
    for item in timeline:
        queue[item["truck_id"]] = item
    queue_list = sorted(queue.values(), key=lambda x: x["truck_id"])

    return _sanitize_for_json({
        "timeline": timeline,
        "queue": queue_list,
        "n_trucks": n_trucks,
        "total_ticks": max(x["end_tick"] for x in timeline) + 5,
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
        orch = ADIOSOrchestrator(terrain, weights=weights, audit_path=AUDIT_PATH)
        orch.validator.reach_thresh = cfg.iso_threshold
        dispatches = [(t.truck_id, t.payload_t) for t in fleet] * (cfg.n_dumps // len(fleet) + 1)
        dispatches = dispatches[:cfg.n_dumps]
        for i, (truck_id, payload_t) in enumerate(dispatches):
            # Pick random valid cell using terrain mask
            valid_cells = np.argwhere(terrain.mask)
            if len(valid_cells) == 0:
                await ws.send_json(_sanitize_for_json({"type": "skip", "dump": i})); continue
            idx = np.random.randint(len(valid_cells))
            r, c = valid_cells[idx]
            
            # Validate cell safety
            safe, reach = orch.validator.validate(r, c, payload_t)
            if not safe:
                await ws.send_json(_sanitize_for_json({"type": "rejected", "dump": i, "r": r, "c": c, "reach": reach})); continue
            
            # Apply dump
            ok, _ = terrain.apply_dump(r, c, payload_t)
            if ok:
                await ws.send_json(_sanitize_for_json({
                    "type": "dump", "dump": i, "truck": truck_id,
                    "r": r, "c": c, "payload_t": payload_t,
                    "volume": terrain.total_volume(),
                    "coverage": terrain.coverage_fraction(),
                    "efficiency": terrain.packing_efficiency(),
                    "full_surface": terrain.to_json_surface(),
                    "policy": "heuristic",
                }))
        
        # Send completion summary
        summary = {
            "total_dispatched": len(dispatches),
            "successful_dumps": len([s for s in orch.snapshots if s.get("volume", 0) > 0]),
            "total_volume": terrain.total_volume(),
            "coverage_pct": round(terrain.coverage_fraction() * 100, 2),
            "packing_efficiency": round(terrain.packing_efficiency() * 100, 2),
        }
        await ws.send_json(_sanitize_for_json({"type": "done", "summary": summary}))
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try: await ws.send_json(_sanitize_for_json({"type": "error", "msg": str(e)}))
        except: pass
