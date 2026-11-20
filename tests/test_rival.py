"""Rival "Poseidon-2": honest forecast, fixed plan, shared clock (CLAUDE.md v3, 5.6)."""
import random

import pytest

from core import agent, world
from core.rival import Rival


def far_belief(target=(2, 0)):
    """All belief on one far cell: the rival must sail there first (no sensors on the way)."""
    P = {c: 0.0 for c in world.all_cells()}
    P[target] = 1.0
    return P


def test_forecast_matches_the_actual_route_without_sensors():
    r = Rival(far_belief(), random.Random(1))
    moves = [t for t in r.tasks if t["kind"] == "move"]
    for hours in (1.5, 4.5, 6.0, 9.0):
        f = Rival(far_belief(), random.Random(1)).forecast(hours)
        r2 = Rival(far_belief(), random.Random(1))
        r2.advance_to(hours, box=(9, 0))
        assert f["pos"] == list(r2.pos)
    assert len(moves) == agent.route(world.RIVAL_START, (2, 0)).moves


def test_rival_moves_take_one_and_a_half_hours():
    r = Rival(far_belief(), random.Random(1))
    first = r.tasks[0]
    assert first["kind"] == "move" and first["end"] - first["start"] == pytest.approx(1.5)
    r.advance_to(1.49, box=(9, 0))
    assert r.pos == world.RIVAL_START
    r.advance_to(1.5, box=(9, 0))
    assert r.pos != world.RIVAL_START


def test_plan_does_not_change_after_a_clue_until_the_tool_is_done():
    r = Rival(far_belief(), random.Random(1))
    plan = dict(r.plan)
    L = {c: (0.9 if c == (9, 0) else 0.1) for c in world.all_cells()}
    r.apply_clue(L)
    assert r.plan == plan


def test_forecast_reports_a_dive_finishing_inside_the_window():
    P = {c: 0.0 for c in world.all_cells()}
    P[(9, 9)] = 1.0                                   # already on top of the target: dives at once
    r = Rival(P, random.Random(1))
    assert r.plan["tool"] == "dive"
    assert r.forecast(5)["dive_done"] is None
    done = r.forecast(6)["dive_done"]
    assert done == {"cell": [9, 9], "in": pytest.approx(6.0)}


def test_successful_dive_sets_found_time():
    P = {c: 0.0 for c in world.all_cells()}
    P[(9, 9)] = 1.0
    hits = 0
    for seed in range(50):
        r = Rival(P, random.Random(seed))
        events = r.advance_to(6, box=(9, 9))
        if r.found_at is not None:
            hits += 1
            assert r.found_at == 6 and events[-1]["result"] == "box"
    assert hits >= 45                                  # camera sees the box with p = 0.97


def test_plan_info_for_the_banner():
    r = Rival(far_belief(), random.Random(1))
    info = r.plan_info()
    assert info["target"] == [2, 0]
    assert info["tool_end_in"] > info["arrive_in"] > 0
    assert info["path"][0] == list(world.RIVAL_START)
