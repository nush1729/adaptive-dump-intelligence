"""
ADIOS v3 FastAPI backend.

Endpoints:
  GET  /health               system + model status
  GET  /fleet_specs          truck specs
  POST /simulate             full run → returns terrain, metrics, snapshots
                             (set use_ml=true in body to dispatch via trained PPO policy)
  POST /tune                 weight auto-tuner
  GET  /benchmark            load pre-computed benchmark results
  GET  /audit                load last audit log
  GET  /eval_result          load last PPO-vs-heuristic evaluation summary
  POST /spacing_analysis     nearest-neighbour dump spacing analysis
  GET  /fleet_intelligence   live IoT telemetry + CTDE fleet snapshot
  GET  /schedule             time-space dispatch schedule
  WS   /ws/simulate          real-time step-by-step streaming
                             (set use_ml=true in body to stream via trained PPO policy)
"""
import asyncio
import json, os, sys, time
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Any, List, Optional, Dict

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from environment.terrain import Terrain
from fleet.truck import make_fleet, CAT_SPECS
from planning.orchestrator import ADIOSOrchestrator
from planning.weight_tuner import WeightTuner
from planning.scorer import ScoringEngine, DEFAULT_WEIGHTS
from planning.isolation_validator import IsolationValidator
from planning.action_masker import ConstrainedActionMasker
from evaluation.metrics import summarize_episode
from evaluation.benchmark import run_static, run_staffed
from config import SITE_CONFIG, config_payload, IOT_FEATURE_DIM

# ── optional ML imports ───────────────────────────────────────────────────────
ML_AVAILABLE = False
_policy_cache = {}
WEIGHTS_PATH = os.path.join(os.path.dirname(__file__), "..", "ml", "weights", "ppo_adios")
# Note: load_policy resolves this to ppo_adios.zip automatically

def _load_policy_cached(device="cpu", raise_on_fail=False):
    if "policy" not in _policy_cache:
        try:
            from ml.policy import load_policy
            _policy_cache["policy"] = load_policy(WEIGHTS_PATH, device)
            _policy_cache["type"] = getattr(_policy_cache["policy"], "artifact_type", "unknown_ml")
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

AUDIT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "audit_log.json")

# ── models ────────────────────────────────────────────────────────────────────
class SimConfig(BaseModel):
    rows: int = SITE_CONFIG.rows
    cols: int = SITE_CONFIG.cols
    material: str = "default"
    n_dumps: int = Field(default=SITE_CONFIG.benchmark_dumps, gt=0)
    fleet_models: List[str] = list(SITE_CONFIG.default_fleet)
    payload_overrides: Optional[Dict[str, float]] = None
    custom_truck_specs: Optional[Dict[str, Dict[str, Any]]] = None
    weights: Optional[dict] = None
    iso_threshold: float = Field(default=SITE_CONFIG.iso_threshold, ge=0.0, le=1.0)
    min_dump_spacing: Optional[float] = Field(default=None, gt=0.0)
    auto_tune: bool = False
    seed: int = SITE_CONFIG.default_seed
    use_ml: bool = False
    zone_mode: bool = False
    terrain_csv_id: Optional[str] = None

class TuneConfig(BaseModel):
    material: str = "default"
    n_trials: int = 30
    seed: int = SITE_CONFIG.default_seed

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

def _build_obs_dict(terrain: Terrain, truck_profile: str = "generic",
                    payload_t: float = 100.0, truck_dump_count: int = 0,
                    iot_features=None) -> dict:
    """Build 5-channel Dict observation matching DumpPackingEnv._obs() exactly."""
    from scipy.ndimage import gaussian_filter
    from ml.environment import build_context_vector, PILE_THRESHOLD_M

    h = terrain.height
    mask = terrain.mask.astype(np.float32)
    h_norm = np.clip(h / SITE_CONFIG.max_height_m, 0.0, 1.0).astype(np.float32)

    dist = terrain.dist_to_boundary
    dist_norm = dist / (dist.max() or 1.0)

    pile_mask = (h > PILE_THRESHOLD_M).astype(np.float32)

    pile_density = pile_mask * mask
    density = gaussian_filter(pile_density, sigma=SITE_CONFIG.staffed_spacing_cells)
    max_d = float(density.max())
    density = (density / max_d).astype(np.float32) if max_d > 0 else density.astype(np.float32)

    terrain_map = np.stack([h_norm, mask, dist_norm, pile_mask, density], axis=0)

    if iot_features is None:
        iot_features = np.zeros(IOT_FEATURE_DIM, dtype=np.float32)

    context = build_context_vector(
        truck_profile, payload_t, truck_dump_count,
        terrain.material, np.asarray(iot_features, dtype=np.float32),
    )
    return {"terrain_map": terrain_map, "context_vector": context}

def _run_ml_episode(terrain: Terrain, fleet, n_dumps: int, iso_threshold: float,
                    min_dump_spacing: Optional[float] = None) -> tuple:
    """Run one episode with the loaded ML policy. Returns (log, snapshots, latencies, positions, policy_type)."""
    try:
        policy, ptype = _load_policy_cached(raise_on_fail=True)
    except RuntimeError:
        return None, None, None, None, None

    from iot.telemetry import IoTTelemetry
    from ml.policy import TruckAgent
    from ml.anomaly_detector import AnomalyDetector

    iot = IoTTelemetry(n_trucks=len(fleet))
    iot.reset()
    anomaly_detector = AnomalyDetector()
    truck_agents = {
        t.truck_id: TruckAgent(t.truck_id, getattr(t, "profile_name", "generic"))
        for t in fleet
    }

    spacing = min_dump_spacing if min_dump_spacing is not None else SITE_CONFIG.min_dump_spacing_cells
    val = IsolationValidator(terrain, terrain.entry, iso_threshold, spacing)
    log, snapshots = [], []
    COLS = terrain.cols

    dispatches = [(t.truck_id, t.payload_t) for t in fleet] * (n_dumps // len(fleet) + 1)
    dispatches = dispatches[:n_dumps]
    reserved = set()
    latencies = []
    dump_positions = []
    policy_type = getattr(policy, "artifact_type", ptype)

    for i, (truck_id, payload_t) in enumerate(dispatches):
        placed = False
        t0 = time.perf_counter()

        agent = truck_agents.get(truck_id)
        iot.update_truck(truck_id, terrain.entry, payload_t, tick=i)
        entry_height_m = float(terrain.height[terrain.entry[0], terrain.entry[1]])
        iot_features = iot.get_iot_feature_vector(local_height_m=entry_height_m)
        anomaly_detector.observe(
            tick=i,
            fleet_metrics=iot.get_fleet_metrics(),
            ground_bearing_capacity=iot.ground_bearing_capacity(entry_height_m),
        )

        for _attempt in range(50):
            action_mask = ConstrainedActionMasker(terrain, val, iso_threshold).mask(
                payload_t, reserved_cells=reserved, include_iso=True, include_path=False
            )

            if not action_mask.any():
                break

            obs = _build_obs_dict(
                terrain,
                truck_profile=getattr(agent, "profile_name", "generic") if agent else "generic",
                payload_t=payload_t,
                truck_dump_count=agent.dump_count if agent and hasattr(agent, "dump_count") else 0,
                iot_features=iot_features,
            )
            action = policy.predict(obs, action_mask.ravel().copy())
            r, c = divmod(int(action), COLS)

            safe, reach = val.validate(r, c, payload_t)
            if not safe:
                reserved.add((r, c))
                log.append({"t": i, "truck": truck_id, "r": int(r), "c": int(c),
                            "status": f"iso_rejected({reach:.2f})", "payload_t": payload_t,
                            "volume": terrain.total_volume(), "coverage": terrain.coverage_fraction(),
                            "valid_action_count": int(action_mask.sum()), "policy_source": policy_type})
                continue

            ok, reason = terrain.apply_dump(r, c, payload_t)
            status = "dumped" if ok else reason
            log.append({"t": i, "truck": truck_id, "r": int(r), "c": int(c), "status": status,
                        "payload_t": payload_t, "reach": reach if ok else None,
                        "volume": terrain.total_volume(), "coverage": terrain.coverage_fraction(),
                        "valid_action_count": int(action_mask.sum()), "policy_source": policy_type})

            if ok:
                val.record_dump(r, c)
                dump_positions.append((int(r), int(c)))
                placed = True
                reserved.discard((r, c))
                if agent:
                    agent.record_dump()
                iot.record_dump(truck_id, tick=i)
                break
            else:
                reserved.add((r, c))
                continue

        if not placed:
            if not log or log[-1]["t"] != i:
                log.append({"t": i, "truck": truck_id, "r": 0, "c": 0,
                            "status": "no_space", "payload_t": payload_t,
                            "volume": terrain.total_volume(), "coverage": terrain.coverage_fraction(),
                            "policy_source": policy_type})

        if placed:
            snapshots.append({
                "dump_n": terrain.dump_count, "truck": truck_id, "r": int(r), "c": int(c),
                "volume": terrain.total_volume(),
                "coverage": terrain.coverage_fraction(),
                "efficiency": terrain.packing_efficiency(),
                "policy": policy_type,
                "surface": terrain.to_json_surface(),
            })
        latencies.append((time.perf_counter() - t0) * 1000)

    return log, snapshots, latencies, dump_positions, policy_type, anomaly_detector

# ── routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    policy, ptype = _load_policy_cached()
    display = getattr(policy, "display_name", ptype) if policy else "heuristic"
    return {
        "status": "ok",
        "version": "3.0",
        "ml_available": ML_AVAILABLE,
        "policy_type": ptype,
        "policy_display_name": display,
        "weights_path": WEIGHTS_PATH,
        "config": config_payload(),
    }

@app.get("/fleet_specs")
def fleet_specs():
    return CAT_SPECS

# In-memory store for uploaded terrain grids — keyed by an opaque id returned
# from /upload_terrain. Process-lifetime only (mirrors the rest of ADIOS's
# stateless-between-restarts design); large enough grids would warrant a real
# cache with eviction, but uploads are infrequent operator actions, not a hot path.
_uploaded_terrains: Dict[str, np.ndarray] = {}
_UPLOAD_MAX_CELLS = 100 * 100 * 4  # generous bound — keeps parsing/memory bounded


@app.post("/upload_terrain")
async def upload_terrain(file: UploadFile = File(...)):
    """Ingest a CSV height-map grid (rows = terrain rows, cols = terrain cols,
    cell values = height in metres; blank/negative/non-numeric = outside the
    site boundary) and stage it for use as a live simulation terrain source.

    Returns a `terrain_id` to pass back as `SimConfig.terrain_csv_id`.
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Expected a .csv file")

    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "File is not valid UTF-8 text")

    rows_out: list[list[float]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        cells = []
        for tok in line.replace("\t", ",").split(","):
            tok = tok.strip()
            if tok == "":
                cells.append(np.nan)
                continue
            try:
                cells.append(float(tok))
            except ValueError:
                cells.append(np.nan)
        rows_out.append(cells)

    if len(rows_out) < 2:
        raise HTTPException(400, "CSV must contain at least 2 rows of numeric height data")

    width = max(len(r) for r in rows_out)
    if width < 2:
        raise HTTPException(400, "CSV must contain at least 2 columns of numeric height data")
    if len(rows_out) * width > _UPLOAD_MAX_CELLS:
        raise HTTPException(400, f"Grid too large — max {_UPLOAD_MAX_CELLS} cells (got {len(rows_out)}x{width})")

    grid = np.full((len(rows_out), width), np.nan, dtype=np.float32)
    for i, r in enumerate(rows_out):
        grid[i, :len(r)] = r

    finite = grid[np.isfinite(grid)]
    if finite.size == 0:
        raise HTTPException(400, "CSV contains no valid numeric height values")
    if (finite < 0).all():
        raise HTTPException(400, "CSV contains no non-negative height values — nothing to dispatch onto")

    terrain_id = f"csv_{abs(hash((file.filename, raw[:4096], len(raw))))}"
    _uploaded_terrains[terrain_id] = grid

    return {
        "terrain_id": terrain_id,
        "rows": grid.shape[0],
        "cols": grid.shape[1],
        "active_cells": int(np.isfinite(grid).sum()),
        "height_range_m": [float(np.nanmin(grid[np.isfinite(grid)])), float(np.nanmax(grid[np.isfinite(grid)]))],
    }


def _build_terrain(cfg: SimConfig) -> Terrain:
    """Resolve the terrain source for a config — uploaded CSV grid if staged
    via /upload_terrain, otherwise the synthetic demo polygon (default path)."""
    if cfg.terrain_csv_id:
        grid = _uploaded_terrains.get(cfg.terrain_csv_id)
        if grid is None:
            raise HTTPException(404, f"Unknown terrain_csv_id '{cfg.terrain_csv_id}' — re-upload the CSV")
        return Terrain.from_height_grid(grid, material=cfg.material)
    return Terrain.make_demo_polygon(cfg.rows, cfg.cols, cfg.material, cfg.seed)


def _run_simulation_sync(cfg: SimConfig) -> dict:
    """
    Synchronous simulation runner.
    This is the CPU-bound work that gets offloaded to a thread pool.
    """
    t0 = time.time()
    terrain = _build_terrain(cfg)
    weights = cfg.weights or dict(DEFAULT_WEIGHTS)

    if cfg.auto_tune:
        def factory(): return Terrain.make_demo_polygon(cfg.rows, cfg.cols, cfg.material, cfg.seed)
        tuner = WeightTuner(weights, n_trials=20)
        weights, _ = tuner.tune(factory)

    fleet = make_fleet(cfg.fleet_models, payload_overrides=cfg.payload_overrides,
                       custom_specs=cfg.custom_truck_specs)

    actual_policy = "heuristic"  # Track what was ACTUALLY used
    log = None
    anomaly_detector = None
    if cfg.use_ml:
        try:
            log, snapshots, latencies, dump_positions, loaded_policy, anomaly_detector = _run_ml_episode(terrain, fleet, cfg.n_dumps, cfg.iso_threshold, cfg.min_dump_spacing)
            if log is not None:
                actual_policy = loaded_policy or "unknown_ml"
            else:
                # ML returned None — fall back
                cfg.use_ml = False
        except RuntimeError:
            cfg.use_ml = False
            log = None

    if not cfg.use_ml or log is None:
        orch = ADIOSOrchestrator(terrain, weights=weights, audit_path=AUDIT_PATH, n_trucks=len(fleet), min_spacing=cfg.min_dump_spacing)
        orch.validator.reach_thresh = cfg.iso_threshold
        dispatches = [{"truck_id": t.truck_id, "payload_t": t.payload_t, "truck_profile": t.model}
                      for t in fleet] * (cfg.n_dumps // len(fleet) + 1)
        dispatches = dispatches[:cfg.n_dumps]
        latencies = []
        dump_positions = []
        t_last = time.perf_counter()
        log = orch.run(dispatches, zone_mode=cfg.zone_mode)
        snapshots = orch.snapshots
        anomaly_detector = orch.anomaly_detector
        latencies = [(time.perf_counter() - t_last) * 1000 / max(len(dispatches), 1)] * len(dispatches)
        dump_positions = [(int(x["r"]), int(x["c"])) for x in log if x.get("status") == "dumped"]
        actual_policy = "heuristic"

    summary = summarize_episode(terrain, log, latencies, dump_positions, actual_policy)
    summary["mean_height"] = round(terrain.mean_height(), 3)

    # Baselines — two real-world reference patterns from the site survey:
    #   - "static_grid"   : autonomous fixed-lattice fallback, spaced at the
    #                       real autonomous spacing (~7.38m) — sparse, rigid,
    #                       prone to coverage gaps near irregular polygon edges.
    #   - "staffed_manual": human-operator pattern, spaced at the tighter real
    #                       staffed spacing (~3.03m) with organic per-dump
    #                       jitter rather than a rigid lattice.
    # Each runs on its own fresh terrain copy (same seed/material/fleet) so
    # results are directly comparable to the ADIOS run above.
    def _baseline_summary(result: dict) -> dict:
        """Normalise a run_static/run_staffed result dict into the summary
        shape the frontend expects (StaticSummary: volume/coverage_pct/
        packing_efficiency, plus the extra KPIs for the benchmark table)."""
        return {
            "volume": result["volume_m3"],
            "total_volume": result["volume_m3"],
            "coverage_pct": result["coverage_pct"],
            "packing_efficiency": result["packing_efficiency"],
            "height_uniformity": result["height_uniformity"],
            "filled_uniformity": result["filled_uniformity"],
            "rejection_rate": result["rejection_rate"],
            "iso_rejection_rate": result["iso_rejection_rate"],
            "mean_spacing_m": result["mean_spacing_m"],
            "policy": result["policy"],
        }

    static_t = Terrain.make_demo_polygon(cfg.rows, cfg.cols, cfg.material, cfg.seed)
    static_result = run_static(static_t, fleet, n_dumps=cfg.n_dumps)
    static_summary = _baseline_summary(static_result)

    staffed_t = Terrain.make_demo_polygon(cfg.rows, cfg.cols, cfg.material, cfg.seed)
    staffed_result = run_staffed(staffed_t, fleet, n_dumps=cfg.n_dumps, seed=cfg.seed)
    staffed_summary = _baseline_summary(staffed_result)

    # Spacing analysis for the run
    dump_positions_arr = np.array(dump_positions) if dump_positions else np.empty((0, 2))
    spacing_stats: Dict[str, Any] = {}
    if len(dump_positions) >= 2:
        from scipy.spatial import KDTree as _KDTree
        tree = _KDTree(dump_positions_arr)
        dists, _ = tree.query(dump_positions_arr, k=2)
        nn_dists = dists[:, 1]
        mean_sp = float(nn_dists.mean())
        auto_base = SITE_CONFIG.autonomous_spacing_m
        staffed_tgt = SITE_CONFIG.staffed_spacing_m
        improvement = max(0.0, (auto_base - mean_sp) / max(auto_base - staffed_tgt, 0.01) * 100)
        spacing_stats = {
            "mean_spacing_m": round(mean_sp, 2),
            "staffed_target_m": staffed_tgt,
            "autonomous_baseline_m": auto_base,
            "density_improvement_pct": round(min(improvement, 100.0), 1),
        }

    # Audit write-back — persist full log for replay
    try:
        os.makedirs(os.path.dirname(AUDIT_PATH), exist_ok=True)
        audit_entry = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "seed": cfg.seed,
            "material": cfg.material,
            "policy": actual_policy,
            "n_dumps": cfg.n_dumps,
            "summary": summary,
            "spacing": spacing_stats,
            "log": log,
        }
        existing = []
        if os.path.exists(AUDIT_PATH):
            with open(AUDIT_PATH) as f:
                try:
                    existing = json.load(f)
                    if not isinstance(existing, list):
                        existing = [existing]
                except Exception:
                    existing = []
        existing.append(audit_entry)
        # Keep last 20 runs to avoid unbounded growth
        existing = existing[-20:]
        with open(AUDIT_PATH, "w") as f:
            json.dump(_sanitize_for_json(existing), f)
    except Exception as ae:
        print(f"  [audit] write failed: {ae}")

    payload = _terrain_payload(terrain, weights)
    payload.update({
        "summary": summary,
        "weights_used": weights,
        "static_surface": static_t.to_json_surface(),
        "staffed_surface": staffed_t.to_json_surface(),
        "snapshots": snapshots,
        "log": log[-30:],
        "static_summary": static_summary,
        "staffed_summary": staffed_summary,
        "spacing_analysis": spacing_stats,
        "policy_metadata": {
            "artifact_type": actual_policy,
            "display_name": actual_policy.replace("_", " ").title(),
        },
        "config": config_payload(),
        "zone_mode": cfg.zone_mode,
        "anomalies": anomaly_detector.to_json() if anomaly_detector is not None else {"alerts": [], "alert_count": 0},
    })
    if cfg.zone_mode and not cfg.use_ml and getattr(orch, "zone_planner", None) is not None:
        payload["zone_layout"] = orch.zone_planner.to_json()
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
    path = os.path.join(os.path.dirname(__file__), "..", "ml", "weights", "ppo_adios", "eval_result.json")
    if os.path.exists(path):
        with open(path) as f:
            return _sanitize_for_json(json.load(f))
    return _sanitize_for_json({"ml_efficiency": None, "heuristic_efficiency": None, "delta": None})


class SpacingAnalysisConfig(BaseModel):
    seed: int = SITE_CONFIG.default_seed
    material: str = "default"
    dump_positions: List[List[int]] = []


@app.post("/spacing_analysis")
def spacing_analysis(cfg: SpacingAnalysisConfig):
    """
    Analyse packing density vs staffed-operation target.
    Returns per-dump nearest-neighbour distances, mean spacing,
    pile detection map, and a density score vs the 3.03m staffed baseline.
    """
    from scipy.ndimage import gaussian_filter
    from scipy.spatial import KDTree

    terrain = Terrain.make_demo_polygon(100, 100, cfg.material, cfg.seed)
    positions = np.array(cfg.dump_positions) if cfg.dump_positions else np.empty((0, 2))

    # Pile detection: cells where height exceeds threshold
    pile_mask = (terrain.height > SITE_CONFIG.pile_detection_threshold_m).astype(float)
    pile_mask_masked = pile_mask * terrain.mask.astype(float)

    # Spacing density heatmap
    density_map = gaussian_filter(pile_mask_masked, sigma=SITE_CONFIG.staffed_spacing_cells)
    max_d = density_map.max()
    if max_d > 0:
        density_map /= max_d

    # Nearest-neighbour spacing analysis on dump positions
    spacing_stats: Dict[str, Any] = {}
    if len(positions) >= 2:
        tree = KDTree(positions)
        dists, _ = tree.query(positions, k=2)
        nn_dists = dists[:, 1].tolist()
        mean_spacing = float(np.mean(nn_dists))
        staffed_target = SITE_CONFIG.staffed_spacing_m
        autonomous_current = SITE_CONFIG.autonomous_spacing_m
        density_improvement_pct = max(0.0, (autonomous_current - mean_spacing) / (autonomous_current - staffed_target) * 100)
        spacing_stats = {
            "mean_spacing_m": round(mean_spacing, 2),
            "min_spacing_m": round(float(np.min(nn_dists)), 2),
            "max_spacing_m": round(float(np.max(nn_dists)), 2),
            "staffed_target_m": staffed_target,
            "autonomous_baseline_m": autonomous_current,
            "density_improvement_pct": round(min(density_improvement_pct, 100.0), 1),
            "nn_distances": [round(d, 2) for d in nn_dists],
        }
    else:
        spacing_stats = {
            "mean_spacing_m": None,
            "staffed_target_m": SITE_CONFIG.staffed_spacing_m,
            "autonomous_baseline_m": SITE_CONFIG.autonomous_spacing_m,
            "density_improvement_pct": 0.0,
            "nn_distances": [],
        }

    return _sanitize_for_json({
        "pile_mask": pile_mask_masked.tolist(),
        "density_map": density_map.tolist(),
        "spacing": spacing_stats,
        "total_piles": int(pile_mask_masked.sum()),
        "coverage_pct": round(terrain.coverage_fraction() * 100, 2),
    })


class FleetIntelligenceRequest(BaseModel):
    seed: int = SITE_CONFIG.default_seed
    n_trucks: int = 4
    fleet_models: Optional[List[str]] = None
    custom_truck_specs: Optional[Dict[str, Dict[str, Any]]] = None


@app.get("/fleet_intelligence")
def fleet_intelligence(seed: int = SITE_CONFIG.default_seed, n_trucks: int = 4):
    """
    Returns per-truck operational context: truck profiles, turning radii,
    payload capacities, and IoT feature vector at steady state.
    """
    return _fleet_intelligence_impl(seed, n_trucks, None, None)


@app.post("/fleet_intelligence")
def fleet_intelligence_post(req: FleetIntelligenceRequest):
    """
    Same as GET /fleet_intelligence, but lets the caller pass the fleet's
    actual model names (incl. user-registered custom truck types) so the
    roster reflects the live dashboard configuration instead of a fixed
    4-profile demo snapshot.
    """
    return _fleet_intelligence_impl(req.seed, req.n_trucks, req.fleet_models, req.custom_truck_specs)


def _fleet_intelligence_impl(seed: int, n_trucks: int,
                             fleet_models: Optional[List[str]],
                             custom_truck_specs: Optional[Dict[str, Dict[str, Any]]]):
    from iot.telemetry import IoTTelemetry
    from config import TRUCK_PROFILES, SITE_CONFIG

    customs = custom_truck_specs or {}

    # Resolve the roster to display: prefer the caller's actual fleet model
    # names (deduplicated, in order) so custom-registered trucks show up;
    # fall back to the first n_trucks built-in profiles for the demo default.
    if fleet_models:
        seen = []
        for m in fleet_models:
            if m not in seen:
                seen.append(m)
        truck_names = seen[:max(n_trucks, len(seen))] if len(seen) <= n_trucks else seen
    else:
        truck_names = list(TRUCK_PROFILES.keys())[:n_trucks]

    iot = IoTTelemetry(n_trucks=len(truck_names))
    iot.reset()

    def resolve_profile(name: str):
        if name in TRUCK_PROFILES:
            return TRUCK_PROFILES[name]
        return TRUCK_PROFILES["generic"]

    for i, name in enumerate(truck_names):
        profile = resolve_profile(name)
        payload = customs.get(name, {}).get("payload_t", profile.max_payload_t)
        # Simulate a mid-shift snapshot: stagger arrivals so roughly half the
        # fleet is still active/in-transit and half has just dumped — a fleet
        # where every truck has already dumped reads as fully idle (congestion,
        # zone density, queue all flatten to 0), which misrepresents live ops.
        tid = f"T{i+1}"
        iot.update_truck(tid, (50 + i * 4, 50 - i * 3), payload * 0.9, tick=i * 3)
        if i % 2 == 0:
            iot.record_dump(tid, tick=i * 3 + 2)
    iot.step_environment(queue_length=max(1, len(truck_names) // 2))

    iot_vec = iot.get_iot_feature_vector().tolist()
    fleet_metrics = iot.get_fleet_metrics()

    truck_info = []
    for i, name in enumerate(truck_names):
        profile = resolve_profile(name)
        spec = customs.get(name, {})
        truck_info.append({
            "id": f"T{i+1}",
            "profile": name,
            "max_payload_t": spec.get("payload_t", profile.max_payload_t),
            "turning_radius_m": spec.get("turn_r", profile.turning_radius_m),
            "axle_load_t": profile.axle_load_t,
            "min_corridor_width_m": spec.get("turn_r", profile.turning_radius_m) * 2,
            "is_custom": name not in TRUCK_PROFILES,
        })

    return _sanitize_for_json({
        "trucks": truck_info,
        "iot_features": {
            "fleet_congestion": round(float(iot_vec[0]), 3),
            "haul_latency_norm": round(float(iot_vec[1]), 3),
            "utilization": round(float(iot_vec[2]), 3),
            "zone_density": round(float(iot_vec[3]), 3),
            "weather_visibility": round(float(iot_vec[4]), 3),
            "equipment_health": round(float(iot_vec[5]), 3),
            "ground_bearing_capacity": round(float(iot_vec[6]), 3),
            "queue_length_norm": round(float(iot_vec[7]), 3),
        },
        "fleet_metrics": fleet_metrics,
        "ctde_mode": "active",
        "policy_type": _load_policy_cached()[1],
    })


@app.get("/anomalies")
def anomalies(seed: int = SITE_CONFIG.default_seed, n_trucks: int = 4, ticks: int = 60):
    """
    Predictive-maintenance probe: replays `ticks` of synthetic IoT telemetry
    through the z-score AnomalyDetector (equipment_health / ground_bearing_capacity)
    and returns any alerts raised — i.e. samples that drop sharply below their
    own rolling baseline, not arbitrary thresholds.
    """
    from iot.telemetry import IoTTelemetry
    from ml.anomaly_detector import AnomalyDetector

    terrain = Terrain.make_demo_polygon(100, 100, "default", seed)
    iot = IoTTelemetry(n_trucks=n_trucks)
    iot.reset()
    detector = AnomalyDetector()

    truck_names = [f"T{i+1}" for i in range(n_trucks)]
    er, ec = terrain.entry
    for tick in range(ticks):
        tid = truck_names[tick % n_trucks]
        iot.update_truck(tid, (er, ec), 200.0, tick=tick)
        if tick % 3 == 0:
            iot.record_dump(tid, tick=tick)
        iot.step_environment(queue_length=tick % n_trucks)
        entry_height_m = float(terrain.height[er, ec])
        detector.observe(
            tick=tick,
            fleet_metrics=iot.get_fleet_metrics(),
            ground_bearing_capacity=iot.ground_bearing_capacity(entry_height_m),
        )

    return _sanitize_for_json(detector.to_json())


# ── WebSocket: real-time streaming ───────────────────────────────────────────

@app.post("/schedule")
def get_schedule(cfg: SimConfig):
    """
    Build a truck dispatch timeline using the real TimeSpaceScheduler
    and the actual ADIOSOrchestrator log to map physical paths to time,
    using the same shared sim configuration as /simulate (material, fleet,
    payload overrides, custom truck specs, ISO threshold, weights, zone mode).
    """
    import numpy as np
    from planning.scheduler import TimeSpaceScheduler
    from planning.pathfinder import find_path

    rng = np.random.default_rng(cfg.seed)

    # ── terrain + fleet + orchestrator ───────────────────────────────────────
    terrain = _build_terrain(cfg)
    fleet = make_fleet(cfg.fleet_models, payload_overrides=cfg.payload_overrides,
                       custom_specs=cfg.custom_truck_specs)
    n_trucks = len(fleet)
    truck_names = [t.truck_id for t in fleet]
    n_dumps = cfg.n_dumps

    weights = cfg.weights or dict(DEFAULT_WEIGHTS)
    orch = ADIOSOrchestrator(terrain, weights=weights, n_trucks=n_trucks, min_spacing=cfg.min_dump_spacing)
    orch.validator.reach_thresh = cfg.iso_threshold
    dispatches = [(t.truck_id, t.payload_t) for t in fleet] * (n_dumps // n_trucks + 1)
    dispatches = dispatches[:n_dumps]

    log = orch.run(dispatches, zone_mode=cfg.zone_mode)

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
        terrain = _build_terrain(cfg)
        weights = cfg.weights or dict(DEFAULT_WEIGHTS)
        fleet = make_fleet(cfg.fleet_models, payload_overrides=cfg.payload_overrides,
                           custom_specs=cfg.custom_truck_specs)

        spacing = cfg.min_dump_spacing if cfg.min_dump_spacing is not None else SITE_CONFIG.min_dump_spacing_cells
        val = IsolationValidator(terrain, terrain.entry, cfg.iso_threshold, spacing)

        dispatches = [{"truck_id": t.truck_id, "payload_t": t.payload_t, "truck_profile": t.model}
                      for t in fleet] * (cfg.n_dumps // len(fleet) + 1)
        dispatches = dispatches[:cfg.n_dumps]

        policy = None
        ptype = "heuristic"
        if cfg.use_ml:
            policy, ptype = _load_policy_cached(raise_on_fail=True)
            
        orch = ADIOSOrchestrator(terrain, weights=weights, audit_path=AUDIT_PATH, n_trucks=len(fleet), min_spacing=cfg.min_dump_spacing)
        orch.validator.reach_thresh = cfg.iso_threshold

        success_count = 0
        reject_count = 0
        zone_layout_sent = not cfg.zone_mode
        alerts_sent = 0

        # ── operator supervisory state ───────────────────────────────────────
        # Polled non-blockingly between dispatch steps (see _poll_controls below)
        # so a human operator can pause/resume or slow down a live run without
        # reconnecting — the "human override / supervisory control layer".
        sup = {"paused": False, "step_delay_s": 0.0}

        async def _poll_controls():
            """Drain any queued operator-control messages without blocking the
            dispatch loop. Returns once no message is immediately available."""
            while True:
                try:
                    raw_ctl = await asyncio.wait_for(ws.receive_text(), timeout=0.001)
                except (asyncio.TimeoutError, TimeoutError):
                    return
                except WebSocketDisconnect:
                    raise
                try:
                    ctl = json.loads(raw_ctl)
                except (json.JSONDecodeError, TypeError):
                    continue
                ctype = ctl.get("type")
                if ctype == "pause":
                    sup["paused"] = True
                    await ws.send_json({"type": "control_ack", "action": "pause"})
                elif ctype == "resume":
                    sup["paused"] = False
                    await ws.send_json({"type": "control_ack", "action": "resume"})
                elif ctype == "set_speed":
                    delay = ctl.get("step_delay_s")
                    if isinstance(delay, (int, float)) and 0 <= delay <= 5:
                        sup["step_delay_s"] = float(delay)
                        await ws.send_json({"type": "control_ack", "action": "set_speed", "step_delay_s": sup["step_delay_s"]})

        for log_entry, snapshot, placed, r, c in orch.run_generator(dispatches, policy=policy, ptype=ptype, zone_mode=cfg.zone_mode):
            if not zone_layout_sent and getattr(orch, "zone_planner", None) is not None:
                await ws.send_json(_sanitize_for_json({
                    "type": "zone_layout",
                    "zones": orch.zone_planner.to_json()["zones"],
                }))
                zone_layout_sent = True

            # Stream any newly-raised predictive-maintenance alerts
            new_alerts = orch.anomaly_detector.alerts[alerts_sent:]
            if new_alerts:
                alerts_sent = len(orch.anomaly_detector.alerts)
                for alert in new_alerts:
                    await ws.send_json(_sanitize_for_json({"type": "anomaly", **alert}))

            if log_entry["status"] == "deadlock_resolved":
                await ws.send_json(_sanitize_for_json({
                    "type": "deadlock",
                    "dump": log_entry["t"],
                    "trucks": log_entry.get("deadlock_trucks", []),
                    "r": r, "c": c,
                }))
                continue

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
                    "truck_profile": log_entry.get("truck_profile"),
                    "zone_mode":    cfg.zone_mode,
                    "gps_fix":      log_entry.get("gps_fix"),
                    "dump_stage":   log_entry.get("dump_stage"),
                    "why":          log_entry.get("why"),
                }))
                # Drain operator-control messages, then honour pause/speed state
                # before advancing — gives a human supervisor a live override
                # surface (pause, resume, throttle) over an in-flight run.
                await _poll_controls()
                while sup["paused"]:
                    await asyncio.sleep(0.2)
                    await _poll_controls()
                if sup["step_delay_s"] > 0:
                    await asyncio.sleep(sup["step_delay_s"])
                else:
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
            "zone_mode":         cfg.zone_mode,
            "anomaly_count":     orch.anomaly_detector.to_json()["alert_count"],
        }
        await ws.send_json(_sanitize_for_json({"type": "done", "summary": summary}))

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await ws.send_json(_sanitize_for_json({"type": "error", "msg": str(e)}))
        except Exception:
            pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=False)
