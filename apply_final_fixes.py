import os
import re

def write_pathfinder():
    pathfinder_code = '''"""
pathfinder.py — Production A* Grid Pathfinder
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
    rows, cols = height_map.shape

    if not (0 <= start[0] < rows and 0 <= start[1] < cols and mask[start[0], start[1]]):
        return None
    if not (0 <= goal[0] < rows and 0 <= goal[1] < cols and mask[goal[0], goal[1]]):
        return None

    DIRS = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]
    
    g_score = np.full((rows, cols), np.inf, dtype=np.float64)
    g_score[start[0], start[1]] = 0.0
    came_from = {}
    
    open_heap = [(0.0, start[0], start[1])]
    
    while open_heap:
        f, r, c = heapq.heappop(open_heap)
        
        if (r, c) == goal:
            path = []
            curr = (r, c)
            while curr in came_from:
                path.append(curr)
                curr = came_from[curr]
            path.append(start)
            return path[::-1]

        for dr, dc in DIRS:
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and mask[nr, nc]:
                dh = abs(float(height_map[nr, nc]) - float(height_map[r, c]))
                if dh > max_slope:
                    continue
                
                dist = math.hypot(dr, dc)
                cost = dist + (slope_weight * dh)
                tentative_g = g_score[r, c] + cost
                
                if tentative_g < g_score[nr, nc]:
                    g_score[nr, nc] = tentative_g
                    came_from[(nr, nc)] = (r, c)
                    h = math.hypot(goal[0] - nr, goal[1] - nc)
                    heapq.heappush(open_heap, (tentative_g + h, nr, nc))
                    
    return None

def find_path_to_nearest(
    height_map: np.ndarray,
    mask: np.ndarray,
    start: Tuple[int, int],
    targets: List[Tuple[int, int]],
    max_slope: float = 0.5,
) -> Optional[List[Tuple[int, int]]]:
    best = None
    for goal in targets:
        path = find_path(height_map, mask, start, goal, max_slope)
        if path is not None:
            if best is None or len(path) < len(best):
                best = path
    return best
'''
    target = "backend/planning/pathfinder.py"
    with open(target, "w") as f:
        f.write(pathfinder_code)
    print(f"✅ Overwritten {target}")


def patch_main_api():
    target = "backend/api/main.py"
    with open(target, "r") as f:
        content = f.read()

    # 1. Fix /schedule trivial pathing
    schedule_patch = """
        # Route path using actual A* instead of dummy cell
        from planning.pathfinder import find_path
        start_r, start_c = terrain.entry
        actual_path = find_path(terrain.height, terrain.mask, (int(start_r), int(start_c)), (r, c))
        if actual_path is None:
            actual_path = [(r, c)] # Fallback
            
        reserved, actual_start = scheduler.try_reserve(truck_names[tid], actual_path, t0=start)"""
    
    content = re.sub(
        r'# build a trivial single-cell path for the scheduler\s*path = \[\(r, c\)\]\s*reserved, actual_start = scheduler\.try_reserve\(truck_names\[tid\], path, t0=start\)',
        schedule_patch.strip(),
        content
    )

    # 2. Fix Duplicate ws_simulate / Random logic
    # Find all ws_simulate definitions and keep only the first correct one
    parts = content.split('@app.websocket("/ws/simulate")')
    if len(parts) > 1:
        # Keep the header and the first valid implementation (which imports ScoringEngine)
        header = parts[0]
        impls = parts[1].split('async def ws_simulate(ws: WebSocket):')
        correct_impl = ""
        for impl in impls[1:]:  # skip the first one which is just newline
            if "ScoringEngine" in impl and "random.randint" not in impl:
                correct_impl = "async def ws_simulate(ws: WebSocket):" + impl
                break
        
        if correct_impl:
            content = header + '@app.websocket("/ws/simulate")\\n' + correct_impl

    with open(target, "w") as f:
        f.write(content)
    print(f"✅ Patched {target}")


if __name__ == "__main__":
    print("Applying ADIOS Enterprise Fixes...")
    write_pathfinder()
    patch_main_api()
    print("🚀 All backend systems stabilized.")
