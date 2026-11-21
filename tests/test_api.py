"""HTTP API v3: a real server on a free port, requests through urllib."""
import json
import threading
import urllib.error
import urllib.request

import pytest

from core.game import DEMO_SEED
from server import make_server


@pytest.fixture()
def api():
    server = make_server(0, campaign=False)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}"

    def call(path, body=None, raw=None):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(base + path, data=data, method="POST" if data is not None else "GET",
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    yield call
    server.shutdown()
    server.server_close()


def test_state_defaults_to_demo_map(api):
    status, st = api("/api/state")
    assert status == 200 and st["seed"] == DEMO_SEED
    assert st["fuel"] == 100 and st["beacon_left"] == 120 and st["box"] is None
    assert st["rival"]["plan"]["target"] and st["advice"]["advice"]["action"]
    assert abs(sum(map(sum, st["P"])) - 1) < 1e-4


def test_preview_does_not_change_state(api):
    _, before = api("/api/state")
    status, pv = api("/api/preview", {"action": {"type": "go", "target": [6, 3], "tool": "dive"}})
    assert status == 200 and pv["chance"]["find"] > 0 and pv["rival"]["pos"]
    _, after = api("/api/state")
    assert after == before


def test_act_and_advice(api):
    status, adv = api("/api/advice")
    assert status == 200 and set(adv) == {"vera", "lev", "grisha", "advice"}
    status, res = api("/api/act", {"action": adv["advice"]["action"]})
    assert status == 200 and res["events"] and res["state"]["hours"] > 0


def test_clue_flow_and_journal(api):
    st = None
    while True:                                             # sail until the first clue arrives
        _, st = api("/api/state")
        if st["clues"] or st["status"] != "playing":
            break
        api("/api/act", {"action": {"type": "go", "target": [0, 8] if st["pos"] == [0, 9] else [0, 9], "tool": None}})
    if st["clues"]:
        status, res = api("/api/clue", {"id": st["clues"][0]["id"], "accept": True})
        assert status == 200 and any(e["type"] == "belief" for e in res["events"])
    _, j = api("/api/journal")
    assert j["turns"] and j["feed"]


def test_new_mission_and_errors(api):
    status, st = api("/api/new", {"seed": 5})
    assert status == 200 and st["seed"] == 5
    assert api("/api/act", {"action": {"type": "go", "target": [5, 3]}})[1]["error"] == "reef"
    assert api("/api/act", raw=b"{oops")[0] == 400
    assert api("/api/new", {"seed": "x"})[0] == 400
    assert api("/api/clue", {"id": "nope", "accept": True})[1]["error"] == "no_clue"
    assert api("/api/nope")[0] == 404


def test_story_in_three_languages(api):
    for lang in ("kk", "ru", "en"):
        status, s = api(f"/api/story?lang={lang}")
        assert status == 200 and s["lang"] == lang and s["acts"][0]["id"] == "prologue"
    status, s = api("/api/story?lang=xx")       # unknown -> the original (ru)
    assert status == 200 and s["lang"] == "ru"
