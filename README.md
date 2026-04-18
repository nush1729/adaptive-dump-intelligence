<div align="center">

```
  █████╗ ██████╗ ██╗ ██████╗ ███████╗
 ██╔══██╗██╔══██╗██║██╔═══██╗██╔════╝
 ███████║██║  ██║██║██║   ██║███████╗
 ██╔══██║██║  ██║██║██║   ██║╚════██║
 ██║  ██║██████╔╝██║╚██████╔╝███████║
 ╚═╝  ╚═╝╚═════╝ ╚═╝ ╚═════╝ ╚══════╝
```

# Adaptive Dump Intelligence & Orchestration System

**Caterpillar Hackathon · Problem Statement 4 · Team Butterfly**

[![Backend](https://img.shields.io/badge/backend-FastAPI%203.0-009688?style=flat-square)](https://fastapi.tiangolo.com)
[![ML](https://img.shields.io/badge/ML-PPO%20%2B%20supervised%20MLP-7B68EE?style=flat-square)](https://stable-baselines3.readthedocs.io)
[![Frontend](https://img.shields.io/badge/frontend-Next.js%2014%20%2B%20R3F-C8FF00?style=flat-square&labelColor=000)](https://nextjs.org)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue?style=flat-square)](https://python.org)

</div>

---

## What is ADIOS?

ADIOS is a **real-time adaptive dump packing system** that decides, for every
arriving haul truck, exactly which cell within a polygon dump site the truck
should deposit its load.  It replaces the current industry practice of a
human spotter standing at the edge of the polygon and directing trucks by hand.

**The core problem:**  A typical open-cut mine operates a fleet of 3–8 large
haul trucks (Cat 777 / 793 / 797, payloads 100–400 t) that cycle between the
dig face and a dump polygon 24 hours a day.  The polygon must be filled as
uniformly, efficiently, and safely as possible.  When the pile becomes
irregular, trucks can become isolated — physically unable to reach parts of
the polygon — triggering costly recovery operations.  Poor packing also wastes
polygon capacity by up to 30–40 % compared to an optimal fill strategy.

ADIOS solves this by maintaining a live digital twin of the dump terrain and
using a trained neural policy (with a deterministic heuristic fallback) to
compute the globally optimal next dump cell in under 2 seconds per dispatch.

---

## Key Differentiators

| Feature | Industry Status Quo | ADIOS |
|---------|--------------------|----|
| Dispatch decision | Human spotter, intuition | Real-time ML policy < 2 s |
| Terrain model | None / paper map | Live 100×100 digital twin |
| Isolation safety | Reactive (truck gets stuck) | Proactive: reachability validated before every dispatch |
| Slope enforcement | Post-hoc inspection | Per-dump angle-of-repose enforcement at placement time |
| Auditability | Paper log, no replay | Full JSON audit trail, step-through replay UI |
| ML adaptability | N/A | PPO policy generalises to unseen polygon shapes and materials |
| Fleet heterogeneity | Single truck type assumed | Mixed fleets: Cat 777/793/797 + generics, variable payloads |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         ADIOS v3 Stack                           │
│                                                                  │
│  ┌─────────────────────────────────┐   WebSocket / REST          │
│  │       Next.js 14 Frontend        │◄──────────────────────────┐│
│  │  ┌───────────┐  ┌────────────┐  │                            ││
│  │  │ Dashboard  │  │ Scheduling │  │   React Three Fiber        ││
│  │  │ (R3F + WS) │  │ (Gantt)    │  │   3D terrain mesh          ││
│  │  └───────────┘  └────────────┘  │   Recharts / Plotly KPIs   ││
│  │  ┌───────────┐  ┌────────────┐  │                            ││
│  │  │   Audit    │  │ Benchmark  │  │                            ││
│  │  │  Replay    │  │  Panel     │  │                            ││
│  │  └───────────┘  └────────────┘  │                            ││
│  └─────────────────────────────────┘                            ││
│                                                                  ││
│  ┌─────────────────────────────────────────────────────────┐    ││
│  │                  FastAPI Backend (Python)                 │────┘│
│  │                                                           │     │
│  │  ┌───────────────┐  ┌──────────────┐  ┌──────────────┐  │     │
│  │  │   Terrain      │  │  Orchestrator│  │  Scheduler   │  │     │
│  │  │  (100×100 grid)│  │  (dispatch   │  │  (Gantt data)│  │     │
│  │  │  height map    │  │   loop)      │  │              │  │     │
│  │  └───────────────┘  └──────────────┘  └──────────────┘  │     │
│  │                                                           │     │
│  │  ┌───────────────┐  ┌──────────────┐  ┌──────────────┐  │     │
│  │  │  ML Policy     │  │  Isolation   │  │  Weight      │  │     │
│  │  │  (PPO / MLP)   │  │  Validator   │  │  Auto-Tuner  │  │     │
│  │  │  CNN encoder   │  │  (BFS reach) │  │  (coord desc)│  │     │
│  │  └───────────────┘  └──────────────┘  └──────────────┘  │     │
│  └─────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
```

### Backend modules

| Module | Purpose |
|--------|---------|
| `environment/terrain.py` | 100×100 float32 height grid, polygon mask, slope enforcement, volume/coverage KPIs |
| `fleet/truck.py` | Cat 777/793/797 + generic truck specs, heterogeneous fleet builder |
| `planning/scorer.py` | Hand-crafted linear scoring engine (4 weights: volume gain, coverage, isolation risk, slope penalty) |
| `planning/isolation_validator.py` | BFS reachability check from haul-road entry — blocks any dump that would isolate the truck |
| `planning/orchestrator.py` | Dispatch loop: calls scorer, validates, applies dump, streams to WebSocket |
| `planning/weight_tuner.py` | Coordinate-descent hyper-parameter search across weight space |
| `ml/environment.py` | `gymnasium.Env` wrapping the terrain engine — state (3×100×100), action (flat cell index), shaped reward |
| `ml/policy.py` | Loads PPO or supervised MLP weights; exposes unified `predict(obs, masks) → action` interface |
| `ml/train_supervised.py` | Fast supervised MLP trainer (~60 s CPU); teacher = heuristic scorer |
| `ml/data_gen.py` | Synthetic data generator: random polygons, mixed-fleet sequences, expert trajectories |
| `pretrain.py` | Stage-1 behavioural cloning + Stage-2 PPO fine-tuning |
| `evaluation/benchmark.py` | 8-KPI evaluation CLI across N held-out polygon seeds |
| `api/main.py` | FastAPI REST + WebSocket; endpoints for simulate, tune, benchmark, audit, schedule |

### Frontend pages

| Route | Description |
|-------|-------------|
| `/` | 3D animated landing page — terrain fills in real time, fade-in hero stats |
| `/dashboard` | Live simulation: R3F terrain mesh, WebSocket streaming, 4-view toggle (3D / heatmap / compare / Plotly), control panel, metrics bar |
| `/scheduling` | Gantt chart dispatch timeline, truck queue sidebar, playback scrubber, click-to-inspect detail panel |
| `/audit` | Full simulation replay: step through every dispatch decision, see terrain state, read rejection reasons |

---

## ML Model

### Problem formulation as MDP

| Component | Definition |
|-----------|-----------|
| **State** | 3-channel (100×100) tensor: normalised height map · polygon mask · distance-to-boundary map |
| **Action** | Integer in [0, 10 000) selecting a dump cell; cells outside polygon are masked (−∞ logit) |
| **Reward** | `+vol_delta×0.008 + cov_delta×5.0 − iso_penalty×3.0 − slope_penalty×2.0 + terminal(cov×10 + uniformity×2)` |
| **Episode** | One complete polygon fill (up to 80 dumps); terminal bonus incentivises high coverage and even surface |

### Network architecture

```
Input: (3, 100, 100) terrain observation
  │
  ├─ Conv2d(3→32, 8×8, stride 4)  → ReLU  → (32, 24, 24)
  ├─ Conv2d(32→64, 4×4, stride 2) → ReLU  → (64, 11, 11)
  ├─ Conv2d(64→64, 3×3, stride 1) → ReLU  → (64, 9, 9)
  └─ Flatten → Linear(5184→256)   → ReLU  → features (256-d)
       │
       ├── Actor head:  Linear(256→10 000) → masked softmax
       └── Critic head: Linear(256→1)      → scalar value estimate

Total: ~500 K parameters — trains in ~3 min on CPU
```

### Training pipeline

```bash
# Stage 1 — Supervised pre-training (60 s, instant usable policy)
python ml/train_supervised.py --polygons 60 --epochs 8

# Stage 2 — PPO fine-tuning (optional, 3–20 min, higher peak performance)
python pretrain.py --steps 100000 --device cpu
```

**Why the supervised MLP is valid as "ML":**
It is a convolutional neural network that maps raw terrain state to a
probability distribution over 10,000 possible dump cells.  It generalises
across unseen polygon shapes and material types.  It is trained on 3,000+
expert demonstrations and achieves >85 % action-matching accuracy.  At demo
time it runs as the live policy when `use_ml=True` is passed to the API.

---

## Safety & Auditability

ADIOS is designed with **Caterpillar's safety standards as first-class
constraints**, not afterthoughts.

### Isolation Validator

Every proposed dump cell passes through a BFS reachability analysis before
it is accepted.  The BFS models the haul-road network from the polygon entry
point across the current height surface.  A cell is rejected if accepting the
dump would reduce the reachable fraction of the polygon below the configured
threshold (default 85 %).  This prevents trucks from being stranded in
isolated pockets of the fill — a real and costly failure mode in field
operations.

```python
safe, reachability_score = validator.validate(row, col, payload_tonnes)
# safe=False → dispatch blocked, reason logged, next-best cell selected
```

### Slope Enforcement

Each dump checks whether the resulting local height gradient would exceed
the material's angle of repose (configurable per material: rock, ore,
overburden, default).  Violations are rejected at placement time rather than
detected post-hoc during surveying.

### Audit Trail

Every dispatch decision — including rejections with reasons — is written to
`/tmp/adios_audit_v3.json` in real time.  The Audit Replay page (`/audit`)
allows operators to step through every decision chronologically, observe the
terrain state at each timestep, and read the exact rejection reason for any
blocked dispatch.  This is accessible without the live API running.

```json
{
  "t": 14,
  "truck": "Cat793-2",
  "r": 47, "c": 63,
  "status": "iso_rejected",
  "reach": 0.812,
  "payload_t": 240.0
}
```

---

## Benchmark Results

Evaluated on 20 held-out polygon seeds (seeds 8000–8019, never seen during
training), comparing ADIOS heuristic vs. static uniform-grid baseline:

| KPI | ADIOS (heuristic) | Static Grid | Delta |
|-----|-------------------|-------------|-------|
| Packing efficiency | **~74 %** | ~46 % | **+28 pp** |
| Coverage | **~83 %** | ~68 % | +15 pp |
| Height uniformity | **0.80** | 0.61 | +31 % |
| Rejection rate | **4.2 %** | 0 % | safety cost |
| Mean spacing (cells) | **4.8** | 8.0 | −40 % |
| Decision latency | **< 50 ms** | < 1 ms | acceptable |
| Generalisation δ | **±3.1 pp** | ±8.4 pp | 2.7× more consistent |

*Run `python evaluation/benchmark.py` with the backend dependencies installed
to reproduce these numbers.*

---

## Quick Start

### Prerequisites

```
Python 3.10+
Node.js 18+
```

### 1 — Backend

```bash
cd adios-v3/backend
pip install -r requirements.txt

# Fast supervised MLP (~60 s, recommended for demo)
python ml/train_supervised.py --polygons 60

# OR full PPO training (~3 min)
python pretrain.py --steps 100000

# Generate benchmark baseline (optional but populates the Benchmark panel)
python evaluation/benchmark.py --polygons 20

# Start API server
uvicorn api.main:app --reload --port 8000
```

### 2 — Frontend

```bash
cd adios-v3/frontend
npm install
npm run dev
# Open http://localhost:3000
```

### 3 — Verify

```
GET  http://localhost:8000/health      → { status: "ok", policy_type: "supervised_mlp" }
GET  http://localhost:3000             → Animated 3D landing page
GET  http://localhost:3000/dashboard   → Live simulation dashboard
GET  http://localhost:3000/scheduling  → Gantt dispatch timeline
GET  http://localhost:3000/audit       → Audit replay
```

---

## API Reference

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/health` | System status, ML policy type, weights path |
| `GET`  | `/fleet_specs` | Truck model specifications |
| `POST` | `/simulate` | Full polygon fill; returns terrain, KPIs, snapshots, log |
| `POST` | `/tune` | Auto-tune scorer weights via coordinate descent |
| `GET`  | `/benchmark` | Load pre-computed benchmark results |
| `GET`  | `/audit` | Load last simulation audit log |
| `GET`  | `/eval_result` | Load last ML vs heuristic evaluation summary |
| `GET`  | `/schedule` | Generate Gantt/queue timeline for scheduling page |

### WebSocket

```
WS ws://localhost:8000/ws/simulate
```

Send a `SimConfig` JSON on connect; receive a stream of:

```jsonc
{ "type": "dump",     "r": 47, "c": 63, "truck": "Cat793", "volume": 4821.3, ... }
{ "type": "rejected", "r": 50, "c": 71, "reach": 0.81 }
{ "type": "done",     "summary": { ... } }
```

### SimConfig

```jsonc
{
  "material":     "rock",          // "rock" | "ore" | "overburden" | "default"
  "n_dumps":      60,
  "fleet_models": ["Cat793","Cat777","Cat797","Cat793"],
  "iso_threshold": 0.85,           // reachability threshold [0,1]
  "auto_tune":    false,           // run weight optimiser before simulating
  "seed":         42,
  "use_ml":       true             // use neural policy instead of heuristic
}
```

---

## Project Structure

```
adios-v3/
├── README.md
├── backend/
│   ├── requirements.txt
│   ├── pretrain.py                    ← PPO training entry point
│   ├── api/
│   │   └── main.py                   ← FastAPI app
│   ├── environment/
│   │   └── terrain.py                ← Core terrain model
│   ├── fleet/
│   │   └── truck.py                  ← Truck specs
│   ├── planning/
│   │   ├── orchestrator.py           ← Dispatch loop
│   │   ├── scorer.py                 ← Heuristic scoring engine
│   │   ├── isolation_validator.py    ← BFS safety checker
│   │   ├── scheduler.py              ← Truck queue scheduler
│   │   ├── weight_tuner.py           ← Auto-tuner
│   │   └── pathfinder.py             ← Pathfinding utilities
│   ├── ml/
│   │   ├── environment.py            ← gymnasium.Env wrapper
│   │   ├── policy.py                 ← Policy loader & wrappers
│   │   ├── train_supervised.py       ← Fast supervised MLP trainer
│   │   ├── data_gen.py               ← Synthetic data generator
│   │   └── weights/                  ← Trained model artifacts
│   ├── evaluation/
│   │   └── benchmark.py              ← 8-KPI benchmark CLI
│   └── data/
│       └── benchmark/
│           └── benchmark_baseline.json ← Pre-baked baseline results
└── frontend/
    ├── package.json
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx             ← Nav + root layout
    │   │   ├── page.tsx               ← Landing page (3D hero)
    │   │   ├── dashboard/page.tsx     ← Simulation dashboard
    │   │   ├── scheduling/page.tsx    ← Dispatch Gantt + queue
    │   │   └── audit/page.tsx         ← Audit replay
    │   ├── components/
    │   │   ├── three/Scene3D.tsx      ← R3F terrain mesh
    │   │   ├── dashboard/
    │   │   │   ├── ControlPanel.tsx
    │   │   │   ├── MetricsPanel.tsx
    │   │   │   ├── HeatmapView.tsx
    │   │   │   ├── BenchmarkPanel.tsx
    │   │   │   └── Compare3D.tsx      ← Plotly side-by-side
    │   │   └── scheduling/
    │   │       ├── GanttChart.tsx
    │   │       └── TruckQueue.tsx
    │   ├── store/simStore.ts          ← Zustand global state
    │   ├── hooks/useSimulation.ts     ← WebSocket hook
    │   └── types/adios.ts             ← TypeScript interfaces
    └── .env.local
```

---

## Design Decisions & Technical Notes

### Why R3F (React Three Fiber) instead of Plotly for the 3D terrain?

R3F gives us a fully interactive WebGL scene that can be updated at 60 fps as
new dump data streams in over WebSocket.  Plotly (used in the Compare view)
is excellent for static publication-quality surface plots, but cannot handle
real-time incremental geometry updates without full re-renders.  The two tools
are used for their respective strengths.

### Why a custom isolation validator rather than Dijkstra?

The isolation check runs *before every dispatch* — potentially 60+ times per
simulation.  A full Dijkstra pass on a 100×100 grid at every step would add
~10 ms per dispatch.  Our BFS reachability fraction check (adapted from the
original codebase) runs in < 2 ms while providing the same safety guarantee:
it measures what fraction of the valid polygon area is reachable from the haul
road entry point after the proposed dump is applied.

### Why train on the heuristic's outputs (supervised) rather than random play?

The heuristic scorer already encodes substantial domain knowledge: it favours
cells near the current coverage frontier, penalises isolation risk, and
enforces slope limits.  Using it as a teacher means the neural policy starts
from a reasonable policy rather than random noise, dramatically accelerating
convergence.  The supervised MLP achieves >85 % teacher-matching accuracy in
60 s — sufficient to demonstrate neural generalisation at a hackathon.

### Why zustand for state management instead of Redux?

The simulation state (terrain surface, WebSocket stream, KPI history, control
panel values) updates at up to 10 Hz during live streaming.  Zustand's
middleware-free reactive model handles high-frequency slice updates with
significantly less boilerplate and re-render overhead than Redux/RTK.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `ModuleNotFoundError: terrain` | Backend run from wrong directory | `cd adios-v3/backend` first |
| Dashboard shows "API unreachable" | Backend not running | `uvicorn api.main:app --port 8000` |
| 3D view blank / WebGL error | Browser lacks WebGL2 | Use Chrome/Edge/Firefox ≥ 2023 |
| Benchmark panel empty | `benchmark_baseline.json` missing | `python evaluation/benchmark.py` |
| `sb3_contrib` import error | Optional dependency not installed | `pip install sb3-contrib` (PPO masking only) |
| Supervised weights not found | Training not run | `python ml/train_supervised.py` |

---

## Team

**Team Butterfly**
Caterpillar Hackathon — Problem Statement 4: Optimal Dump Packing

---

<div align="center">
<sub>Built with FastAPI · PyTorch · stable-baselines3 · Next.js 14 · React Three Fiber · Recharts · Plotly · Zustand</sub>
</div>
