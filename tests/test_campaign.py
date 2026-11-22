"""The story campaign (CLAUDE.md 17, 22): beats from story.json, the act checklist, act I rules."""
import json

from core import world
from core.campaign import Campaign, load_story
from core.game import Game, GameError

import pytest


def beats(items):
    return [i["beat"] for i in items if "beat" in i]


def test_story_json_is_version_2_caspian():
    s = load_story()
    assert s["world"]["depth_m"] == 950 and "Актау" in s["world"]["base"]
    assert s["map_names"]["Северная Атлантика"] == "Каспийское море"
    assert [a["id"] for a in s["acts"]] == ["prologue", "act1", "act2", "act3", "act4"]


def test_every_beat_trigger_points_somewhere():
    s = load_story()
    ids = {b["id"] for a in s["acts"] for b in a["beats"]}
    for a in s["acts"]:
        for b in a["beats"]:
            on = b["on"]
            assert on == "start" or on.split(":")[0] in ("after", "event", "dive", "before") or on.startswith("hour>="), on
            if on.startswith("after:"):
                assert on[6:] in ids, on
            if b.get("speaker"):
                assert b["speaker"] in s["characters"]


def test_prologue_chain_and_checklist():
    c = Campaign()
    assert beats(c.start()) == ["p1", "p2", "p3", "p4", "p5", "p6"]
    assert c.start() == []                                   # only once
    out = c.event("radio_heard")
    assert {"task": ["prologue", 0]} in out
    assert c.event("binoculars") == [{"task": ["prologue", 1]}]
    assert beats(c.event("enter_cabin")) == ["p7", "p8", "p9"]
    out = c.event("sit_at_table")
    assert beats(out) == ["p10"] and {"act": "act1"} in out  # all four tasks done -> act I
    assert c.act == "act1" and c.tasks["prologue"] == [True, True, True, True]


def test_act1_ends_with_poseidon_and_act2_card():
    c = Campaign(act="act1")
    assert not c.rival_active
    assert c.event("sonar") == [{"task": ["act1", 0]}]
    assert beats(c.event("first_sonar_silence")) == ["a1_2"]
    out = c.event("find:act1_dive_flap")
    assert beats(out) == ["a1_5", "a1_7", "a1_8", "a1_end", "a2_1"]   # act II starts with Erlan's storm line
    assert {"act": "act2"} in out and c.mystery == [1] and c.rival_active
    assert c.ready


def test_game_campaign_rival_arrives_after_act1():
    g = Game(272, campaign=True, compute_par=False)
    assert g.rival is None and g.state()["campaign"]["act"] == "prologue"
    g.story_event("start")
    g.story_event("radio_heard"); g.story_event("binoculars"); g.story_event("enter_cabin")
    out = g.story_event("sit_at_table")
    assert {"act": "act1"} in out and g.campaign.act == "act1"
    # act I: sonar at the top of the hill, then a live dive there
    target = tuple(g.advice()["vera"]["target"])
    g.act({"type": "go", "target": list(target), "tool": "sonar"})
    assert g.campaign.tasks["act1"][0]
    top = max(g.P, key=g.P.get)
    ev = g.act({"type": "go", "target": list(top), "tool": "dive"}, live=True)
    scene = next(e for e in ev if e["type"] == "dive")["scene"]
    assert scene["find"] == "act1_dive_flap" and scene["box"] is False
    assert g.campaign.tasks["act1"][1]
    P_before = dict(g.P)
    g.dive_end(False, 0.4, True, "act1_dive_flap")
    story = g.pop_story()
    assert "a1_5" in beats(story) and {"act": "act2"} in story and {"rival_arrives": True} in story
    assert g.rival is not None and g.rival.clock == g.hours
    assert g.P == P_before                                   # the act I dive leaves the box belief alone
    assert g.state()["campaign"]["mystery"] == [1]


def test_act1_low_dive_is_empty_and_dana_recounts():
    g = Game(272, campaign=True, compute_par=False)
    g.campaign.act = "act1"
    low = min((c for c in world.all_cells() if c not in world.REEFS and c != g.pos), key=g.P.get)
    ev = g.act({"type": "go", "target": list(low), "tool": "dive"}, live=True)
    assert next(e for e in ev if e["type"] == "dive")["scene"]["find"] is None
    g.dive_end(False, 0.5, False, None)
    assert "a1_6" in beats(g.pop_story())


def test_coast_clue_comes_at_hour_30_in_the_campaign():
    g = Game(272, campaign=True, compute_par=False)
    assert {c["kind"]: c["hour"] for c in g.clues} == {"fish": 6, "coast": 30}
    assert {c["kind"]: c["hour"] for c in Game(272, compute_par=False).clues} == {"fish": 6, "coast": 18}


def test_unknown_story_event_is_rejected():
    g = Game(272, campaign=True, compute_par=False)
    with pytest.raises(GameError):
        g.story_event("find:act1_dive_flap")                 # finds are reported by the dive, not by the browser
    with pytest.raises(GameError):
        Game(272, compute_par=False).story_event("start")


def test_api_story_endpoint():
    import threading
    import urllib.request
    from server import make_server
    server = make_server(0)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}"

    def post(path, body):
        req = urllib.request.Request(base + path, data=json.dumps(body).encode(), method="POST",
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    try:
        res = post("/api/story", {"event": "start"})
        assert beats(res["story"])[0] == "p1" and res["state"]["campaign"]["act"] == "prologue"
        assert res["state"]["rival"] is None
    finally:
        server.shutdown()
        server.server_close()
