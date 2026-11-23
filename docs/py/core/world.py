"""The world: grid, reefs, bases, prior, resources, sensor models (CLAUDE.md v3, section 5).

Coordinates are (x, y): x = column 0..9 (letters A..J), y = row 0..9 (numbers 1..10, north is up,
row 1 is far from the captain). "A10" is (0, 9). Pure Python — no network, no graphics.

Every number in this file is a design ASSUMPTION; the README lists them all.
"""
from __future__ import annotations
import math

SIZE = 10
COLS = "ABCDEFGHIJ"

# --- Resources -----------------------------------------------------------------------------
BEACON_HOURS = 120      # the black box beacon dies after this many mission hours
START_FUEL = 100

# Player's ship "Aurora": (hours, fuel) per action
MOVE_HOURS, MOVE_FUEL = 1, 2        # per cell, along the A* route
SONAR_HOURS, SONAR_FUEL = 2, 3      # sonar 3x3 around the ship
DIVE_HOURS, DIVE_FUEL = 6, 8        # bathyscaphe "Nerpa" with a camera, one cell
REFUEL_HOURS = 4                    # "home": 1 h per cell + 4 h, fuel -> 100
TOW_FUEL, TOW_HOURS = 60, 24        # fuel <= 0: towed to base, fuel 60, minus 24 h

# Rival "Poseidon-2" is slower on the move
RIVAL_MOVE_HOURS = 1.5
RIVAL_SONAR_HOURS = 2
RIVAL_DIVE_HOURS = 6

CLUE_HOURS = (6, 18)                # radio clues arrive at these mission hours


def cell_name(cell) -> str:
    """(0, 9) -> 'A10'."""
    x, y = cell
    return f"{COLS[x]}{y + 1}"


def parse_cell(name: str) -> tuple[int, int]:
    """'A10' -> (0, 9)."""
    return COLS.index(name[0].upper()), int(name[1:]) - 1


# --- Map ----------------------------------------------------------------------------------
REEFS = frozenset({(2, 1), (2, 2), (6, 0), (8, 2), (5, 3), (1, 5), (5, 7), (7, 7), (8, 7), (4, 8), (3, 3)})
BASE = (0, 9)           # A10, the player's base (a small lighthouse)
RIVAL_START = (9, 9)    # J10

SIGNAL_X = (4.5, 7.5)   # last known signal position (continuous, map units)
SIGNAL_Y = (2.0, 5.0)


def in_bounds(cell) -> bool:
    x, y = cell
    return 0 <= x < SIZE and 0 <= y < SIZE


def is_free(cell) -> bool:
    """Inside the map and not a reef (a ship can be here)."""
    return in_bounds(cell) and tuple(cell) not in REEFS


def all_cells():
    """Every cell, row by row: (0,0), (1,0), ..., (9,9)."""
    return [(x, y) for y in range(SIZE) for x in range(SIZE)]


def manhattan(a, b) -> int:
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def chebyshev(a, b) -> int:
    """Distance in 'king moves': <= 1 means the 3x3 square around a."""
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]))


# --- Prior belief -------------------------------------------------------------------------
def prior(signal) -> dict:
    """Prior around the last signal (cx, cy), cell centres at (x + 0.5, y + 0.5):

        w(x, y) = exp(-((x + 0.5 - cx)^2 / 7 + (y + 0.5 - cy)^2 / 6)),  reefs = 0,  normalise.

    Returns {cell: probability} for ALL cells (reefs included, with 0)."""
    cx, cy = signal
    w = {}
    for c in all_cells():
        x, y = c
        w[c] = 0.0 if c in REEFS else math.exp(-((x + 0.5 - cx) ** 2 / 7 + (y + 0.5 - cy) ** 2 / 6))
    total = sum(w.values())
    return {c: v / total for c, v in w.items()}


def signal_cell(signal) -> tuple[int, int]:
    """The cell that contains the (continuous) last-signal point."""
    return min(SIZE - 1, int(signal[0])), min(SIZE - 1, int(signal[1]))


# --- Sensor models ------------------------------------------------------------------------
SONAR_HIT = 0.80     # P(echo | box inside the 3x3 square around the ship)
SONAR_FALSE = 0.08   # P(echo | box outside): false alarm

CAMERA_OUTCOMES = ("box", "debris", "nothing")
# P(camera outcome | Manhattan distance d from the dive cell to the box)
CAMERA = {
    0: {"box": 0.97, "debris": 0.01, "nothing": 0.02},
    1: {"box": 0.00, "debris": 0.60, "nothing": 0.40},
    2: {"box": 0.00, "debris": 0.03, "nothing": 0.97},   # d >= 2
}


def p_echo(ship, box) -> float:
    return SONAR_HIT if chebyshev(ship, box) <= 1 else SONAR_FALSE


def camera_probs(dive_cell, box) -> dict:
    return CAMERA[min(2, manhattan(dive_cell, box))]
