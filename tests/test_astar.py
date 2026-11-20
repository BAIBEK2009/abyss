"""A* — hand-checked grids (CLAUDE.md, section 5.2) + optimality against BFS on the real map."""
from collections import deque

from core import world
from core.astar import astar


def free_except(walls):
    return lambda c: c not in walls


def test_open_grid_corner_to_corner():
    r = astar((0, 0), (4, 4), free_except(set()), 5, 5)
    assert r.moves == 8
    assert r.path[0] == (0, 0) and r.path[-1] == (4, 4)


def test_wall_forces_detour_through_gap():
    wall = {(2, y) for y in range(4)}  # x = 2 blocked for y = 0..3, gap at (2, 4)
    r = astar((0, 2), (4, 2), free_except(wall), 5, 5)
    assert r.moves == 8          # not 4: the straight line is blocked
    assert (2, 4) in r.path      # the only way through
    assert not wall & set(r.path)


def test_goal_in_wall_returns_none():
    r = astar((0, 0), (2, 1), free_except({(2, 1)}), 5, 5)
    assert r.path is None


def test_goal_outside_grid_returns_none():
    assert astar((0, 0), (5, 0), free_except(set()), 5, 5).path is None


def test_unreachable_goal_returns_none():
    box = {(1, 0), (1, 1), (0, 1)}  # (0, 0) is walled in
    assert astar((3, 3), (0, 0), free_except(box), 5, 5).path is None


def test_start_equals_goal():
    r = astar((2, 2), (2, 2), free_except(set()), 5, 5)
    assert r.path == [(2, 2)] and r.moves == 0


def test_path_steps_are_adjacent_and_safe():
    r = astar(world.BASE, (9, 0), world.is_free, world.SIZE, world.SIZE)
    for a, b in zip(r.path, r.path[1:]):
        assert world.manhattan(a, b) == 1
        assert world.is_free(b)


def bfs_distances(start):
    dist = {start: 0}
    q = deque([start])
    while q:
        c = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (c[0] + dx, c[1] + dy)
            if world.is_free(n) and n not in dist:
                dist[n] = dist[c] + 1
                q.append(n)
    return dist


def test_astar_is_optimal_on_real_map_and_every_free_cell_is_reachable():
    """Manhattan is admissible -> A* must match BFS shortest lengths everywhere."""
    for start in (world.BASE, world.RIVAL_START, (5, 5)):
        dist = bfs_distances(start)
        free = [c for c in world.all_cells() if world.is_free(c)]
        assert set(dist) == set(free)  # no cell is cut off by reefs
        for goal in free:
            assert astar(start, goal, world.is_free, world.SIZE, world.SIZE).moves == dist[goal]


def test_astar_expands_fewer_nodes_than_full_search():
    r = astar((0, 0), (3, 0), free_except(set()), 10, 10)
    assert r.expanded < 100  # heuristic focuses the search
    assert r.moves == 3
