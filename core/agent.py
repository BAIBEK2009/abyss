"""The three officers — one algorithm each — and their joint advice (CLAUDE.md v3, section 6).

    Vera   · analyst   · Bayes : the most likely cell and which tool to use there
    Lev    · navigator · A*    : the route to that cell around the reefs
    Grisha · mechanic  · MDP   : keep searching or go home to refuel?

Joint advice: if Grisha says RETURN and the ship is not at base -> go home;
otherwise Vera's target, Lev's route, Vera's tool. The rival "Poseidon-2" uses the same brain.

Tool rule (an ASSUMPTION, tuned by tools/balance.py): dive if P(cell) >= 0.20 or the 3x3 sum
around it >= 0.50, otherwise listen with the sonar first (cheaper).
"""
from __future__ import annotations
import statistics

from core import bayes, mdp, world
from core.astar import AStarResult, astar

DIVE_P = 0.20
DIVE_SUM = 0.50
PAR_RUNS = 16


def route(a, b) -> AStarResult:
    return astar(a, b, world.is_free, world.SIZE, world.SIZE)


def tool_for(P: dict, cell) -> str:
    """Vera's rule: 'dive' when confident enough, else 'sonar'."""
    return "dive" if P[cell] >= DIVE_P or bayes.sum_around(P, cell) >= DIVE_SUM else "sonar"


def officers(P: dict, pos, fuel: int, base=world.BASE, router=None) -> dict:
    """What each officer says this turn (numbers only — the frontend turns them into words).
    router(a, b) -> AStarResult: Lev's A*; in the storm of act II it prices storm cells (default: plain route)."""
    pos, base = tuple(pos), tuple(base)
    router = router or route
    target = bayes.argmax(P, near=pos)
    tool = tool_for(P, target)
    vera = {"target": list(target), "p": P[target], "sum3": bayes.sum_around(P, target), "tool": tool}

    r = router(pos, target)
    w = r.cost if r.cost is not None else r.moves      # = moves unless storm cells cost more
    lev = {"target": list(target), "path": [list(c) for c in r.path], "cells": r.moves,
           "hours": w * world.MOVE_HOURS, "fuel": w * world.MOVE_FUEL,
           "expanded": r.expanded, "here": r.moves == 0}

    d = mdp.decide(fuel)
    grisha = {"fuel": fuel, "state": d.state, "q": d.q, "action": d.action,
              "threshold": mdp.FUEL_THRESHOLD}

    if d.action == mdp.RETURN and pos != base:
        action = {"type": "home"}
        kind = "home"
    else:
        action = {"type": "go", "target": list(target), "tool": tool}
        kind = f"{tool}_here" if pos == target else f"go_{tool}"
    return {"vera": vera, "lev": lev, "grisha": grisha, "advice": {"action": action, "kind": kind}}


def par(seed: int, signal, box, runs: int = PAR_RUNS) -> dict:
    """Median mission hours the AI crew alone (no rival, always taking its own advice)
    needs to find the box on this map. Runs that fail count as 'never'."""
    from core.game import Game  # local import: game.py imports this module

    hours = []
    for i in range(runs):
        g = Game(seed=seed * 1000 + i, signal=signal, box=box, rival=False, compute_par=False)
        g.autoplay(max_actions=200)
        hours.append(g.hours if g.status == "won" else float("inf"))
    med = statistics.median(hours)
    return {"runs": runs, "found": sum(h != float("inf") for h in hours),
            "hours": None if med == float("inf") else med}
