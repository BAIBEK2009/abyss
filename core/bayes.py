"""Algorithm 1 — Bayesian update of the probability map ("where is the black box?").

The belief is a dict {cell: P(box is in cell)} that always sums to 1 (reefs stay 0).

Every piece of evidence e gives a likelihood for each cell c:  L(c) = P(e | box in c).
Then Bayes' rule:
    Z     = sum_c L(c) * P(c)          (how probable the evidence was)
    P'(c) = L(c) * P(c) / Z            (posterior)

Evidence sources:
    sonar 3x3   L = 0.80 inside the 3x3 square around the ship, 0.08 outside  (echo)
                L = 0.20 inside, 0.92 outside                                   (silence)
    camera      L = CAMERA[d][outcome], d = Manhattan distance from the dive cell
    radio clue  L from core/clues.py (a soft, 75 %-reliable hint)
"""
from core import world


def update(P: dict, L: dict):
    """Generic Bayes step with likelihoods L (dict cell -> P(evidence | box in cell)).
    Returns (posterior, Z)."""
    Z = sum(L[c] * P[c] for c in P)
    if Z <= 0:
        raise ValueError("evidence impossible under the current belief")
    return {c: L[c] * P[c] / Z for c in P}, Z


# --- sonar --------------------------------------------------------------------------------
def sonar_likelihood(cell, ship, echo: bool) -> float:
    inside = world.chebyshev(cell, ship) <= 1
    pe = world.SONAR_HIT if inside else world.SONAR_FALSE
    return pe if echo else 1.0 - pe


def sonar(P: dict, ship, echo: bool):
    """Belief after a sonar check from `ship`. Returns (posterior, Z)."""
    return update(P, {c: sonar_likelihood(c, ship, echo) for c in P})


def echo_chance(P: dict, ship) -> float:
    """P(echo) before listening = sum_c P(c) * P(echo | box in c)."""
    return sum(P[c] * sonar_likelihood(c, ship, True) for c in P)


# --- camera (bathyscaphe dive) ------------------------------------------------------------
def camera_likelihood(cell, dive_cell, outcome: str) -> float:
    return world.CAMERA[min(2, world.manhattan(cell, dive_cell))][outcome]


def camera(P: dict, dive_cell, outcome: str):
    """Belief after the camera shows `outcome` ("box" | "debris" | "nothing") at `dive_cell`."""
    return update(P, {c: camera_likelihood(c, dive_cell, outcome) for c in P})


def find_chance(P: dict, cell) -> float:
    """P(the camera shows the box) = P(box here) * 0.97."""
    return P[cell] * world.CAMERA[0]["box"]


# --- helpers ------------------------------------------------------------------------------
def argmax(P: dict, near=None):
    """Most likely cell. Ties -> closer to `near` (if given) -> top-left first."""
    def key(c):
        dist = world.manhattan(c, near) if near is not None else 0
        return (-P[c], dist, c[1], c[0])
    return min(P, key=key)


def sum_around(P: dict, cell) -> float:
    """Total probability in the 3x3 square around `cell`."""
    return sum(p for c, p in P.items() if world.chebyshev(c, cell) <= 1)
