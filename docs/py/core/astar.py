"""Algorithm 2 — A* search: shortest safe route on the grid.

4-connected grid, every step costs 1 (or cost(cell) >= 1 when a cost function is given: the storm
of act II costs 3 per cell, CLAUDE.md 17.5 / 17.9). Reefs are impassable.

    f(n) = g(n) + h(n)
    g(n) = cost of the best known route from start to n
    h(n) = Manhattan distance from n to the goal (admissible: never overestimates,
           because every move changes x or y by exactly 1 and costs at least 1) -> A* returns an optimal path.

A* always expands the open node with the smallest f; it stops when the goal is expanded.
"""
from __future__ import annotations
import heapq
from dataclasses import dataclass

# Neighbour order is fixed so results are reproducible: right, down, left, up.
MOVES = ((1, 0), (0, 1), (-1, 0), (0, -1))


@dataclass
class AStarResult:
    path: list | None   # [start, ..., goal] or None if the goal cannot be reached
    expanded: int       # how many nodes were taken out of the open list
    cost: float | None = None   # total cost of the route (= moves when every cell costs 1)

    @property
    def moves(self) -> int | None:
        """Number of steps (= fuel cost of the route)."""
        return None if self.path is None else len(self.path) - 1


def manhattan(a, b) -> int:
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def astar(start, goal, passable, width: int, height: int, cost=None) -> AStarResult:
    """Find a cheapest path from `start` to `goal`.

    passable(cell) -> bool says whether the sub may enter a cell (e.g. not a reef).
    cost(cell) -> float >= 1: the price of entering a cell (default 1: the shortest path).
    """
    start, goal = tuple(start), tuple(goal)

    def inside(c):
        return 0 <= c[0] < width and 0 <= c[1] < height

    if not inside(goal) or not passable(goal):
        return AStarResult(None, 0)

    counter = 0  # tie-breaker so the heap never compares cells
    open_heap = [(manhattan(start, goal), manhattan(start, goal), counter, start)]
    g = {start: 0}
    came_from = {}
    closed = set()
    expanded = 0

    while open_heap:
        _f, _h, _, cur = heapq.heappop(open_heap)
        if cur in closed:
            continue  # stale entry: a better route to `cur` was already expanded
        closed.add(cur)
        expanded += 1

        if cur == goal:
            path = [cur]
            while cur in came_from:
                cur = came_from[cur]
                path.append(cur)
            return AStarResult(path[::-1], expanded, g[goal])

        for dx, dy in MOVES:
            nb = (cur[0] + dx, cur[1] + dy)
            if not inside(nb) or not passable(nb) or nb in closed:
                continue
            new_g = g[cur] + (cost(nb) if cost else 1)
            if new_g < g.get(nb, float("inf")):
                g[nb] = new_g
                came_from[nb] = cur
                h = manhattan(nb, goal)
                counter += 1
                heapq.heappush(open_heap, (new_g + h, h, counter, nb))

    return AStarResult(None, expanded)
