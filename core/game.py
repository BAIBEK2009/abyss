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

from core import agent, bayes, clues, mdp, world
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
                 rival: bool = True, compute_par: bool = True, campaign: bool = False):
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
        self.campaign = Campaign() if campaign else None
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
        path = route(self.pos, target).path
        steps, t, fuel = [], self.hours, 0
        for cell in path[1:]:
            t += world.MOVE_HOURS
            if kind == "go":
                fuel += world.MOVE_FUEL
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
        kind, target, tool = self._parse(action)
        if kind == "home" and self.pos == world.BASE:
            raise GameError("at_base")
        path, _steps, hours, fuel = self._timeline(kind, target, tool)
        fuel_after = world.START_FUEL if kind == "home" else self.fuel - fuel
        out = {"action": {"type": kind, "target": list(target), "tool": tool},
               "hours": hours, "fuel": fuel, "fuel_after": fuel_after,
               "path": [list(c) for c in path], "cells": len(path) - 1, "chance": None,
               "p": self.P[target], "risky": [], "empty": self._seen_empty(target)}
        if tool == "sonar":
            out["chance"] = {"echo": bayes.echo_chance(self.P, target)}
        elif tool == "dive":
            out["chance"] = {"find": bayes.find_chance(self.P, target)}
        if kind == "go":
            back = route(target, world.BASE).moves * world.MOVE_FUEL
            if fuel_after <= 0:
                out["risky"].append("tow")
            elif fuel_after < back:
                out["risky"].append("low_fuel_back")
        if self.hours + hours >= world.BEACON_HOURS:
            out["risky"].append("beacon")
        out["rival"] = self.rival.forecast(hours) if self.rival else None
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
        start, fuel0 = self.hours, self.fuel
        advice = agent.officers(self.P, self.pos, self.fuel)
        path, steps, hours, fuel = self._timeline(kind, target, tool)
        events = []
        record = {"t0": start, "action": {"type": kind, "target": list(target), "tool": tool},
                  "pos": list(self.pos), "fuel": fuel0,
                  "mdp": advice["grisha"], "bayes": None, "rival": None,
                  "astar": {"start": list(self.pos), "goal": list(target), "path": [list(c) for c in path],
                            "moves": len(path) - 1, "expanded": route(self.pos, target).expanded}}
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
        record["rival"] = self.rival.plan_info() if self.rival and self.status == "playing" else None
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
            return [{"type": "refuel", "t": t, "value": world.START_FUEL},
                    {"type": "msg", "t": t, "key": "refuel"}]
        best_before = bayes.argmax(self.P, near=cell)
        if step.kind == "sonar":
            self.counts["sonar"] += 1
            echo = self.rng.random() < world.p_echo(cell, self.box)
            before = self.P
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
        if self._live:
            here = cell == self.box and not hidden
            self.pending_dive = {"cell": cell, "t": t, "box": here, "debris": (not here) and outcome == "debris",
                                 "find": find, "hidden": hidden, "record": record}
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
        if outcome == "box":
            self.status = "won"
            record["bayes"] = {"kind": "dive", "cell": list(cell), "result": "box", "prior": before[cell]}
            return events
        self.P, Z = bayes.camera(self.P, cell, outcome)
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
        self.pending_dive = None
        cell, t, name = d["cell"], d["t"], world.cell_name(d["cell"])
        c = min(1.0, max(0.0, float(coverage or 0)))
        before = self.P
        if self.campaign and d.get("find") and find == d["find"]:
            self._story_event(f"find:{find}")
        elif self.campaign and self.campaign.act == "act1":
            self._story_event("dive_empty")
        if d.get("hidden"):
            # act I (17.4): the box is not part of this dive's story, so its belief is left as it is here
            result = "debris" if (find and find == d.get("find")) else "nothing"
            self.probes.append({"cell": list(cell), "kind": "dive", "result": result, "t": t, "coverage": round(c, 3)})
            self.feed.append({"t": t, "key": "feed_dive", "cell": name, "result": result, "coverage": round(c, 3)})
            d["record"]["bayes"] = {"kind": "dive", "cell": list(cell), "result": "story", "prior": before[cell]}
            self._after_story()
            return [{"type": "dive", "t": t, "cell": list(cell), "result": result, "coverage": round(c, 3)}]
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
        else:                                        # Vera: "we saw a share c of this seabed and no box"
            L = {k: (1 - world.CAMERA[0]["box"] * c if k == cell else 1.0) for k in world.all_cells()}
            self.P, Z = bayes.update(self.P, L)
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

    # ------------------------------------------------------------------ the story campaign
    def _story_event(self, name: str, once: bool = False):
        if not self.campaign or (once and not self.campaign.first(name)):
            return
        self._story += self.campaign.event(name)

    def _story_find(self, cell):
        """Act I (17.4): a dive where the hill is highest finds the flap with the flight number; the box is not
        part of act I, so the dive never shows it. Returns (story find or None, box hidden?)."""
        if not self.campaign or self.campaign.act != "act1":
            return None, False
        top = max(self.P.values())
        high = self.P[cell] >= HIGH_HILL * top
        if high:
            self._story_event("dive_high")
        return ("act1_dive_flap" if high and 1 not in self.campaign.mystery else None), True

    def _scene(self) -> dict:
        d = self.pending_dive
        return {"box": d["box"], "debris": d["debris"], "find": d.get("find")}

    def _after_story(self):
        """After a turn: "hour>=N" beats, and "Poseidon-2" comes into the square once act I is over."""
        if not self.campaign or self.status != "playing":
            return
        self._story += self.campaign.hour(self.hours)
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
        for outcome, p in world.camera_probs(cell, self.box).items():
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
        events = self.rival.advance_to(t, self.box, strict=strict)
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
        self.status, self.reason = "lost", reason
        self.hours = min(max(self.hours, t), world.BEACON_HOURS) if reason == "beacon" else max(self.hours, t)
        self.feed.append({"t": t, "key": f"feed_lost_{reason}"})

    # ------------------------------------------------------------------ radio clues
    def clue(self, clue_id: str, accept: bool) -> list:
        """Apply (Bayes) or reject a pending radio clue."""
        c = next((c for c in self.clues if c["id"] == clue_id), None)
        if c is None or c["state"] != "pending":
            raise GameError("no_clue")
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
                           "astar": None, "mdp": None, "rival": self.rival.plan_info() if self.rival else None})
        self.feed.append({"t": self.hours, "key": "feed_clue_accepted", "kind": c["kind"]})
        return [{"type": "belief", "t": self.hours, "P": self.belief_rows()},
                {"type": "msg", "t": self.hours, "key": "clue_applied", "reliability": c["reliability"]}]

    def pending_clues(self) -> list:
        return [clues.public(c) for c in self.clues if c["state"] == "pending"]

    # ------------------------------------------------------------------ autopilot
    def advice(self) -> dict:
        return agent.officers(self.P, self.pos, self.fuel)

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

    def belief_rows(self):
        return [[round(self.P[(x, y)], 6) for x in range(world.SIZE)] for y in range(world.SIZE)]

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
                "plan": self.rival.plan_info() if not over else None},
            "advice": self.advice() if not over else None,
            "par": self.par, "status": self.status, "reason": self.reason,
            "box": list(self.box) if over else None,      # secret until the mission ends
            "dive": None if not self.pending_dive else {"cell": list(self.pending_dive["cell"]), "scene": self._scene()},
            "campaign": self.campaign.state() if self.campaign else None,
            "stars": self.stars() if over else None,
            "feed": self.feed,
            "costs": {"move": [world.MOVE_HOURS, world.MOVE_FUEL], "sonar": [world.SONAR_HOURS, world.SONAR_FUEL],
                      "dive": [world.DIVE_HOURS, world.DIVE_FUEL], "refuel_hours": world.REFUEL_HOURS},
        }
