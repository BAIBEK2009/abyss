"""The officers: Vera (Bayes), Lev (A*), Grisha (MDP) and their joint advice (CLAUDE.md v3, 6)."""
from core import agent, world


def belief(cell, p, spread_cells=None):
    """`p` on `cell`, the rest spread evenly over the other free cells."""
    free = [c for c in world.all_cells() if world.is_free(c) and c != cell]
    P = {c: 0.0 for c in world.all_cells()}
    P[cell] = p
    for c in free:
        P[c] = (1 - p) / len(free)
    return P


def test_vera_dives_when_confident_otherwise_sonar():
    assert agent.tool_for(belief((5, 5), 0.25), (5, 5)) == "dive"      # P >= 0.20
    assert agent.tool_for(belief((5, 5), 0.10), (5, 5)) == "sonar"
    # P(cell) = 0.10 < 0.20, but the 3x3 square holds 0.10 + 8 * 0.06 = 0.58 >= 0.50 -> dive
    ring = [(4, 4), (4, 5), (4, 6), (5, 4), (5, 6), (6, 4), (6, 5), (6, 6)]
    rest = [c for c in world.all_cells() if world.is_free(c) and c != (5, 5) and c not in ring]
    P = {c: 0.0 for c in world.all_cells()}
    P[(5, 5)] = 0.10
    for c in ring:
        P[c] = 0.06
    for c in rest:
        P[c] = 0.42 / len(rest)
    assert agent.tool_for(P, (5, 5)) == "dive"


def test_joint_advice_go_and_listen():
    off = agent.officers(belief((6, 3), 0.15), world.BASE, 100)
    assert off["vera"]["target"] == [6, 3] and off["vera"]["tool"] == "sonar"
    assert off["lev"]["cells"] == len(off["lev"]["path"]) - 1
    assert off["lev"]["hours"] == off["lev"]["cells"] and off["lev"]["fuel"] == 2 * off["lev"]["cells"]
    assert off["grisha"]["action"] == "SEARCH"
    assert off["advice"] == {"action": {"type": "go", "target": [6, 3], "tool": "sonar"}, "kind": "go_sonar"}


def test_joint_advice_dive_here():
    off = agent.officers(belief((6, 4), 0.4), (6, 4), 80)
    assert off["lev"]["here"] and off["advice"]["kind"] == "dive_here"


def test_grisha_low_fuel_sends_ship_home_but_not_at_base():
    off = agent.officers(belief((6, 3), 0.15), (5, 5), 30)
    assert off["grisha"]["state"] == "LOW" and off["advice"]["action"] == {"type": "home"}
    off = agent.officers(belief((6, 3), 0.15), world.BASE, 30)
    assert off["advice"]["action"]["type"] == "go"


def test_par_is_reproducible():
    a = agent.par(7, (6.0, 3.5), (6, 4), runs=5)
    assert a == agent.par(7, (6.0, 3.5), (6, 4), runs=5)
    assert a["found"] >= 1 and a["hours"] > 0
