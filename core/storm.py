"""The storm front of act II "Storm" (CLAUDE.md 17.5).

A band three diagonals wide comes from the south-west and crosses the square to the north-east.
Inside it a cell costs 3 (hours and fuel: A* routes round it, Lev re-plans as it moves) and the
sonar is deaf (the waves drown the echo: no information, no Bayes update).
The front is a pure function of the hours since act II began, so the forecast "in 6 h it will be
here" is exact.

    d(cell) = x - y           (-9 in the south-west corner, +9 in the north-east)
    centre(h) = START + SPEED * h
    storm(h) = { free cells with |d(cell) - centre(h)| <= HALF }
"""
from __future__ import annotations
from core import world

START = -7.5         # the front's centre when act II begins (just off the south-west corner)
SPEED = 0.32         # diagonals per hour: it crosses the square in about two days
HALF = 1.5           # half width: three diagonals
COST = 3             # a storm cell costs three times as much
FORECAST_H = 6       # the dashed line on the chart: where the front will be in 6 hours


def centre(h: float) -> float:
    return START + SPEED * h


def cells(h: float) -> set:
    """Storm cells h hours after act II began (h < 0: no storm yet)."""
    if h < 0:
        return set()
    c = centre(h)
    return {cell for cell in world.all_cells() if world.is_free(cell) and abs((cell[0] - cell[1]) - c) <= HALF}


def passed(h: float) -> bool:
    """The front has left the square."""
    return centre(h) - HALF > 9


def public(h: float) -> dict:
    """What the chart draws: the storm now and in FORECAST_H hours."""
    return {"cells": sorted([list(c) for c in cells(h)]),
            "next": sorted([list(c) for c in cells(h + FORECAST_H)]),
            "in": FORECAST_H, "cost": COST}
