"""The rival "Poseidon-2" (CLAUDE.md v3, 5.6): same brain, slower ship, shared clock.

It keeps its OWN belief map (same prior, its own sonar and dives, the shared radio clues).
Plan = Vera's target (argmax) + Lev's route (A*) + Vera's tool rule. The plan is shown to the
player and is NEVER changed halfway: the rival only re-plans after finishing its tool.

Time model: a queue of tasks with absolute start/end hours on the mission clock.
    move one cell  1.5 h     sonar 2 h     dive 6 h
`advance_to(t)` completes every task that ends by t and returns timestamped events.
`forecast(hours)` looks ahead WITHOUT randomness (for the banner and the action tags).
"""
from __future__ import annotations
from core import agent, bayes, world


class Rival:
    def __init__(self, P0: dict, rng, start=world.RIVAL_START, now: float = 0.0):
        self.P = dict(P0)
        self.rng = rng
        self.pos = tuple(start)
        self.clock = now
        self.tasks = []           # [{"kind", "cell", "start", "end"}]
        self.plan = None          # {"target", "tool", "path"}
        self.found_at = None      # mission hour of the successful dive
        self.probes = []          # [{"cell", "kind", "result"?, "t"}]
        self._replan(now)

    # ------------------------------------------------------------------ planning
    def _replan(self, now: float):
        target = bayes.argmax(self.P, near=self.pos)
        tool = agent.tool_for(self.P, target)
        path = agent.route(self.pos, target).path
        t = now
        self.tasks = []
        for cell in path[1:]:
            self.tasks.append({"kind": "move", "cell": cell, "start": t, "end": t + world.RIVAL_MOVE_HOURS})
            t += world.RIVAL_MOVE_HOURS
        dur = world.RIVAL_DIVE_HOURS if tool == "dive" else world.RIVAL_SONAR_HOURS
        self.tasks.append({"kind": tool, "cell": target, "start": t, "end": t + dur})
        self.plan = {"target": target, "tool": tool, "path": path}

    def apply_clue(self, L: dict):
        """Radio clues are public: the rival always takes them into account (plan unchanged)."""
        self.P, _ = bayes.update(self.P, L)

    # ------------------------------------------------------------------ time
    def advance_to(self, t: float, box, strict: bool = False) -> list:
        """Run tasks that end before t (or at t, unless strict). Returns events."""
        events = []
        while self.found_at is None and self.tasks:
            task = self.tasks[0]
            if task["end"] > t or (strict and task["end"] >= t):
                break
            self.tasks.pop(0)
            end, cell = task["end"], task["cell"]
            if task["kind"] == "move":
                self.pos = cell
                events.append({"type": "move", "rival": True, "t": end, "cell": list(cell)})
                continue
            if task["kind"] == "sonar":
                echo = self.rng.random() < world.p_echo(cell, box)
                self.P, _ = bayes.sonar(self.P, cell, echo)
                self.probes.append({"cell": list(cell), "kind": "sonar", "t": end})
                # the player sees the red ring, not the rival's result
                events.append({"type": "sonar", "rival": True, "t": end, "cell": list(cell)})
            else:
                outcome = self._camera(cell, box)
                self.probes.append({"cell": list(cell), "kind": "dive", "result": outcome, "t": end})
                events.append({"type": "dive", "rival": True, "t": end, "cell": list(cell), "result": outcome})
                if outcome == "box":
                    self.found_at = end
                    break
                self.P, _ = bayes.camera(self.P, cell, outcome)
            self._replan(end)
        self.clock = max(self.clock, t)
        return events

    def _camera(self, cell, box) -> str:
        r, acc = self.rng.random(), 0.0
        for outcome, p in world.camera_probs(cell, box).items():
            acc += p
            if r < acc:
                return outcome
        return "nothing"

    # ------------------------------------------------------------------ honest forecast
    def forecast(self, hours: float) -> dict:
        """Where the rival will be after `hours` and whether it finishes a dive by then.
        Looks only at the current plan (results of its tools are unknown in advance)."""
        until = self.clock + hours
        pos, dive_done = self.pos, None
        for task in self.tasks:
            if task["end"] > until:
                break
            if task["kind"] == "move":
                pos = task["cell"]
            elif task["kind"] == "dive":
                dive_done = {"cell": list(task["cell"]), "in": task["end"] - self.clock}
            break_after_tool = task["kind"] != "move"
            if break_after_tool:
                break                     # after its tool the rival re-plans: unknown
        return {"pos": list(pos), "dive_done": dive_done}

    def plan_info(self) -> dict:
        """Banner data: target, when it arrives, when its tool finishes (hours from now)."""
        tool_task = self.tasks[-1]
        moves = [t for t in self.tasks if t["kind"] == "move"]
        arrive = (moves[-1]["end"] if moves else self.clock) - self.clock
        return {"target": list(self.plan["target"]), "tool": self.plan["tool"],
                "path": [list(c) for c in [self.pos] + [t["cell"] for t in moves]],
                "arrive_in": max(0.0, arrive), "tool_end_in": tool_task["end"] - self.clock}
