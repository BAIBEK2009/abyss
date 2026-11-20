"""Radio clues: sectors, likelihoods, reliability (CLAUDE.md v3, 5.5)."""
import random

import pytest

from core import bayes, clues, world

SIGNAL = (5.0, 5.0)


@pytest.mark.parametrize("point,sector", [
    ((8.0, 5.0), 0),   # east
    ((8.0, 2.0), 1),   # north-east (rows grow southwards)
    ((5.0, 1.0), 2),   # north
    ((2.0, 2.0), 3),   # north-west
    ((1.0, 5.0), 4),   # west
    ((2.0, 8.0), 5),   # south-west
    ((5.0, 9.0), 6),   # south
    ((8.0, 8.0), 7),   # south-east
])
def test_sectors(point, sector):
    assert clues.sector_of(point, SIGNAL) == sector


def test_fish_likelihoods():
    clue = {"kind": "fish", "sector": 2}           # "north of the last signal"
    assert clues.likelihood(clue, (4, 1), SIGNAL) == 0.75   # centre (4.5, 1.5): north
    assert clues.likelihood(clue, (7, 1), SIGNAL) == 0.45   # north-east: neighbouring sector
    assert clues.likelihood(clue, (4, 8), SIGNAL) == 0.2    # south
    assert clues.likelihood(clue, (4, 4), SIGNAL) == 0.5    # centre within 0.8 of the signal


def test_coast_band_likelihoods():
    clue = {"kind": "coast", "axis": "col", "start": 3}     # columns D..F
    assert clues.likelihood(clue, (3, 0), SIGNAL) == 0.7
    assert clues.likelihood(clue, (5, 9), SIGNAL) == 0.7
    assert clues.likelihood(clue, (6, 4), SIGNAL) == 0.3
    row = {"kind": "coast", "axis": "row", "start": 2}      # rows 3..5
    assert clues.likelihood(row, (0, 4), SIGNAL) == 0.7
    assert clues.likelihood(row, (0, 5), SIGNAL) == 0.3


def test_clues_are_right_about_75_percent_of_the_time():
    right_fish = right_coast = 0
    n = 2000
    for i in range(n):
        rng = random.Random(i)
        box = (rng.randrange(10), rng.randrange(10))
        if world.signal_cell(SIGNAL) == box:
            box = (0, 0)
        fish, coast = clues.make_clues(rng, SIGNAL, box)
        right_fish += fish["sector"] == clues.sector_of((box[0] + 0.5, box[1] + 0.5), SIGNAL)
        k = box[0] if coast["axis"] == "col" else box[1]
        right_coast += coast["start"] <= k <= coast["start"] + 2
    assert right_fish / n == pytest.approx(0.75, abs=0.04)
    assert right_coast / n == pytest.approx(0.75, abs=0.04)


def test_clue_update_keeps_belief_normalised():
    P = world.prior((6.0, 3.5))
    clue = {"kind": "coast", "axis": "row", "start": 2}
    P2, _ = bayes.update(P, clues.likelihoods(clue, P, (6.0, 3.5)))
    assert sum(P2.values()) == pytest.approx(1.0)
    assert all(P2[r] == 0.0 for r in world.REEFS)
    assert all(p > 0 for c, p in P2.items() if c not in world.REEFS)   # soft: nothing is erased


def test_public_text_data():
    pub = clues.public({"id": "coast", "kind": "coast", "hour": 18, "axis": "col", "start": 3,
                        "reliability": 0.75})
    assert (pub["from"], pub["to"]) == ("D", "F")
