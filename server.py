"""Tiny local HTTP server: serves the web/ frontend and the JSON API (CLAUDE.md v3, 13.2).

Only the Python standard library is used. The browser never computes anything —
it asks this server for state, sends the captain's decisions here and animates the events.

    POST /api/new     {seed?}            -> state           (default seed: the demo map)
    GET  /api/state                      -> state
    POST /api/preview {action}           -> hours, fuel, path, chance, risky, rival forecast (changes NOTHING)
    POST /api/act     {action}           -> {events, state}
    POST /api/clue    {id, accept}       -> {events, state}
    POST /api/dive    {found, coverage, debris, find?}  -> {events, story, state}   (end of a live first-person dive)
    GET  /api/story?lang=kk|ru|en        -> the story texts in that language (web/data/story[.kk|.en].json)
    POST /api/story   {event}            -> {story, state}  (campaign scene events: enter_cabin, sit_at_table, dive:start…)
    GET  /api/advice                     -> the three officers + joint advice
    GET  /api/journal                    -> records + calculations (professor's mode)

    action = {"type": "go", "target": [x, y], "tool": "sonar" | "dive" | null} | {"type": "home"}

Errors: HTTP 400 {"error": "<message key>", "params": {...}}.
"""
from __future__ import annotations
import json
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from core.exam import format_turn
from core.game import DEMO_SEED, Game, GameError

WEB_DIR = Path(__file__).resolve().parent / "web"
MAX_BODY = 64 * 1024
# the three story files have the same structure (CLAUDE.md 23.1); ru is the original
STORY_FILES = {"ru": "story.json", "kk": "story.kk.json", "en": "story.en.json"}


def story_file(lang: str | None) -> Path:
    return WEB_DIR / "data" / STORY_FILES.get(lang or "ru", STORY_FILES["ru"])


class GameServer(ThreadingHTTPServer):
    """Holds the one current mission. A lock keeps concurrent requests from mixing up turns."""

    daemon_threads = True
    # on Windows SO_REUSEADDR lets a second server bind a port that is in use; then main.py could not move on
    allow_reuse_address = sys.platform != "win32"

    def __init__(self, port: int, seed: int | None = DEMO_SEED, lang: str = "ru", exam: bool = False,
                 campaign: bool = True):
        super().__init__(("127.0.0.1", port), Handler)  # localhost only
        self.lock = threading.Lock()
        self.exam = exam
        self.lang = lang
        self.campaign = campaign
        self.game = Game(seed=seed, lang=lang, campaign=campaign)

    def print_new_turns(self, game, before: int):
        """Exam mode: every turn of the three algorithms goes to this terminal."""
        if self.exam:
            for i in range(before, len(game.turns)):
                print("\n" + format_turn(game.turns[i], i + 1), flush=True)


class Handler(SimpleHTTPRequestHandler):
    """Static files from web/ plus JSON routes under /api/."""

    server: GameServer

    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".woff2": "font/woff2",
        ".css": "text/css",
        ".html": "text/html; charset=utf-8",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    # ------------------------------------------------------------------ routing
    def do_GET(self):
        url = urlsplit(self.path)
        path = url.path
        if not path.startswith("/api/"):
            return super().do_GET()
        if path == "/api/story":
            lang = (parse_qs(url.query).get("lang") or ["ru"])[0]
            return self.send_json(json.loads(story_file(lang).read_text(encoding="utf-8")))
        with self.server.lock:
            game = self.server.game
            if path == "/api/state":
                return self.send_json(game.state())
            if path == "/api/advice":
                if game.status != "playing":
                    return self.send_json({"error": "game_over", "params": {}}, 400)
                return self.send_json(game.advice())
            if path == "/api/journal":
                return self.send_json({"feed": game.feed, "turns": game.turns})
        return self.send_json({"error": "unknown_endpoint"}, 404)

    def do_POST(self):
        path = urlsplit(self.path).path
        try:
            body = self.read_json()
        except ValueError:
            return self.send_json({"error": "bad_json", "params": {}}, 400)

        with self.server.lock:
            game = self.server.game
            try:
                if path == "/api/new":
                    seed = body.get("seed", DEMO_SEED)
                    if seed is not None and (not isinstance(seed, int) or isinstance(seed, bool)):
                        raise GameError("bad_seed")
                    campaign = body.get("campaign", self.server.campaign)
                    self.server.game = Game(seed=seed, lang=body.get("lang") or self.server.lang, campaign=bool(campaign))
                    return self.send_json(self.server.game.state())
                if path == "/api/preview":
                    return self.send_json(game.preview(body.get("action")))
                if path == "/api/act":
                    before = len(game.turns)
                    events = game.act(body.get("action"), live=bool(body.get("live")))
                    self.server.print_new_turns(game, before)
                    return self.send_json({"events": events, "story": game.pop_story(), "state": game.state()})
                if path == "/api/dive":
                    before = len(game.turns)
                    find = body.get("find") if isinstance(body.get("find"), str) else None
                    events = game.dive_end(bool(body.get("found")), body.get("coverage", 0), bool(body.get("debris")), find)
                    self.server.print_new_turns(game, before - 1)      # the dive's turn now has its result
                    return self.send_json({"events": events, "story": game.pop_story(), "state": game.state()})
                if path == "/api/story":
                    story = game.story_event(str(body.get("event", "")))
                    return self.send_json({"story": story, "state": game.state()})
                if path == "/api/clue":
                    before = len(game.turns)
                    events = game.clue(body.get("id"), bool(body.get("accept")))
                    self.server.print_new_turns(game, before)
                    return self.send_json({"events": events, "story": game.pop_story(), "state": game.state()})
            except GameError as e:
                return self.send_json({"error": e.key, "params": e.params}, 400)
        return self.send_json({"error": "unknown_endpoint"}, 404)

    # ------------------------------------------------------------------ io helpers
    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            raise ValueError("body too large")
        raw = self.rfile.read(length) if length else b"{}"
        data = json.loads(raw or b"{}")
        if not isinstance(data, dict):
            raise ValueError("expected an object")
        return data

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")  # always fresh files while developing
        super().end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass  # keep the terminal clean: it is reserved for exam-mode output


def make_server(port: int, seed: int | None = DEMO_SEED, lang: str = "ru", exam: bool = False,
                campaign: bool = True) -> GameServer:
    return GameServer(port, seed=seed, lang=lang, exam=exam, campaign=campaign)
