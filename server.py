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
    POST /api/new     {seed?, demo?}     -> state           (demo: "Demo for the defence", seed 272)
    POST /api/choice  {key, option}      -> {story, state}  (act III: which recorder first; act IV: the ending)
    POST /api/decoy   {}                 -> {events, story, state}  (act II: drop the decoy buoy here)
    POST /api/skip    {}                 -> {story, state}  (demo only: skip to the next act)
    POST /api/focus   {kind}             -> {state}         (act III: the "Data / Voice" switch)
    POST /api/load    {save}             -> state           (a saved game from localStorage, replayed)

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
from core.game import DEMO_SEED
from core.router import Session, story_file  # noqa: F401  (story_file: kept for older imports)

WEB_DIR = Path(__file__).resolve().parent / "web"
MAX_BODY = 64 * 1024


class GameServer(ThreadingHTTPServer):
    """Holds the one current mission (core.router.Session: the same routes the online build calls in
    Pyodide). A lock keeps concurrent requests from mixing up turns."""

    daemon_threads = True
    # on Windows SO_REUSEADDR lets a second server bind a port that is in use; then main.py could not move on
    allow_reuse_address = sys.platform != "win32"

    def __init__(self, port: int, seed: int | None = DEMO_SEED, lang: str = "ru", exam: bool = False,
                 campaign: bool = True, demo: bool = False):
        super().__init__(("127.0.0.1", port), Handler)  # localhost only
        self.lock = threading.Lock()
        self.exam = exam
        self.lang = lang
        self.campaign = campaign
        self.demo = demo
        self.session = Session(seed=seed, lang=lang, campaign=campaign, demo=demo, on_turns=self.print_new_turns)

    @property
    def game(self):
        return self.session.game

    @game.setter
    def game(self, value):
        self.session.game = value

    def print_new_turns(self, game, before: int):
        """Exam mode: every turn of the three algorithms goes to this terminal."""
        if self.exam:
            for i in range(before, len(game.turns)):
                print("\n" + format_turn(game.turns[i], i + 1), flush=True)


class Handler(SimpleHTTPRequestHandler):
    """Static files from web/ plus JSON routes under /api/ (core.router)."""

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
        if not url.path.startswith("/api/"):
            return super().do_GET()
        query = {k: v[0] for k, v in parse_qs(url.query).items()}
        with self.server.lock:
            status, data = self.server.session.handle("GET", url.path, query=query)
        return self.send_json(data, status)

    def do_POST(self):
        path = urlsplit(self.path).path
        try:
            body = self.read_json()
        except ValueError:
            return self.send_json({"error": "bad_json", "params": {}}, 400)
        with self.server.lock:
            status, data = self.server.session.handle("POST", path, body)
        return self.send_json(data, status)

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
                campaign: bool = True, demo: bool = False) -> GameServer:
    return GameServer(port, seed=seed, lang=lang, exam=exam, campaign=campaign, demo=demo)
