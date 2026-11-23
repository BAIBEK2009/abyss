"""The online build (tools/build_web.py -> docs/, Pyodide): the same Python routes as server.py, relative
paths only, and web/js/api.js is the one door to /api/*."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from build_web import META, build  # noqa: E402
from core.router import Session, handle_json  # noqa: E402


def test_build_has_the_engine_and_relative_paths(tmp_path):
    out = build(tmp_path / "docs")
    html = (out / "index.html").read_text(encoding="utf-8")
    assert META in html and (out / ".nojekyll").exists()
    assert not re.search(r'(?:src|href)="/(?!/)', html), "absolute path in index.html"
    man = json.loads((out / "py" / "manifest.json").read_text())
    dst = {d for _, d in man["files"]}
    assert {"core/router.py", "core/game.py", "web/data/story.json", "web/data/story.kk.json", "web/data/story.en.json"} <= dst
    for src, _ in man["files"]:
        assert (out / src).exists(), src
    assert (out / "js" / "pyodide_backend.js").exists() and (out / "i18n" / "kk.json").exists()


def test_only_api_js_calls_the_api():
    for f in (ROOT / "web" / "js").rglob("*.js"):
        if f.name in ("api.js", "pyodide_backend.js"):
            continue
        assert not re.search(r"fetch\([^)]*/api/", f.read_text(encoding="utf-8")), f


def test_router_json_entry_matches_the_server_routes():
    s = Session(demo=True)
    st = json.loads(handle_json(s, "GET", "/api/state", "{}"))
    assert st["status"] == 200 and st["data"]["campaign"]["demo"]
    story = json.loads(handle_json(s, "GET", "/api/story", "{}", json.dumps({"lang": "kk"})))
    assert story["data"]["lang"] == "kk"
    assert json.loads(handle_json(s, "POST", "/api/new", '{"seed": "x"}'))["data"]["error"] == "bad_seed"
    assert json.loads(handle_json(s, "POST", "/api/new", "[1]"))["data"]["error"] == "bad_json"
    assert json.loads(handle_json(s, "GET", "/api/nope", "{}"))["status"] == 404
