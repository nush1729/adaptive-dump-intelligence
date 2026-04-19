"""
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
