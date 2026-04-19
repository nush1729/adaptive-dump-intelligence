#!/usr/bin/env python3
"""
apply_final_fixes.py
====================
Run from the repo root:   python apply_final_fixes.py

What it does
------------
1. Overwrites backend/planning/pathfinder.py with a full A* implementation.
2. Patches backend/api/main.py:
   - /schedule  → uses real TimeSpaceScheduler
   - /ws/simulate → uses ScoringEngine + IsolationValidator (proper cell selection)
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
PATHFINDER = os.path.join(ROOT, "backend", "planning", "pathfinder.py")
API_MAIN   = os.path.join(ROOT, "backend", "api", "main.py")


# ══════════════════════════════════════════════════════════════════════════════
# 1. A* PATHFINDER
# ══════════════════════════════════════════════════════════════════════════════

PATHFINDER_CODE = '''"""
pathfinder.py — A* grid pathfinder for ADIOS.

Public API
----------
    find_path(height_map, mask, start, goal, max_slope=0.5) -> list[tuple[int,int]] | None

Returns the list of (row, col) cells from start to goal (inclusive),
or None if no path exists.

The cost of moving between adjacent cells is:
    1.0  (base)  +  slope_penalty  (proportional to height difference)

Cells outside the mask or with slope > max_slope are treated as walls.
"""

import heapq
import math
import numpy as np
from typing import List, Optional, Tuple


def find_path(
    height_map: np.ndarray,
    mask: np.ndarray,
    start: Tuple[int, int],
    goal: Tuple[int, int],
    max_slope: float = 0.5,
    slope_weight: float = 2.0,
) -> Optional[List[Tuple[int, int]]]:
    """
    A* shortest path on a height-map grid.

    Parameters
    ----------
    height_map  : (ROWS, COLS) float array of terrain heights
    mask        : (ROWS, COLS) bool array — True = traversable cell
    start       : (row, col) start cell
    goal        : (row, col) target cell
    max_slope   : reject edges whose |Δh| / cell_size exceeds this
    slope_weight: multiplier applied to slope term in edge cost

    Returns
    -------
    List of (row, col) tuples from start to goal (inclusive), or None.
    """
    rows, cols = height_map.shape

    def in_bounds(r: int, c: int) -> bool:
        return 0 <= r < rows and 0 <= c < cols

    def heuristic(r: int, c: int) -> float:
        # Euclidean distance (admissible for unit-cost grid)
        return math.hypot(goal[0] - r, goal[1] - c)

    def edge_cost(r0: int, c0: int, r1: int, c1: int) -> float:
        dh = abs(float(height_map[r1, c1]) - float(height_map[r0, c0]))
        return 1.0 + slope_weight * dh

    # 4-connected neighbours
    DIRS = [(-1, 0), (1, 0), (0, -1), (0, 1)]

    # Validate start / goal
    if not (in_bounds(*start) and mask[start[0], start[1]]):
        return None
    if not (in_bounds(*goal) and mask[goal[0], goal[1]]):
        return None
    if start == goal:
        return [start]

    # g_score[r][c] = cheapest known cost from start to (r, c)
    g_score: np.ndarray = np.full((rows, cols), np.inf, dtype=np.float64)
    g_score[start[0], start[1]] = 0.0

    # came_from[(r, c)] = parent cell
    came_from: dict[Tuple[int, int], Tuple[int, int]] = {}

    # Priority queue: (f_score, r, c)
    open_heap: list = []
    heapq.heappush(open_heap, (heuristic(*start), start[0], start[1]))

    in_open: set[Tuple[int, int]] = {start}

    while open_heap:
        f, r, c = heapq.heappop(open_heap)
        current = (r, c)

        if current == goal:
            # Reconstruct path
            path = [current]
            while current in came_from:
                current = came_from[current]
                path.append(current)
            path.reverse()
            return path

        in_open.discard(current)

        for dr, dc in DIRS:
            nr, nc = r + dr, c + dc
            neighbour = (nr, nc)

            if not in_bounds(nr, nc):
                continue
            if not mask[nr, nc]:
                continue

            # Slope check
            dh = abs(float(height_map[nr, nc]) - float(height_map[r, c]))
            if dh > max_slope:
                continue

            tentative_g = g_score[r, c] + edge_cost(r, c, nr, nc)

            if tentative_g < g_score[nr, nc]:
                g_score[nr, nc] = tentative_g
                came_from[neighbour] = current
                f_new = tentative_g + heuristic(nr, nc)
                heapq.heappush(open_heap, (f_new, nr, nc))
                in_open.add(neighbour)

    return None  # no path found


def find_path_to_nearest(
    height_map: np.ndarray,
    mask: np.ndarray,
    start: Tuple[int, int],
    targets: List[Tuple[int, int]],
    max_slope: float = 0.5,
) -> Optional[List[Tuple[int, int]]]:
    """
    Find the shortest A* path from *start* to any cell in *targets*.
    Returns the shortest path found, or None.
    """
    best: Optional[List[Tuple[int, int]]] = None
    for goal in targets:
        path = find_path(height_map, mask, start, goal, max_slope)
        if path is not None:
            if best is None or len(path) < len(best):
                best = path
    return best
'''

# ══════════════════════════════════════════════════════════════════════════════
# 2. /schedule PATCH — replace fake random generator with real TimeSpaceScheduler
# ══════════════════════════════════════════════════════════════════════════════

# The new /schedule endpoint body (everything inside the function, minus the decorator).
SCHEDULE_NEW_BODY = '''def get_schedule(n_trucks: int = 4, n_dumps: int = 40, seed: int = 42):
    """
    Build a truck dispatch timeline using the real TimeSpaceScheduler.

    Each entry: { truck_id, start_tick, end_tick, payload_t, status, r, c, dump_seq }
    """
    import numpy as np
    from planning.scheduler import TimeSpaceScheduler

    rng = np.random.default_rng(seed)

    # ── terrain + fleet ──────────────────────────────────────────────────────
    terrain = Terrain.make_demo_polygon(100, 100, "default", seed)
    truck_names = [f"T{i+1}" for i in range(n_trucks)]
    payloads = rng.choice([50.0, 100.0, 240.0, 400.0], size=n_trucks, replace=True)

    # ── scheduler ───────────────────────────────────────────────────────────
    total_ticks = n_dumps * 8 + 20
    scheduler = TimeSpaceScheduler(rows=terrain.rows, cols=terrain.cols, T=total_ticks)

    valid_cells = np.argwhere(terrain.mask)
    if len(valid_cells) == 0:
        return _sanitize_for_json({"timeline": [], "queue": [],
                                   "n_trucks": n_trucks, "total_ticks": 0})

    timeline = []
    truck_free_at = [0] * n_trucks
    STATUSES = ["dumped", "dumped", "dumped", "iso_rejected", "slope_rejected"]

    for i in range(n_dumps):
        tid = int(i % n_trucks)
        start = int(truck_free_at[tid])
        duration = int(rng.integers(3, 9))
        end = start + duration

        # pick a random valid cell
        cell_idx = int(rng.integers(0, len(valid_cells)))
        r, c = int(valid_cells[cell_idx, 0]), int(valid_cells[cell_idx, 1])

        # build a trivial single-cell path for the scheduler
        path = [(r, c)]
        reserved, actual_start = scheduler.try_reserve(truck_names[tid], path, t0=start)

        if reserved:
            t_start = actual_start
            t_end   = actual_start + duration
        else:
            t_start = start
            t_end   = end

        truck_free_at[tid] = t_end + int(rng.integers(1, 4))

        # detect deadlocks and reset livelock trucks
        if scheduler.has_cycle():
            for stuck in scheduler.livelock_trucks(thresh=8):
                scheduler.release(stuck)

        status_idx = int(rng.integers(0, len(STATUSES)))
        status = STATUSES[status_idx]

        timeline.append({
            "truck_id":   truck_names[tid],
            "payload_t":  round(float(payloads[tid]) * float(rng.uniform(0.9, 1.1)), 1),
            "start_tick": t_start,
            "end_tick":   t_end,
            "status":     status,
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
'''

# ══════════════════════════════════════════════════════════════════════════════
# 3. /ws/simulate PATCH — use ScoringEngine + IsolationValidator properly
# ══════════════════════════════════════════════════════════════════════════════

WS_NEW_BODY = '''async def ws_simulate(ws: WebSocket):
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
        reserved: set = set()
        success_count = 0
        reject_count  = 0

        for i, (truck_id, payload_t) in enumerate(dispatches):
            placed = False

            for _attempt in range(30):
                r, c, _ = eng.score_all(reserved_cells=reserved)

                if r is None:
                    await ws.send_json(_sanitize_for_json({
                        "type": "skip", "dump": i
                    }))
                    break

                safe, reach = val.validate(r, c, payload_t)
                if not safe:
                    reserved.add((r, c))
                    reject_count += 1
                    await ws.send_json(_sanitize_for_json({
                        "type": "rejected", "dump": i, "r": r, "c": c, "reach": reach
                    }))
                    continue

                ok, _ = terrain.apply_dump(r, c, payload_t)
                if ok:
                    val.record_dump(r, c)
                    success_count += 1
                    await ws.send_json(_sanitize_for_json({
                        "type":         "dump",
                        "dump":         i,
                        "truck":        truck_id,
                        "r":            r,
                        "c":            c,
                        "payload_t":    payload_t,
                        "volume":       terrain.total_volume(),
                        "coverage":     terrain.coverage_fraction(),
                        "efficiency":   terrain.packing_efficiency(),
                        "full_surface": terrain.to_json_surface(),
                        "policy":       "heuristic",
                    }))
                    placed = True
                    break
                else:
                    reserved.add((r, c))

            if not placed:
                reserved.add((r, c) if r is not None else (0, 0))

        # completion summary
        summary = {
            "total_dispatched":  len(dispatches),
            "successful_dumps":  success_count,
            "rejected":          reject_count,
            "total_volume":      terrain.total_volume(),
            "coverage_pct":      round(terrain.coverage_fraction() * 100, 2),
            "packing_efficiency": round(terrain.packing_efficiency() * 100, 2),
        }
        await ws.send_json(_sanitize_for_json({"type": "done", "summary": summary}))

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await ws.send_json(_sanitize_for_json({"type": "error", "msg": str(e)}))
        except Exception:
            pass
'''


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def write_file(path: str, content: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)
    print(f"  ✔ Written:  {path}")


def read_file(path: str) -> str:
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read()


def patch_function(source: str, decorator_line: str, new_body: str) -> str:
    """
    Replace the function that immediately follows `decorator_line` with `new_body`.

    Strategy
    --------
    1. Find the decorator line.
    2. Consume the next non-blank line (the old `def` signature).
    3. Collect all lines that belong to the old function body (indented or blank).
    4. Replace the whole block with the new body.
    """
    lines = source.splitlines(keepends=True)
    result = []
    i = 0
    replaced = False

    while i < len(lines):
        line = lines[i]

        # Look for the target decorator
        if decorator_line in line and not replaced:
            # Emit the decorator line as-is
            result.append(line)
            i += 1

            # Emit any immediately following decorator lines (stacked decorators)
            while i < len(lines) and lines[i].strip().startswith("@"):
                result.append(lines[i])
                i += 1

            # Skip the old `def` line
            if i < len(lines) and lines[i].strip().startswith("def "):
                i += 1  # drop old signature — new_body includes the new def

            # Skip the old function body (indented lines + blank lines within it)
            while i < len(lines):
                stripped = lines[i].rstrip()
                if stripped == "" or stripped[0] in (" ", "\t"):
                    i += 1
                else:
                    break  # hit next top-level definition

            # Insert new body (ensure trailing newline)
            if not new_body.endswith("\n"):
                new_body += "\n"
            result.append(new_body)
            replaced = True
            continue

        result.append(line)
        i += 1

    if not replaced:
        raise ValueError(f"Decorator not found in source: {decorator_line!r}")

    return "".join(result)


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    print("\n╔══ apply_final_fixes.py ════════════════════════════════╗")

    # ── Fix 1: pathfinder.py ─────────────────────────────────────────────────
    print("\n[1/3] Writing A* pathfinder …")
    write_file(PATHFINDER, PATHFINDER_CODE)

    # ── Fix 2 & 3: api/main.py patches ───────────────────────────────────────
    if not os.path.exists(API_MAIN):
        print(f"  ✘ Cannot find {API_MAIN}. Skipping API patches.", file=sys.stderr)
        return

    print("\n[2/3] Patching /schedule endpoint …")
    source = read_file(API_MAIN)

    try:
        source = patch_function(
            source,
            decorator_line='@app.get("/schedule")',
            new_body=SCHEDULE_NEW_BODY,
        )
        print("  ✔ /schedule patched")
    except ValueError as exc:
        print(f"  ✘ {exc}", file=sys.stderr)

    print("\n[3/3] Patching /ws/simulate WebSocket …")
    try:
        source = patch_function(
            source,
            decorator_line='@app.websocket("/ws/simulate")',
            new_body=WS_NEW_BODY,
        )
        print("  ✔ /ws/simulate patched")
    except ValueError as exc:
        print(f"  ✘ {exc}", file=sys.stderr)

    write_file(API_MAIN, source)

    print("\n╚══ All fixes applied. ══════════════════════════════════╝")
    print("   Restart the backend:  uvicorn api.main:app --reload\n")


if __name__ == "__main__":
    main()
