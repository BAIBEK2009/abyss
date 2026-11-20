"""Radio clues (CLAUDE.md v3, 5.5): soft evidence with known reliability (75 %).

1. Fishermen ("Chaika" seiner) saw a flash in some DIRECTION from the last signal.
   8 sectors around the signal point. Named correctly with p = 0.75, else a neighbouring sector.
   Likelihood of a cell: named sector 0.75, neighbouring sectors 0.45, others 0.2;
   cells within 0.8 of the signal point 0.5 (direction is meaningless that close).

2. Coast guard found a seat cushion: drifting back with the current, the box is in a BAND of
   3 columns or 3 rows. The band contains the box with p = 0.75, else it is shifted.
   Likelihood: 0.7 inside the band, 0.3 outside.

Both are applied with Bayes' rule (core/bayes.py) — they move the hills but never erase cells.
"""
import math

from core import world

RELIABILITY = 0.75
SECTOR_NAMES = ("E", "NE", "N", "NW", "W", "SW", "S", "SE")   # index 0..7, counter-clockwise


def sector_of(cell_centre, signal) -> int:
    """Sector 0..7 of a point as seen from the signal (0 = east, 2 = north)."""
    dx = cell_centre[0] - signal[0]
    dy_north = signal[1] - cell_centre[1]          # rows grow southwards
    angle = math.degrees(math.atan2(dy_north, dx)) % 360
    return int(((angle + 22.5) % 360) // 45)


def _sector_gap(a: int, b: int) -> int:
    d = abs(a - b) % 8
    return min(d, 8 - d)


def make_clues(rng, signal, box) -> list:
    """Generate the two clues for this map (deterministic for a given rng)."""
    centre = (box[0] + 0.5, box[1] + 0.5)
    true_sector = sector_of(centre, signal)
    told = true_sector if rng.random() < RELIABILITY else (true_sector + rng.choice((-1, 1))) % 8
    fish = {"id": "fish", "kind": "fish", "hour": world.CLUE_HOURS[0], "sector": told,
            "reliability": RELIABILITY}

    axis = rng.choice(("col", "row"))
    k = box[0] if axis == "col" else box[1]
    if rng.random() < RELIABILITY:
        start = max(0, min(world.SIZE - 3, k - rng.randint(0, 2)))
    else:                                           # shifted: the band misses the box
        options = [s for s in range(world.SIZE - 2) if not s <= k <= s + 2]
        options.sort(key=lambda s: abs(s + 1 - k))
        start = rng.choice(options[:2])
    coast = {"id": "coast", "kind": "coast", "hour": world.CLUE_HOURS[1], "axis": axis,
             "start": start, "reliability": RELIABILITY}
    return [fish, coast]


def likelihood(clue: dict, cell, signal) -> float:
    """P(this clue | box in `cell`)."""
    if clue["kind"] == "fish":
        centre = (cell[0] + 0.5, cell[1] + 0.5)
        if math.dist(centre, signal) < 0.8:
            return 0.5
        gap = _sector_gap(sector_of(centre, signal), clue["sector"])
        return 0.75 if gap == 0 else 0.45 if gap == 1 else 0.2
    k = cell[0] if clue["axis"] == "col" else cell[1]
    return 0.7 if clue["start"] <= k <= clue["start"] + 2 else 0.3


def likelihoods(clue: dict, P: dict, signal) -> dict:
    return {c: likelihood(clue, c, signal) for c in P}


def public(clue: dict) -> dict:
    """What the radio says (no hidden truth) — for the frontend and the journal."""
    out = {k: clue[k] for k in ("id", "kind", "hour", "reliability")}
    if clue["kind"] == "fish":
        out["sector"] = clue["sector"]
    else:
        out["axis"], out["start"] = clue["axis"], clue["start"]
        names = world.COLS if clue["axis"] == "col" else [str(i + 1) for i in range(world.SIZE)]
        out["from"], out["to"] = names[clue["start"]], names[clue["start"] + 2]
    return out
