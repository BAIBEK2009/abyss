"""Live first-person dive (CLAUDE.md v3.1, 19): the core stops at the seabed, the player reports."""
import pytest

from core import world
from core.game import Game, GameError


def dive_at(g, cell):
    return g.act({"type": "go", "target": list(cell), "tool": "dive"}, live=True)


def test_live_dive_stops_and_reports_the_seabed():
    g = Game(272, rival=False, compute_par=False)
    ev = dive_at(g, g.box)
    d = [e for e in ev if e["type"] == "dive"][-1]
    assert d["live"] and d["scene"]["box"] is True
    assert g.status == "playing" and g.pending_dive
    assert g.state()["dive"]["scene"]["box"] is True
    with pytest.raises(GameError):                       # nothing else until the dive ends
        g.act({"type": "home"})


def test_found_box_wins():
    g = Game(272, rival=False, compute_par=False)
    dive_at(g, g.box)
    ev = g.dive_end(True, 0.3)
    assert g.status == "won" and ev[-1]["type"] == "end"


def test_claiming_a_box_that_is_not_there_does_not_win():
    g = Game(272, rival=False, compute_par=False)
    empty = next(c for c in world.all_cells() if world.is_free(c) and world.manhattan(c, g.box) >= 3)
    dive_at(g, empty)
    g.dive_end(True, 1.0)
    assert g.status == "playing"


@pytest.mark.parametrize("c", [0.0, 0.25, 0.6, 1.0])
def test_not_found_uses_the_coverage_formula(c):
    g = Game(272, rival=False, compute_par=False)
    cell = next(cl for cl in world.all_cells() if world.is_free(cl) and cl != g.box and world.manhattan(cl, world.BASE) < 6)
    dive_at(g, cell)
    P = g.P[cell]
    g.dive_end(False, c)
    expected = P * (1 - 0.97 * c) / (1 - P * 0.97 * c)
    assert g.P[cell] == pytest.approx(expected, rel=1e-9)
    assert sum(g.P.values()) == pytest.approx(1.0)
    assert all(g.P[r] == 0 for r in world.REEFS)


def test_live_and_camera_modes_draw_the_same_random_numbers():
    a, b = Game(272, rival=False, compute_par=False), Game(272, rival=False, compute_par=False)
    cell = (5, 5)
    a.act({"type": "go", "target": list(cell), "tool": "dive"})
    dive_at(b, cell)
    b.dive_end(False, 1.0)
    assert a.rng.random() == b.rng.random()
