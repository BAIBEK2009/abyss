"""The JSON API in one place (CLAUDE.md v3, 13.2): server.py calls it over HTTP, the online build
(docs/, Pyodide) calls the very same function from the browser. No game logic lives here: it only
routes a request to Game and packs the answer.

    session = Session(seed=272, lang="ru", campaign=True, demo=False)
    status, data = session.handle("POST", "/api/act", {"action": {...}})
"""
from __future__ import annotations
import json
from pathlib import Path

from core.game import DEMO_SEED, Game, GameError

DATA_DIR = Path(__file__).resolve().parent.parent / "web" / "data"
# the three story files have the same structure (CLAUDE.md 23.1); ru is the original
STORY_FILES = {"ru": "story.json", "kk": "story.kk.json", "en": "story.en.json"}


def story_file(lang: str | None) -> Path:
    return DATA_DIR / STORY_FILES.get(lang or "ru", STORY_FILES["ru"])


class Session:
    """Holds the one current mission. on_turns(game, start) is called after the turns from start on
    got their numbers (exam mode prints them)."""

    def __init__(self, seed: int | None = DEMO_SEED, lang: str = "ru", campaign: bool = True,
                 demo: bool = False, on_turns=None):
        self.lang = lang
        self.campaign = campaign
        self.demo = demo
        self.on_turns = on_turns
        self.game = Game(seed=DEMO_SEED if demo else seed, lang=lang, campaign=campaign, demo=demo)

    def _turns(self, game, start):
        if self.on_turns:
            self.on_turns(game, start)

    def handle(self, method: str, path: str, body: dict | None = None, query: dict | None = None):
        """-> (HTTP status, JSON-able answer). Errors: 400 {"error": key, "params": {...}}."""
        body = body or {}
        query = query or {}
        try:
            if method == "GET":
                return self._get(path, query)
            return self._post(path, body)
        except GameError as e:
            return 400, {"error": e.key, "params": e.params}

    def _get(self, path, query):
        game = self.game
        if path == "/api/story":
            return 200, json.loads(story_file(query.get("lang")).read_text(encoding="utf-8"))
        if path == "/api/state":
            return 200, game.state()
        if path == "/api/advice":
            if game.status != "playing":
                return 400, {"error": "game_over", "params": {}}
            return 200, game.advice()
        if path == "/api/journal":
            return 200, {"feed": game.feed, "turns": game.turns}
        return 404, {"error": "unknown_endpoint"}

    def _post(self, path, body):
        game = self.game
        if path == "/api/new":
            seed = body.get("seed", DEMO_SEED)
            if seed is not None and (not isinstance(seed, int) or isinstance(seed, bool)):
                raise GameError("bad_seed")
            demo = bool(body.get("demo"))
            self.game = Game(seed=DEMO_SEED if demo else seed, lang=body.get("lang") or self.lang,
                             campaign=bool(body.get("campaign", self.campaign)) or demo, demo=demo)
            return 200, self.game.state()
        if path == "/api/load":
            self.game = Game.replay(body.get("save"))
            return 200, self.game.state()
        if path == "/api/choice":
            story = game.choose(str(body.get("key", "")), str(body.get("option", "")))
            return 200, {"story": story, "state": game.state()}
        if path == "/api/focus":
            game.set_focus(str(body.get("kind", "")))
            return 200, {"state": game.state()}
        if path == "/api/decoy":
            events = game.drop_decoy()
            return 200, {"events": events, "story": game.pop_story(), "state": game.state()}
        if path == "/api/skip":
            story = game.skip_act()
            return 200, {"story": story, "state": game.state()}
        if path == "/api/preview":
            return 200, game.preview(body.get("action"))
        if path == "/api/act":
            before = len(game.turns)
            events = game.act(body.get("action"), live=bool(body.get("live")))
            self._turns(game, before)
            return 200, {"events": events, "story": game.pop_story(), "state": game.state()}
        if path == "/api/dive":
            before = len(game.turns)
            find = body.get("find") if isinstance(body.get("find"), str) else None
            events = game.dive_end(bool(body.get("found")), body.get("coverage", 0), bool(body.get("debris")), find)
            self._turns(game, before - 1)      # the dive's turn now has its result
            return 200, {"events": events, "story": game.pop_story(), "state": game.state()}
        if path == "/api/story":
            story = game.story_event(str(body.get("event", "")))
            return 200, {"story": story, "state": game.state()}
        if path == "/api/clue":
            before = len(game.turns)
            events = game.clue(body.get("id"), bool(body.get("accept")))
            self._turns(game, before)
            return 200, {"events": events, "story": game.pop_story(), "state": game.state()}
        return 404, {"error": "unknown_endpoint"}


def handle_json(session: Session, method: str, path: str, body_json: str, query_json: str = "{}") -> str:
    """The browser entry (Pyodide): JSON strings in, '{"status": n, "data": {...}}' out."""
    try:
        body = json.loads(body_json or "{}")
        if not isinstance(body, dict):
            raise ValueError
    except ValueError:
        return json.dumps({"status": 400, "data": {"error": "bad_json", "params": {}}})
    status, data = session.handle(method, path, body, json.loads(query_json or "{}"))
    return json.dumps({"status": status, "data": data}, ensure_ascii=False)
