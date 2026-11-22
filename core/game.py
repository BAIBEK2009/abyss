"""One mission: state, actions on the shared clock, events, radio clues, journal (CLAUDE.md v3).

A turn is ONE action:
    {"type": "go", "target": [x, y], "tool": "sonar" | "dive" | None}   sail by A*, then use the tool
    {"type": "home"}                                                   sail to base and refuel
While the hours of the player's action run, the rival "Poseidon-2" works through its own task
queue on the same clock. If it finishes a successful dive BEFORE the player's result, the player
loses and does not get that result (ties go to the player).

Every action returns timestamped EVENTS for the frontend, e.g.
    {"type": "move", "t": 3, "cell": [1, 9]}
    {"type": "sonar", "t": 5, "cell": [4, 4], "echo": true}
    {"type": "move", "rival": true, "t": 4.5, "cell": [8, 9]}
    {"type": "msg", "key": "sonar_echo", "cell": "E5"}
The server never sends ready-made phrases — only message keys and numbers.

A LIVE dive (CLAUDE.md v3.1, 19): act(action, live=True) with the "dive" tool stops at the dive
and reports what lies on that seabed ({"box", "debris"}); the player searches it in first person and
then calls dive_end(found, coverage, debris_seen). Not found: Vera recalculates by the share of the
seabed seen, P' = P (1 - 0.97 c) / (1 - P 0.97 c). The autopilot, par and balance use the camera
model (live=False), which is the same search with c = 1.
"""
from __future__ import annotations
import random
from dataclasses import dataclass

from core import agent, bayes, clues, mdp, storm, world
from core.astar import astar
from core.campaign import HIGH_HILL, Campaign
from core.agent import route
from core.rival import Rival


def _pct(p: float):
    """Percent for a message: one decimal below 10 % (0.4), whole above (23)."""
    v = p * 100
    return round(v, 1) if v < 10 else round(v)


class GameError(Exception):
    """An action that is not allowed right now. `key` is a message key for the UI."""

    def __init__(self, key: str, **params):
        super().__init__(key)
        self.key = key
        self.params = params


# Demo map (CLAUDE.md 5.9): the autopilot wins in 5 actions and shows silence, echo, debris,
# "nothing" and the box along the way. (The spec's 2012 relied on another RNG layout; 272 is the
# first seed that gives this exact story with ours — found by searching, see the M4 report.)
DEMO_SEED = 272

# scene events the browser may report to the campaign (everything else the core sees itself)
STORY_EVENTS = {"radio_heard", "binoculars", "enter_cabin", "sit_at_table", "first_dive_ready",
                "dive:start", "dive:first_debris", "dive:signal_stronger", "dive:off_course"}
# a saved game is its seed + the log of the captain's calls, replayed (B7); a different version is dropped
SAVE_VERSION = 3
CVR_HOURS = 30          # act III: the voice recorder's damaged battery (17.6)
FAKE_BOX = (99, 99)     # what the rival searches for before act III / after the box is gone: nothing to find


@dataclass
class Step:
    """One point on the player's timeline inside an action."""
    t: float
    kind: str           # move | sonar | dive | refuel
    cell: tuple


def _to_cell(cell):
    """'G4' or [6, 3] -> (6, 3); anything else -> None."""
    try:
        if isinstance(cell, str):
            return world.parse_cell(cell)
        x, y = cell
        if isinstance(x, int) and isinstance(y, int):
            return (x, y)
    except (ValueError, TypeError, IndexError):
        pass
    return None


class Game:
    def __init__(self, seed: int | None = None, lang: str = "ru", *, signal=None, box=None,
                 rival: bool = True, compute_par: bool = True, campaign: bool = False, demo: bool = False):
        self.seed = seed if seed is not None else random.SystemRandom().randrange(1_000_000)
        self.lang = lang
        # separate random streams: the same seed always gives the same map, sensors and rival
        rng_world = random.Random(f"{self.seed}:world")
        self.rng = random.Random(f"{self.seed}:player")
        rng_clues = random.Random(f"{self.seed}:clues")

        self.signal = tuple(signal) if signal is not None else (
            round(rng_world.uniform(*world.SIGNAL_X), 2), round(rng_world.uniform(*world.SIGNAL_Y), 2))
        self.P = world.prior(self.signal)
        self.box = tuple(box) if box is not None else self._sample(rng_world, self.P)

        self.pos = world.BASE
        self.fuel = world.START_FUEL
        self.hours = 0.0
        self.status = "playing"      # playing | won | lost
        self.reason = None           # rival | beacon (when lost)
        self.probes = []             # our sonar / dive results: {"cell", "kind", "result", "t"}
        self.counts = {"sonar": 0, "dive": 0, "tow": 0, "home": 0, "actions": 0}
        self.feed = []               # journal "records": {"t", "key", ...}
        self.turns = []              # journal "calculations", one per action
        self.beacon_warned = False
        self.pending_dive = None      # a live dive waiting for its result from the player
        self._live = False

        self.clues = [dict(c, state="future") for c in clues.make_clues(rng_clues, self.signal, self.box)]
        # the story campaign (CLAUDE.md 17, 22): acts, checklist, beats; "Poseidon-2" arrives at the end of act I
        self.campaign = Campaign() if campaign or demo else None
        # "Demo for the defence" (B6): seed 272, every story dive finds its find, acts can be skipped
        self.demo = bool(demo)
        self.log = []                # the captain's calls, for the save (B7)
        # act II: the storm front starts with the act; the decoy buoy (one per act)
        self.storm_t0 = None
        self.decoy = None            # None | "ready" | [x, y] (dropped)
        # act III: two recorders — the data (FDR, self.box, belief self.P) and the voice (CVR, self.P2)
        self.P2 = None
        self.cvr = None
        self.cvr_deadline = None
        self.boxes = None            # {"fdr": None | "us" | "rival" | "dead", "cvr": ...}
        self.focus = "fdr"           # which map the officers and the chart work on
        self.rival_done = False      # the rival lifted its box and left
        self._story = []             # story items for the browser since the last response
        self._rival_wanted = rival
        self._rival_rng = random.Random(f"{self.seed}:rival")
        if self.campaign:
            for c in self.clues:
                c["hour"] = self.campaign.clue_hour({"fish": "fishermen_direction", "coast": "coastguard_band"}[c["kind"]], c["hour"])
        self.rival = Rival(self.P, self._rival_rng) if rival and not self.campaign else None
        self.par = agent.par(self.seed, self.signal, self.box) if compute_par else None

    @staticmethod
    def _sample(rng, P):
        r, acc = rng.random(), 0.0
        for c in world.all_cells():
            acc += P[c]
            if r < acc:
                return c
        return max(P, key=P.get)

    # ------------------------------------------------------------------ the storm (act II) and the two maps (act III)
    def _storm_on(self) -> bool:
        return self.campaign is not None and self.campaign.act == "act2" and self.storm_t0 is not None

    def _storm_cells(self, t=None) -> set:
        if not self._storm_on():
            return set()
        return storm.cells((self.hours if t is None else t) - self.storm_t0)

    def _route(self, a, b):
        """Lev's A*: storm cells cost storm.COST (hours and fuel), so the route goes round them."""
        sc = self._storm_cells()
        if not sc:
            return route(a, b)
        return astar(a, b, world.is_free, world.SIZE, world.SIZE, cost=lambda c: storm.COST if c in sc else 1)

    @property
    def PF(self) -> dict:
        """The map the captain works on: in act III the chosen recorder's, otherwise the one map."""
        return self.P2 if (self.P2 is not None and self.focus == "cvr") else self.P

    def _targets(self) -> list:
        """What is still on the seabed to be found: [(kind, cell)]."""
        if self.boxes is None:
            return [("fdr", self.box)]
        return [(k, self.box if k == "fdr" else self.cvr) for k in ("fdr", "cvr") if self.boxes[k] is None]

    def _rival_box(self):
        if not self.campaign:
            return self.box
        if self.campaign.act not in ("act3",) or (self.boxes and self.boxes["fdr"] is not None):
            return FAKE_BOX
        return self.box

    # ------------------------------------------------------------------ parsing / planning
    def _parse(self, action) -> tuple[str, tuple | None, str | None]:
        if not isinstance(action, dict) or action.get("type") not in ("go", "home"):
            raise GameError("bad_action")
        if action["type"] == "home":
            return "home", world.BASE, None
        target = _to_cell(action.get("target"))
        tool = action.get("tool")
        if target is None or not world.in_bounds(target):
            raise GameError("bad_target")
        if target in world.REEFS:
            raise GameError("reef", cell=world.cell_name(target))
        if tool not in ("sonar", "dive", None):
            raise GameError("bad_tool")
        if tool is None and target == self.pos:
            raise GameError("here")
        return "go", target, tool

    def _timeline(self, kind, target, tool):
        """The player's steps with mission hours, plus total hours and fuel of the action."""
        path = self._route(self.pos, target).path
        sc = self._storm_cells()
        steps, t, fuel = [], self.hours, 0
        for cell in path[1:]:
            k = storm.COST if cell in sc else 1
            t += world.MOVE_HOURS * k
            if kind == "go":
                fuel += world.MOVE_FUEL * k
            steps.append(Step(t, "move", cell))
        if kind == "home":
            t += world.REFUEL_HOURS
            steps.append(Step(t, "refuel", target))
        elif tool == "sonar":
            t += world.SONAR_HOURS
            fuel += world.SONAR_FUEL
            steps.append(Step(t, "sonar", target))
        elif tool == "dive":
            t += world.DIVE_HOURS
            fuel += world.DIVE_FUEL
            steps.append(Step(t, "dive", target))
        return path, steps, t - self.hours, fuel

    # ------------------------------------------------------------------ preview (changes NOTHING)
    def preview(self, action) -> dict:
        if self.status != "playing":
            raise GameError("game_over")
        if self.pending_dive:
            raise GameError("dive_pending")
        if self.campaign and self.campaign.act == "act4":
            raise GameError("story_scene")           # act IV is the deck at dawn: no more moves on the chart
        kind, target, tool = self._parse(action)
        if kind == "home" and self.pos == world.BASE:
            raise GameError("at_base")
        path, _steps, hours, fuel = self._timeline(kind, target, tool)
        fuel_after = world.START_FUEL if kind == "home" else self.fuel - fuel
        out = {"action": {"type": kind, "target": list(target), "tool": tool},
               "hours": hours, "fuel": fuel, "fuel_after": fuel_after,
               "path": [list(c) for c in path], "cells": len(path) - 1, "chance": None,
               "p": self.PF[target], "risky": [], "empty": self._seen_empty(target)}
        sc = self._storm_cells()
        if tool == "sonar":
            out["chance"] = {"echo": 0.0 if target in sc else bayes.echo_chance(self.PF, target)}
            if target in sc:
                out["risky"].append("storm_sonar")
        elif tool == "dive":
            out["chance"] = {"find": bayes.find_chance(self.PF, target)}
        if sc and any(tuple(c) in sc for c in path[1:]):
            out["risky"].append("storm_route")
        if kind == "go":
            rb = self._route(target, world.BASE)
            back = (rb.cost if rb.cost is not None else rb.moves) * world.MOVE_FUEL
            if fuel_after <= 0:
                out["risky"].append("tow")
            elif fuel_after < back:
                out["risky"].append("low_fuel_back")
        if self.hours + hours >= world.BEACON_HOURS:
            out["risky"].append("beacon")
        out["rival"] = self.rival.forecast(hours) if self.rival and not self.rival_done else None
        return out

    def _seen_empty(self, cell) -> bool:
        return any(p["kind"] == "dive" and p["result"] == "nothing" and p["cell"] == list(cell)
                   for p in self.probes)

    # ------------------------------------------------------------------ actions
    def act(self, action, live: bool = False) -> list:
        """Perform one action on the shared clock. Returns events. Raises GameError if not allowed.
        live=True: a dive stops at the seabed and waits for dive_end() (the first-person search)."""
        self.preview(action)                         # all validation in one place
        self._live = bool(live)
        kind, target, tool = self._parse(action)
        self.log.append(["act", action, bool(live)])
        start, fuel0 = self.hours, self.fuel
        advice = self.advice()
        path, steps, hours, fuel = self._timeline(kind, target, tool)
        if self._storm_on() and kind == "go":           # Lev went round the storm (act II task)
            sc, plain = self._storm_cells(), route(self.pos, target).path or []
            if any(c in sc for c in plain[1:]) and not any(c in sc for c in path[1:]):
                self._story_event("storm_detour")
        events = []
        record = {"t0": start, "action": {"type": kind, "target": list(target), "tool": tool},
                  "pos": list(self.pos), "fuel": fuel0,
                  "mdp": advice["grisha"], "bayes": None, "rival": None,
                  "astar": {"start": list(self.pos), "goal": list(target), "path": [list(c) for c in path],
                            "moves": len(path) - 1, "expanded": self._route(self.pos, target).expanded}}
        self.counts["actions"] += 1
        if kind == "home":
            self.counts["home"] += 1

        for step in steps:
            # the clock runs: clues that arrive and rival tasks that finish before this step
            events += self._run_world_until(step.t, strict=True)
            if self.status != "playing":
                break
            if step.t > world.BEACON_HOURS:
                events += self._run_world_until(world.BEACON_HOURS)
                self._lose("beacon", world.BEACON_HOURS, events)
                break
            self.hours = step.t
            events += self._do_step(step, record)
            if self.status != "playing":
                break
            events += self._run_world_until(step.t)
            if self.status != "playing":
                break

        if self.status == "playing":
            self.fuel = world.START_FUEL if kind == "home" else fuel0 - fuel
            events.append({"type": "fuel", "t": self.hours, "value": self.fuel})
            if self.fuel <= 0:
                events += self._tow()
        if self.status == "playing" and self.hours >= world.BEACON_HOURS:
            self._lose("beacon", world.BEACON_HOURS, events)
        if self.status == "playing" and not self.beacon_warned and world.BEACON_HOURS - self.hours < 30:
            self.beacon_warned = True
            events.append({"type": "msg", "t": self.hours, "key": "beacon_low",
                           "h": int(world.BEACON_HOURS - self.hours)})

        self._after_story()
        record["t1"] = self.hours
        record["rival"] = self.rival.plan_info() if self.rival and not self.rival_done and self.status == "playing" else None
        self.turns.append(record)
        if self.status != "playing":
            self.pending_dive = None                 # the rival or the beacon ended it first
            events.append(self._end_event())
        self._live = False
        return events

    def _end_event(self) -> dict:
        return {"type": "end", "t": self.hours, "status": self.status, "reason": self.reason,
                "box": list(self.box), "stars": self.stars()}

    def _do_step(self, step: Step, record) -> list:
        cell, t = step.cell, step.t
        name = world.cell_name(cell)
        if step.kind == "move":
            self.pos = cell
            return [{"type": "move", "t": t, "cell": list(cell)}]
        if step.kind == "refuel":
            self.pos = cell
            self._story_event("refuel")
            return [{"type": "refuel", "t": t, "value": world.START_FUEL},
                    {"type": "msg", "t": t, "key": "refuel"}]
        best_before = bayes.argmax(self.P, near=cell)
        if step.kind == "sonar":
            self.counts["sonar"] += 1
            r = self.rng.random()
            if cell in self._storm_cells(t):            # act II: the waves drown the echo — no information
                self.probes.append({"cell": list(cell), "kind": "sonar", "result": "storm", "t": t})
                self.feed.append({"t": t, "key": "feed_sonar", "cell": name, "result": "storm"})
                return [{"type": "sonar", "t": t, "cell": list(cell), "echo": False, "storm": True},
                        {"type": "msg", "t": t, "key": "sonar_storm", "cell": name}]
            before = self.P
            if self.boxes is not None:                  # act III: two pingers on two frequencies, one answer each
                live = dict(self._targets())
                echo_f = r < world.p_echo(cell, live["fdr"]) if "fdr" in live else False
                echo_c = self.rng.random() < world.p_echo(cell, live["cvr"]) if "cvr" in live else False
                if "fdr" in live:
                    self.P, Z = bayes.sonar(self.P, cell, echo_f)
                else:
                    Z = 1.0
                if "cvr" in live:
                    self.P2, _ = bayes.sonar(self.P2, cell, echo_c)
                echo = echo_c if self.focus == "cvr" else echo_f
            else:
                echo = r < world.p_echo(cell, self.box)
                self.P, Z = bayes.sonar(self.P, cell, echo)
            self.probes.append({"cell": list(cell), "kind": "sonar", "result": "echo" if echo else "silence", "t": t})
            record["bayes"] = self._bayes_record("sonar", cell, "echo" if echo else "silence", before, Z, best_before)
            self.feed.append({"t": t, "key": "feed_sonar", "cell": name, "result": "echo" if echo else "silence"})
            self._story_event("sonar")
            self._story_event("first_sonar_echo" if echo else "first_sonar_silence", once=True)
            return [{"type": "sonar", "t": t, "cell": list(cell), "echo": echo},
                    {"type": "belief", "t": t, "P": self.belief_rows()},
                    {"type": "msg", "t": t, "key": "sonar_echo" if echo else "sonar_silence", "cell": name}]
        # dive
        self.counts["dive"] += 1
        outcome = self._camera(cell)                 # the same random draw in both modes: seeds stay stable
        find, hidden = self._story_find(cell)
        kind = self._box_at(cell)
        if self._live:
            here = kind is not None and not hidden
            self.pending_dive = {"cell": cell, "t": t, "box": here, "debris": (not here) and outcome == "debris",
                                 "find": find, "hidden": hidden, "record": record, "kind": kind}
            return [{"type": "dive", "t": t, "cell": list(cell), "live": True, "scene": self._scene()}]
        if hidden:                                   # act I: the dive looks at the wreckage, the box stays unseen
            outcome = "debris" if find else "nothing"
            self.probes.append({"cell": list(cell), "kind": "dive", "result": outcome, "t": t})
            self.feed.append({"t": t, "key": "feed_dive", "cell": name, "result": outcome})
            if find:
                self._story_event(f"find:{find}")
            else:
                self._story_event("dive_empty")
            record["bayes"] = {"kind": "dive", "cell": list(cell), "result": "story", "prior": self.P[cell]}
            return [{"type": "dive", "t": t, "cell": list(cell), "result": outcome}]
        self.probes.append({"cell": list(cell), "kind": "dive", "result": outcome, "t": t})
        self.feed.append({"t": t, "key": "feed_dive", "cell": name, "result": outcome})
        events = [{"type": "dive", "t": t, "cell": list(cell), "result": outcome}]
        before = self.P
        if self.boxes is not None:                       # act III (the autopilot's camera): which recorder?
            if kind is not None and outcome == "box" or (self.demo and kind is not None):
                events[0]["result"] = "box"; events[0]["kind"] = kind
                record["bayes"] = {"kind": "dive", "cell": list(cell), "result": "box", "prior": before[cell]}
                self._resolve(kind, "us")
                return events
            if outcome == "box":
                outcome = "debris"
        elif outcome == "box":
            self.status = "won"
            record["bayes"] = {"kind": "dive", "cell": list(cell), "result": "box", "prior": before[cell]}
            return events
        self.P, Z = bayes.camera(self.P, cell, outcome)
        if self.P2 is not None:
            self.P2, _ = bayes.camera(self.P2, cell, outcome)
        record["bayes"] = self._bayes_record("dive", cell, outcome, before, Z, best_before)
        events += [{"type": "belief", "t": t, "P": self.belief_rows()},
                   {"type": "msg", "t": t, "key": "dive_debris" if outcome == "debris" else "dive_empty", "cell": name}]
        return events

    def _bayes_record(self, kind, cell, result, before, Z, best_before):
        best = bayes.argmax(self.P, near=cell)
        if kind == "sonar":
            echo = result == "echo"
            L = {"inside": bayes.sonar_likelihood(cell, cell, echo),
                 "outside": bayes.sonar_likelihood((cell[0] + 5, cell[1] + 5), cell, echo)}
        else:
            L = {f"d{d}": world.CAMERA[d][result] for d in (0, 1, 2)}
        return {"kind": kind, "cell": list(cell), "result": result, "L": L, "Z": Z,
                "prior": before[cell], "posterior": self.P[cell],
                "best": list(best), "best_prior": before[best], "best_posterior": self.P[best],
                "best_L": (bayes.sonar_likelihood(best, cell, result == "echo") if kind == "sonar"
                           else bayes.camera_likelihood(best, cell, result))}

    def dive_end(self, found: bool, coverage: float, debris_seen: bool = False, find: str | None = None) -> list:
        """The player surfaced from a live dive: with the box, or having seen `coverage` of the seabed.
        find = the story find picked up on this dive (act I: "act1_dive_flap")."""
        d = self.pending_dive
        if d is None:
            raise GameError("no_dive")
        self.log.append(["dive", bool(found), float(coverage or 0), bool(debris_seen), find])
        self.pending_dive = None
        cell, t, name = d["cell"], d["t"], world.cell_name(d["cell"])
        c = min(1.0, max(0.0, float(coverage or 0)))
        before = self.P
        if self.campaign and d.get("find") and find == d["find"]:
            self._story_event(f"find:{find}")
        elif self.campaign and self.campaign.act in ("act1", "act2"):
            self._story_event("dive_empty")
        if d.get("hidden"):
            # act I (17.4): the box is not part of this dive's story, so its belief is left as it is here
            result = "debris" if (find and find == d.get("find")) else "nothing"
            self.probes.append({"cell": list(cell), "kind": "dive", "result": result, "t": t, "coverage": round(c, 3)})
            self.feed.append({"t": t, "key": "feed_dive", "cell": name, "result": result, "coverage": round(c, 3)})
            d["record"]["bayes"] = {"kind": "dive", "cell": list(cell), "result": "story", "prior": before[cell]}
            self._after_story()
            return [{"type": "dive", "t": t, "cell": list(cell), "result": result, "coverage": round(c, 3)}]
        if found and d["box"] and d.get("kind") and self.boxes is not None:     # act III: a recorder on board
            self.probes.append({"cell": list(cell), "kind": "dive", "result": "box", "t": t})
            self.feed.append({"t": t, "key": "feed_dive", "cell": name, "result": "box"})
            d["record"]["bayes"] = {"kind": "dive", "cell": list(cell), "result": "box", "prior": before[cell]}
            self._resolve(d["kind"], "us")
            self._after_story()
            return [{"type": "dive", "t": t, "cell": list(cell), "result": "box", "kind": d["kind"]},
                    {"type": "belief", "t": t, "P": self.belief_rows()}]
        if found and d["box"]:
            self.status = "won"
            self.probes.append({"cell": list(cell), "kind": "dive", "result": "box", "t": t})
            self.feed.append({"t": t, "key": "feed_dive", "cell": name, "result": "box"})
            d["record"]["bayes"] = {"kind": "dive", "cell": list(cell), "result": "box", "prior": before[cell]}
            return [{"type": "dive", "t": t, "cell": list(cell), "result": "box"}, self._end_event()]
        result = "debris" if (debris_seen and d["debris"]) else "nothing"
        best_before = bayes.argmax(self.P, near=cell)
        if result == "debris":
            self.P, Z = bayes.camera(self.P, cell, "debris")
            if self.P2 is not None:
                self.P2, _ = bayes.camera(self.P2, cell, "debris")
        else:                                        # Vera: "we saw a share c of this seabed and no box"
            L = {k: (1 - world.CAMERA[0]["box"] * c if k == cell else 1.0) for k in world.all_cells()}
            self.P, Z = bayes.update(self.P, L)
            if self.P2 is not None:
                self.P2, _ = bayes.update(self.P2, L)
        self.probes.append({"cell": list(cell), "kind": "dive", "result": result, "t": t, "coverage": round(c, 3)})
        self.feed.append({"t": t, "key": "feed_dive", "cell": name, "result": result, "coverage": round(c, 3)})
        rec = self._bayes_record("dive", cell, result, before, Z, best_before)
        rec["coverage"] = round(c, 3)
        d["record"]["bayes"] = rec
        self._after_story()
        return [{"type": "dive", "t": t, "cell": list(cell), "result": result, "coverage": round(c, 3)},
                {"type": "belief", "t": t, "P": self.belief_rows()},
                {"type": "msg", "t": t, "key": "dive_debris" if result == "debris" else "dive_seen", "cell": name,
                 "c": round(c * 100), "p0": _pct(before[cell]), "p1": _pct(self.P[cell])}]

    # ------------------------------------------------------------------ act III: the two recorders
    def _box_at(self, cell):
        """Which recorder lies in this cell (act III), or the one box of the free search / acts I-II."""
        if self.boxes is None:
            return "fdr" if cell == self.box else None
        for k, c in self._targets():
            if c == cell:
                return k
        if self.demo:                                # the demo: one dive per recorder, wherever the captain dives
            return self.focus if self.boxes.get(self.focus) is None else (self._targets() or [(None,)])[0][0]
        return None

    def _resolve(self, kind: str, by: str):
        """A recorder is settled: on our deck ("us"), on the rival's ("rival") or silent for ever ("dead")."""
        if self.boxes is None or self.boxes[kind] is not None:
            return
        self.boxes[kind] = by
        self.feed.append({"t": self.hours, "key": f"feed_box_{by}", "kind": kind})
        if by == "us":
            self._story_event(f"find:act3_{kind}")
            if 6 not in self.campaign.mystery:       # the tail section beside it: the maintenance folder
                self._story_event("find:act3_maintenance")
        elif by == "rival":
            self._story_event("rival_got_box")
        left = [k for k, v in self.boxes.items() if v is None]
        if not left:
            self._story_event("both_boxes_resolved")
        else:
            self.focus = left[0]
            if by == "us" and "a3_6" not in self.campaign.fired:
                self._story += self.campaign.fire("a3_6")   # the families, before the last dive

    def _act3_setup(self):
        """Entering act III: the voice recorder lies near the data recorder (manhattan 1-2), its own map."""
        rng = random.Random(f"{self.seed}:cvr")
        near = [c for c in world.all_cells() if world.is_free(c) and 1 <= world.manhattan(c, self.box) <= 2]
        self.cvr = rng.choice(sorted(near))
        # the tail tells where the recorders went (17.6: "the mounts are torn off — the boxes are near"): soft
        # evidence, true to the seabed — near the two recorders x0.8, elsewhere x0.25 — one Bayes update
        near = lambda b: {c: (0.8 if world.manhattan(c, b) <= 2 else 0.25) for c in world.all_cells()}
        base = dict(self.P)
        self.P, _ = bayes.update(base, near(self.box))
        self.P2, _ = bayes.update(base, near(self.cvr))
        self.cvr_deadline = self.hours + CVR_HOURS
        self.boxes = {"fdr": None, "cvr": None}
        self.focus = "fdr"

    # ------------------------------------------------------------------ choices, the decoy, the demo's skip
    def choose(self, key: str, option: str) -> list:
        """Act III: which recorder first; act IV: who gets the recording (-> the ending)."""
        if not self.campaign or key not in ("act3", "act4"):
            raise GameError("bad_choice")
        opts = {"act3": ("cvr_first", "fdr_first"), "act4": ("investigators", "public", "sell")}[key]
        if option not in opts or self.campaign.act != key:
            raise GameError("bad_choice")
        self.log.append(["choice", key, option])
        self._story += self.campaign.choose(key, option)
        if key == "act3" and self.boxes is not None:
            self.focus = "cvr" if option == "cvr_first" else "fdr"
        if key == "act4":
            self.status = "ended"
        self._after_story()
        return self.pop_story()

    def set_focus(self, kind: str) -> None:
        """Act III: the "Data / Voice" switch over the tracing paper — which recorder the officers work for."""
        if self.boxes is None or kind not in self.boxes or self.boxes[kind] is not None:
            raise GameError("bad_focus")
        self.log.append(["focus", kind])
        self.focus = kind

    def drop_decoy(self) -> list:
        """Act II: a decoy buoy pings like a black box at the ship's position; the rival's Bayes believes it."""
        if not (self.campaign and self.campaign.act == "act2" and self.decoy == "ready" and self.rival and self.status == "playing"):
            raise GameError("no_decoy")
        if self.pending_dive:
            raise GameError("dive_pending")
        self.log.append(["decoy"])
        t = self.hours + 1
        events = self._run_world_until(t)
        if self.status != "playing":
            return events
        self.hours = t
        self.rival.decoy(self.pos, t)
        self.decoy = list(self.pos)
        self.feed.append({"t": t, "key": "feed_decoy", "cell": world.cell_name(self.pos)})
        events.append({"type": "decoy", "t": t, "cell": list(self.pos)})
        self._story_event("decoy_used")
        self._after_story()
        return events

    def skip_act(self) -> list:
        """The demo's "skip to the next act" (B6): the act's finds are made, its story plays on fast."""
        if not (self.campaign and self.demo):
            raise GameError("no_demo")
        self.log.append(["skip"])
        act = self.campaign.act
        if act == "prologue":
            for ev in ("start", "radio_heard", "binoculars", "enter_cabin", "sit_at_table"):
                self._story += self.campaign.start() if ev == "start" else self.campaign.event(ev)
        elif act == "act1":
            self._story_event("find:act1_dive_flap")
        elif act == "act2":
            self._story_event("find:act2_dive_tail")
        elif act == "act3":
            if not self.campaign.choices.get("act3"):
                self._story += self.campaign.choose("act3", "fdr_first")
            for k in ("fdr", "cvr"):
                self._resolve(k, "us")
        self.hours = min(world.BEACON_HOURS - 1, self.hours + 4)
        self._after_story()
        return self.pop_story()

    @classmethod
    def replay(cls, save: dict) -> "Game":
        """A saved game: the same seed and the same calls give the same game (every random stream is seeded)."""
        if not isinstance(save, dict) or save.get("v") != SAVE_VERSION or not isinstance(save.get("log"), list):
            raise GameError("bad_save")
        g = cls(seed=save.get("seed"), lang=save.get("lang", "ru"), campaign=True, demo=bool(save.get("demo")), compute_par=False)
        g.par = agent.par(g.seed, g.signal, g.box) if not g.campaign else None
        for item in save["log"]:
            kind, args = item[0], item[1:]
            if kind == "act":
                g.act(args[0], live=args[1])
            elif kind == "dive":
                g.dive_end(*args)
            elif kind == "clue":
                g.clue(*args)
            elif kind == "story":
                g.story_event(args[0])
            elif kind == "choice":
                g.choose(*args)
            elif kind == "decoy":
                g.drop_decoy()
            elif kind == "focus":
                g.set_focus(args[0])
            elif kind == "skip":
                g.skip_act()
        g.pop_story()
        return g

    # ------------------------------------------------------------------ the story campaign
    def _story_event(self, name: str, once: bool = False):
        if not self.campaign or (once and not self.campaign.first(name)):
            return
        self._story += self.campaign.event(name)

    def _story_find(self, cell):
        """Act I (17.4): a dive where the hill is highest finds the flap with the flight number; the box is not
        part of act I, so the dive never shows it. Returns (story find or None, box hidden?)."""
        if not self.campaign or self.campaign.act not in ("act1", "act2"):
            return None, False
        top = max(self.P.values())
        high = self.P[cell] >= HIGH_HILL * top or self.demo
        if self.campaign.act == "act1":
            if high:
                self._story_event("dive_high")
            return ("act1_dive_flap" if high and 1 not in self.campaign.mystery else None), True
        # act II (17.5): the tail lies where the hill is highest after the coastguard's drift strip
        return ("act2_dive_tail" if high and 2 not in self.campaign.mystery else None), True

    def _scene(self) -> dict:
        d = self.pending_dive
        return {"box": d["box"], "debris": d["debris"], "find": d.get("find"), "kind": d.get("kind") if d["box"] else None}

    def _after_story(self):
        """After a turn: "hour>=N" beats, and "Poseidon-2" comes into the square once act I is over."""
        if not self.campaign or self.status != "playing":
            return
        self._story += self.campaign.hour(self.hours)
        act = self.campaign.act
        if act == "act2":
            if self.storm_t0 is None:
                self.storm_t0 = self.hours
            elif storm.passed(self.hours - self.storm_t0):
                self._story_event("storm_detour")       # the front has gone by: the task is done
            if self.fuel < mdp.FUEL_THRESHOLD:
                self._story_event("fuel_low", once=True)
            if self.rival and self.decoy is None and self.rival.plan and self.rival.plan["tool"] == "dive":
                self.decoy = "ready"                    # Dana: "their Bayes trusts an echo like ours" -> the decoy
                self._story_event("rival_dives_near", once=True)
        if act == "act3" and self.boxes is None:
            self._act3_setup()
        if act == "act3" and self.boxes and self.boxes["cvr"] is None and self.hours >= self.cvr_deadline:
            self._resolve("cvr", "dead")
            self._story.append({"msg": "cvr_dead"})
        if self.campaign.act == "act4" and self.boxes is not None and "us" not in self.boxes.values():
            self.campaign.ending = "lost"               # nothing on our deck: "Too late"
            self.status = "ended"
            return
        if self.campaign.rival_active and self.rival is None and self._rival_wanted:
            P = world.prior(self.signal)
            for c in self.clues:                     # it heard the same radio on its way here
                if c["state"] != "future":
                    P, _ = bayes.update(P, clues.likelihoods(c, P, self.signal))
            self.rival = Rival(P, self._rival_rng, now=self.hours)
            self._story.append({"rival_arrives": True})

    def story_event(self, name: str) -> list:
        """A scene event from the browser (entering the cabin, sitting at the table, inside the dive)."""
        if not self.campaign:
            raise GameError("no_campaign")
        self.log.append(["story", name])
        if name == "start":
            self._story += self.campaign.start()
        elif name in STORY_EVENTS:
            self._story += self.campaign.event(name)
        else:
            raise GameError("bad_event")
        self._after_story()
        return self.pop_story()

    def pop_story(self) -> list:
        out, self._story = self._story, []
        return out

    def _camera(self, cell) -> str:
        r, acc = self.rng.random(), 0.0
        box = self.box
        if self.boxes is not None and self._targets():   # act III: the camera sees whichever recorder is nearer
            box = min(self._targets(), key=lambda kc: world.manhattan(kc[1], cell))[1]
        for outcome, p in world.camera_probs(cell, box).items():
            acc += p
            if r < acc:
                return outcome
        return "nothing"

    def _run_world_until(self, t: float, strict: bool = False) -> list:
        """Radio clues that arrive and rival tasks that finish up to mission hour t (in time order)."""
        events = []
        for clue in self.clues:
            if clue["state"] == "future" and (clue["hour"] < t or (not strict and clue["hour"] <= t)):
                if self.rival:
                    events += self._rival_until(clue["hour"], strict=False)
                    if self.status != "playing":
                        return events
                clue["state"] = "pending"
                if self.rival:
                    self.rival.apply_clue(clues.likelihoods(clue, self.P, self.signal))
                self.feed.append({"t": clue["hour"], "key": f"feed_clue_{clue['kind']}"})
                events.append({"type": "clue", "t": clue["hour"], **clues.public(clue)})
        if self.rival:
            events += self._rival_until(t, strict)
        return events

    def _rival_until(self, t, strict) -> list:
        if self.rival_done:
            return []
        events = self.rival.advance_to(t, self._rival_box(), strict=strict)
        for ev in events:
            if ev["type"] == "dive" and ev["result"] != "box":
                self.feed.append({"t": ev["t"], "key": "feed_rival_dive", "cell": world.cell_name(ev["cell"])})
                events_msg = {"type": "msg", "t": ev["t"], "key": "rival_dive_empty",
                              "cell": world.cell_name(ev["cell"]), "rival": True}
                ev["msg"] = events_msg
        out = []
        for ev in events:
            msg = ev.pop("msg", None)
            out.append(ev)
            if msg:
                out.append(msg)
        if self.rival.found_at is not None:
            if self.campaign and self.boxes is not None:      # act III: it lifted the data recorder and left
                self.rival_done = True
                self._resolve("fdr", "rival")
                return out
            self.hours = max(self.hours, self.rival.found_at)
            self._lose("rival", self.rival.found_at, out)
        return out

    def _tow(self) -> list:
        """Out of fuel: towed to base, fuel 60, 24 hours lost (the rival keeps working)."""
        self.counts["tow"] += 1
        t_end = self.hours + world.TOW_HOURS
        events = [{"type": "tow", "t": self.hours, "cell": list(world.BASE), "hours": world.TOW_HOURS}]
        self.feed.append({"t": self.hours, "key": "feed_tow"})
        events += self._run_world_until(min(t_end, world.BEACON_HOURS))
        if self.status != "playing":
            return events
        self.pos, self.fuel, self.hours = world.BASE, world.TOW_FUEL, t_end
        events += [{"type": "fuel", "t": self.hours, "value": self.fuel},
                   {"type": "msg", "t": self.hours, "key": "tow"}]
        return events

    def _lose(self, reason, t, events):
        if self.status != "playing":
            return
        if self.campaign and reason == "beacon" and self.boxes and "us" in self.boxes.values():
            for k, v in self.boxes.items():                 # a recorder on board: the story goes on to act IV
                if v is None:
                    self.boxes[k] = "dead"
            self.hours = world.BEACON_HOURS
            self._story += self.campaign.enter("act4")
            return
        if self.campaign:
            self.campaign.ending = "lost"
        self.status, self.reason = "lost", reason
        self.hours = min(max(self.hours, t), world.BEACON_HOURS) if reason == "beacon" else max(self.hours, t)
        self.feed.append({"t": t, "key": f"feed_lost_{reason}"})

    # ------------------------------------------------------------------ radio clues
    def clue(self, clue_id: str, accept: bool) -> list:
        """Apply (Bayes) or reject a pending radio clue."""
        c = next((c for c in self.clues if c["id"] == clue_id), None)
        if c is None or c["state"] != "pending":
            raise GameError("no_clue")
        self.log.append(["clue", clue_id, bool(accept)])
        if not accept:
            c["state"] = "rejected"
            self.feed.append({"t": self.hours, "key": "feed_clue_rejected", "kind": c["kind"]})
            return [{"type": "msg", "t": self.hours, "key": "clue_rejected"}]
        c["state"] = "accepted"
        before = self.P
        L = clues.likelihoods(c, self.P, self.signal)
        self.P, Z = bayes.update(self.P, L)
        best = bayes.argmax(self.P, near=self.pos)
        self.turns.append({"t0": self.hours, "t1": self.hours, "action": {"type": "clue", "id": clue_id},
                           "bayes": {"kind": "clue", "clue": clues.public(c), "Z": Z, "best": list(best),
                                     "best_prior": before[best], "best_L": L[best], "best_posterior": self.P[best]},
                           "astar": None, "mdp": None, "rival": self.rival.plan_info() if self.rival and not self.rival_done else None})
        self.feed.append({"t": self.hours, "key": "feed_clue_accepted", "kind": c["kind"]})
        return [{"type": "belief", "t": self.hours, "P": self.belief_rows()},
                {"type": "msg", "t": self.hours, "key": "clue_applied", "reliability": c["reliability"]}]

    def pending_clues(self) -> list:
        return [clues.public(c) for c in self.clues if c["state"] == "pending"]

    # ------------------------------------------------------------------ autopilot
    def advice(self) -> dict:
        return agent.officers(self.PF, self.pos, self.fuel, router=self._route)

    def autoplay(self, max_actions: int = 200) -> list:
        """The AI crew plays alone: accepts clues, takes its own advice (autopilot / par)."""
        events = []
        for _ in range(max_actions):
            if self.status != "playing":
                break
            for c in self.pending_clues():
                events += self.clue(c["id"], True)
            events += self.act(self.advice()["advice"]["action"])
        return events

    # ------------------------------------------------------------------ results / state
    def stars(self) -> int:
        if self.status != "won":
            return 0
        par = (self.par or {}).get("hours")
        if par is None:
            return 1
        return 3 if self.hours <= par else 2 if self.hours <= par * 1.4 else 1

    def belief_rows(self, P=None):
        P = P or self.PF
        return [[round(P[(x, y)], 6) for x in range(world.SIZE)] for y in range(world.SIZE)]

    def _campaign_state(self) -> dict | None:
        if not self.campaign:
            return None
        st = self.campaign.state()
        st["demo"] = self.demo
        st["decoy"] = self.decoy
        if self._storm_on():
            st["storm"] = storm.public(self.hours - self.storm_t0)
        if self.boxes is not None:
            st["boxes"] = dict(self.boxes)
            st["focus"] = self.focus
            st["cvr_left"] = max(0.0, self.cvr_deadline - self.hours) if self.boxes["cvr"] is None else None
            st["maps"] = {"fdr": self.belief_rows(self.P), "cvr": self.belief_rows(self.P2)}
        return st

    def state(self) -> dict:
        over = self.status != "playing"
        return {
            "seed": self.seed, "lang": self.lang, "size": world.SIZE, "cols": world.COLS,
            "reefs": sorted([list(c) for c in world.REEFS]), "base": list(world.BASE),
            "signal": list(self.signal), "signal_cell": list(world.signal_cell(self.signal)),
            "P": self.belief_rows(),
            "pos": list(self.pos), "fuel": self.fuel, "hours": self.hours,
            "beacon_left": max(0.0, world.BEACON_HOURS - self.hours),
            "probes": self.probes, "counts": self.counts,
            "clues": self.pending_clues(),
            "rival": None if not self.rival else {
                "pos": list(self.rival.pos), "probes": self.rival.probes,
                "plan": self.rival.plan_info() if not over and not self.rival_done else None},
            "advice": self.advice() if not over and not (self.campaign and self.campaign.act == "act4") else None,
            "par": self.par, "status": self.status, "reason": self.reason,
            "box": list(self.box) if over else None,      # secret until the mission ends
            "dive": None if not self.pending_dive else {"cell": list(self.pending_dive["cell"]), "scene": self._scene()},
            "campaign": self._campaign_state(),
            "save": {"v": SAVE_VERSION, "seed": self.seed, "lang": self.lang, "demo": self.demo, "log": self.log} if self.campaign else None,
            "stars": self.stars() if over else None,
            "feed": self.feed,
            "costs": {"move": [world.MOVE_HOURS, world.MOVE_FUEL], "sonar": [world.SONAR_HOURS, world.SONAR_FUEL],
                      "dive": [world.DIVE_HOURS, world.DIVE_FUEL], "refuel_hours": world.REFUEL_HOURS},
        }
