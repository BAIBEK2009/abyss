"""The story campaign "Five days" (CLAUDE.md 17, 22): acts, the act checklist, story beats, the mystery.

All TEXTS live in web/data/story.json. This module only decides WHEN a beat fires and which task of the
act's checklist is done; the server sends beat ids, the browser shows the text from story.json.

A beat fires on (story.json → "on"):
    start              the act begins
    after:<beat id>    right after that beat (a chain is returned in one go, in order)
    event:<name>       a game or scene event, e.g. event:enter_cabin, event:first_sonar_echo
    dive:<name>        an event inside the first-person dive, e.g. dive:start, dive:first_debris
    hour>=N            the mission clock reached N hours (radio clues are played by the clue window)

A task of the act's checklist is ticked by an event (TASK_EVENTS below: the tasks themselves are plain
strings in story.json). An act with an "act_end" beat ends when that beat fires; an act without one
ends when all its tasks are done and no beat of it is still waiting in a chain.

M9a plays the prologue and act I; later acts get their beats in M10 (READY_ACTS).
"""
import json
from pathlib import Path

STORY_PATH = Path(__file__).resolve().parent.parent / "web" / "data" / "story.json"

# which event ticks which task of the act's checklist (same order as "tasks" in story.json)
TASK_EVENTS = {
    "prologue": ["radio_heard", "binoculars", "enter_cabin", "sit_at_table"],   # binoculars: a real scene in M12b
    "act1": ["sonar", "dive_high", "find:act1_dive_flap"],
}
READY_ACTS = ("prologue", "act1")

# Act I (17.4): a dive "where the hill is highest" finds the flap. "Highest" = at least this share of
# the highest cell of the current map (the hill top and its upper slope).
HIGH_HILL = 0.6


def load_story(path=STORY_PATH) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


class Campaign:
    def __init__(self, story: dict | None = None, act: str = "prologue"):
        self.story = story or load_story()
        self.acts = [a["id"] for a in self.story["acts"]]
        self.act = act
        self.fired: list[str] = []          # beat ids in the order they fired
        self.tasks: dict[str, list[bool]] = {a["id"]: [False] * len(a.get("tasks", [])) for a in self.story["acts"]}
        self.mystery: list[int] = []        # found slots of "What happened to AQ-271"
        self.events: set[str] = set()       # every event seen (for "first_*" events)
        self.choices: dict[str, str] = {}

    # ------------------------------------------------------------------ helpers
    def _act(self, act_id=None) -> dict:
        act_id = act_id or self.act
        return next(a for a in self.story["acts"] if a["id"] == act_id)

    @property
    def ready(self) -> bool:
        """Does this act already have its beats in the game (M9a: prologue and act I)?"""
        return self.act in READY_ACTS

    @property
    def rival_active(self) -> bool:
        """"Poseidon-2" is still on its way during the prologue and act I; it shows up at the end of act I."""
        return self.acts.index(self.act) >= self.acts.index("act2")

    def first(self, name: str) -> bool:
        """True the first time an event is seen (and remembers it)."""
        if name in self.events:
            return False
        self.events.add(name)
        return True

    # ------------------------------------------------------------------ beats
    def _chain(self, beat: dict, out: list):
        """Fire a beat and everything that follows it with "after:" (an act_end switches the act)."""
        if beat["id"] in self.fired:
            return
        self.fired.append(beat["id"])
        out.append({"beat": beat["id"]})
        if beat.get("type") == "mystery" and beat.get("slot") not in self.mystery:
            self.mystery.append(beat["slot"])
        if beat.get("type") == "act_end":
            self._enter(beat["next"], out)
            return
        for nxt in self._act()["beats"]:
            if nxt.get("on") == f"after:{beat['id']}":
                self._chain(nxt, out)

    def _enter(self, act_id: str, out: list):
        self.act = act_id
        out.append({"act": act_id})
        if self.ready:
            self._fire_on("start", out)

    def _fire_on(self, trigger: str, out: list):
        if not self.ready:
            return
        for b in list(self._act()["beats"]):
            if b.get("on") == trigger and b["id"] not in self.fired:
                self._chain(b, out)

    def _maybe_finish(self, out: list):
        """An act without an act_end beat ends when its checklist is complete."""
        act = self._act()
        if any(b.get("type") == "act_end" for b in act["beats"]):
            return
        if self.tasks[self.act] and all(self.tasks[self.act]):
            i = self.acts.index(self.act)
            if i + 1 < len(self.acts):
                self._enter(self.acts[i + 1], out)

    def start(self) -> list:
        """The campaign begins: the prologue's "start" beats."""
        out = []
        if not self.fired:
            self._fire_on("start", out)
        return out

    def clue_hour(self, clue: str, default: float) -> float:
        """When a radio clue arrives in the campaign: the "hour>=N" of its beat in story.json."""
        for a in self.story["acts"]:
            for b in a["beats"]:
                if b.get("type") == "clue" and b.get("clue") == clue and b.get("on", "").startswith("hour>="):
                    return float(b["on"][6:])
        return default

    def event(self, name: str) -> list:
        """A game or scene event. Returns what to play: [{"beat": id} | {"task": [act, i]} | {"act": id}]."""
        out = []
        self.events.add(name)
        act = self.act
        for i, ev in enumerate(TASK_EVENTS.get(act, [])):
            if ev == name and not self.tasks[act][i]:
                self.tasks[act][i] = True
                out.append({"task": [act, i]})
        trigger = name if name.startswith("dive:") else f"event:{name}"
        self._fire_on(trigger, out)
        if self.act == act:
            self._maybe_finish(out)
        return out

    def hour(self, hours: float) -> list:
        """The clock moved: fire "hour>=N" beats of the current act (except radio clues, played by the clue window)."""
        out = []
        if not self.ready:
            return out
        for b in self._act()["beats"]:
            on = b.get("on", "")
            if on.startswith("hour>=") and b.get("type") != "clue" and b["id"] not in self.fired:
                if hours >= float(on[6:]):
                    self._chain(b, out)
        return out

    def state(self) -> dict:
        act = self._act()
        return {"act": self.act, "ready": self.ready, "goal": act.get("goal"), "tasks": self.tasks[self.act],
                "fired": self.fired, "mystery": self.mystery, "rival_active": self.rival_active,
                "choices": self.choices}
