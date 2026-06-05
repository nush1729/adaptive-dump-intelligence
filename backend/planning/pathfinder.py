"""
pathfinder.py — Slope-aware A* pathfinder for the ADIOS dump-site grid.

Uses 8-connected A* (diagonal moves allowed) with a height-delta cost term.
The key parameter is max_slope: it must be large enough to cross real pile heights.
Gaussian dump deposition creates height peaks of several metres between adjacent
cells — if max_slope is too small (e.g. 0.5m) A* blocks on any pile and returns
None for nearly every dispatch. The tuned value is 2.5m (see config.py comments).
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
    max_slope: float = 2.5,
    slope_weight: float = 1.5,
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
