<div align="center">

# ⛏ ADIOS
### **Adaptive Dump Intelligence & Orchestration System**

*Enterprise-Grade Mining Logistics Intelligence Platform*

[![FastAPI](https://img.shields.io/badge/FastAPI-0.136-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=nextdotjs)](https://nextjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-r3f-black?style=flat-square&logo=threedotjs)](https://threejs.org/)
[![PyTorch](https://img.shields.io/badge/PyTorch-PPO%20RL-EE4C2C?style=flat-square&logo=pytorch)](https://pytorch.org/)
[![Python](https://img.shields.io/badge/Python-3.14-3776AB?style=flat-square&logo=python)](https://python.org/)

---

> **ADIOS** is a real-time, AI-powered dump logistics intelligence platform purpose-built for open-pit mining environments. It fuses A\* pathfinding, PPO reinforcement learning, and live 3D WebGL terrain visualization into a single operational dashboard — the kind of platform that traditionally takes enterprise teams years to build.

</div>

---

## 🎬 Platform Overview

| Module | Description |
|---|---|
| 🌍 **Live 3D Terrain** | Real-time WebGL visualization of dynamic dump surface geometry using Three.js (R3F). Supports wireframe, ISO/Top/Front camera presets. |
| 🧠 **AI Dispatch Engine** | Hybrid PPO reinforcement learning + A\* heuristic planning with live WebSocket simulation streaming. |
| 📊 **Score Heatmap** | Per-cell scoring visualization across the polygon mask — updated live during simulation. |
| 📅 **Dispatch Gantt** | Interactive timeline of per-truck dispatch events with live playback and tick-by-tick scrubbing. |
| 🔄 **Audit Replay** | Full step-by-step decision replay with 3D terrain reconstruction and annotated rejection explanations. |
| ⚡ **Benchmark VS** | ADIOS vs. static baseline comparison — volume, coverage, packing efficiency. |

---

## 🧰 Architecture

```
┌─────────────────────────────────────────────────────┐
│                   ADIOS Platform                    │
├──────────────────┬──────────────────────────────────┤
│   Frontend (Next)│        Backend (FastAPI)         │
│                  │                                  │
│  ┌────────────┐  │  ┌──────────┐  ┌─────────────┐  │
│  │ 3D Terrain │◄─┼──│ WS /sim  │  │ terrain.py  │  │
│  │  (R3F)     │  │  │ stream   │  │ A* planner  │  │
│  └────────────┘  │  └──────────┘  └─────────────┘  │
│  ┌────────────┐  │  ┌──────────┐  ┌─────────────┐  │
│  │  Gantt     │◄─┼──│/schedule │  │ scheduler.py│  │
│  │  Chart     │  │  │          │  │ PPO policy  │  │
│  └────────────┘  │  └──────────┘  └─────────────┘  │
│  ┌────────────┐  │  ┌──────────┐  ┌─────────────┐  │
│  │  Audit     │◄─┼──│/simulate │  │ scorer.py   │  │
│  │  Replay    │  │  │          │  │ iso_validator│  │
│  └────────────┘  │  └──────────┘  └─────────────┘  │
└──────────────────┴──────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- Python 3.14+
- Node.js 20+ *(for frontend)*
- PyTorch (CPU or CUDA)

---

### 1. Backend

```bash
cd backend

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate        # macOS/Linux
# OR
.venv\Scripts\activate           # Windows

# Install dependencies
pip install -r requirements.txt

# Apply backend patches (A* planner, WS fix)
cd ..
python3 apply_final_fixes.py
cd backend

# Start the API server
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

Backend will be live at **http://localhost:8000**. Check **http://localhost:8000/health** to confirm.

---

### 2. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Frontend will be live at **http://localhost:3000**.

---

## 🗺 Navigation

| Route | Description |
|---|---|
| `/` | Landing page — project overview |
| `/dashboard` | **Main simulation dashboard** — 3D terrain, heatmap, scoring |
| `/scheduling` | Dispatch Scheduler — Gantt chart + truck queue |
| `/audit` | Audit Replay — step-by-step decision analysis with 3D playback |

---

## 🧠 AI & Planning Stack

### A\* Pathfinding
The scheduler uses a **slope-weighted A\* grid pathfinder** (`backend/planning/pathfinder.py`) that:
- Respects material-specific angle-of-repose limits
- Penalizes steep cell transitions
- Returns the optimal haul road path from entry point to target dump cell

### PPO Reinforcement Learning
- Trained via **Stable Baselines3** with a custom `DumpEnv` gymnasium environment
- Policy input: `[fill_ratio, congestion_map, slope_map, isolation_map, distance_map]`
- Policy output: `(row, col)` target cell recommendation
- Falls back gracefully to the heuristic scorer if the PPO model is unavailable

### Isolation Validator
Every candidate dump cell passes through an **isolation safety check** (`backend/planning/isolation_validator.py`) that validates polygon reachability to prevent equipment entrapment.

---

## 🔌 API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/health` | `GET` | System status + policy type |
| `/fleet_specs` | `GET` | Fleet model specifications |
| `/simulate` | `POST` | Run full simulation, return result |
| `/schedule` | `GET` | Generate time-space schedule (Gantt data) |
| `/tune` | `POST` | Auto-tune scoring weights via Optuna |
| `/benchmark` | `GET` | Historical benchmark stats |
| `/audit` | `GET` | Last simulation audit log |
| `/ws/simulate` | `WebSocket` | Live simulation event stream |

---

## 📁 Project Structure

```
adaptive-dump-intelligence/
├── backend/
│   ├── api/
│   │   └── main.py              # FastAPI app + WebSocket server
│   ├── planning/
│   │   ├── pathfinder.py        # A* route planner
│   │   ├── scheduler.py         # Time-space scheduler
│   │   ├── scorer.py            # Multi-objective cell scorer
│   │   ├── isolation_validator.py
│   │   └── orchestrator.py      # Simulation orchestrator
│   ├── simulation/
│   │   └── terrain.py           # Terrain + polygon geometry
│   ├── ml/
│   │   └── ppo_policy.py        # PPO RL policy
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx         # Landing page
│   │   │   ├── dashboard/       # Main sim dashboard
│   │   │   ├── scheduling/      # Gantt dispatch view
│   │   │   └── audit/           # Audit replay
│   │   ├── components/
│   │   │   ├── NavBar.tsx       # Shared navigation
│   │   │   ├── three/           # Scene3D WebGL terrain
│   │   │   ├── dashboard/       # Panels, metrics, benchmark
│   │   │   └── scheduling/      # GanttChart, TruckQueue
│   │   ├── store/
│   │   │   └── simStore.ts      # Zustand global state
│   │   ├── types/
│   │   │   └── adios.ts         # TypeScript interfaces
│   │   └── lib/
│   │       └── api.ts           # API + WebSocket client
│   └── tailwind.config.js
│
├── apply_final_fixes.py         # One-shot backend patch script
└── README.md
```

---

## 🏗 Tech Stack

**Frontend**
- [Next.js 14](https://nextjs.org/) — App Router
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) — 3D WebGL terrain
- [Zustand](https://zustand-demo.pmnd.rs/) — Global simulation state
- [Recharts](https://recharts.org/) — Live volume progress charts
- Tailwind CSS — Dark/Light industrial theme

**Backend**
- [FastAPI](https://fastapi.tiangolo.com/) — REST + WebSocket API
- [Stable Baselines3](https://stable-baselines3.readthedocs.io/) — PPO RL training
- [PyTorch](https://pytorch.org/) — ML model inference
- [NumPy / SciPy](https://scipy.org/) — Terrain geometry & pathfinding
- [Optuna](https://optuna.org/) — Weight auto-tuning

---

## 🎨 Design System

ADIOS uses a **Cinematic Industrial** design language:

| Token | Value | Usage |
|---|---|---|
| `--acid` | `#FFC000` (Caterpillar Yellow) | Actions, values, accents |
| `--ore` | `#FF5722` | Rejections, warnings |
| `--void` | `#0A0C0F` | Page background |
| `--surface` | `#141619` | Panels |
| `--panel` | `#1E2124` | Cards |
| Typography | `Syncopate`, `JetBrains Mono`, `DM Sans` | Headers, data, body |

---

## 📝 License

MIT License — Built as part of an enterprise simulation research project.

---

<div align="center">

**Built with precision for industrial-scale logistics intelligence.**

*ADIOS — Where real-time AI meets open-pit engineering.*

</div>
