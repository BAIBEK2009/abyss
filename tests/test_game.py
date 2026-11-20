"""Mission rules on the shared clock: costs, sensors, tow, beacon, rival, clues, determinism."""
import pytest

from core import world
from core.exam import format_turn
from core.game import DEMO_SEED, Game, GameError


def new(seed=2011, **kw):
    kw.setdefault("compute_par", False)
    return Game(seed=seed, **kw)


def go(target, tool=None):
    return {"type": "go", "target": list(target), "tool": tool}


def test_demo_map_autopilot_wins_in_5_actions_showing_every_outcome():
    g = Game(seed=DEMO_SEED)
    g.autoplay()
    assert g.status == "won" and g.counts["actions"] == 5
    seen = {(p["kind"], p["result"]) for p in g.probes}
    assert {("sonar", "echo"), ("sonar", "silence"), ("dive", "debris"), ("dive", "nothing"), ("dive", "box")} <= seen
    assert g.stars() >= 1


def test_same_seed_same_mission():
    def run():
        g = new(DEMO_SEED)
        return g.autoplay(), g.box
    assert run() == run()


def test_box_is_secret_until_the_end():
    assert new().state()["box"] is None


def test_move_costs_one_hour_and_two_fuel_per_cell():
    g = new(rival=False)
    g.act(go((0, 7)))                                   # A10 -> A8: 2 cells
    assert (g.hours, g.fuel, g.pos) == (2, 96, (0, 7))


def test_sonar_and_dive_costs():
    g = new(rival=False, box=(9, 0))
    g.act(go((0, 9 - 1), "sonar"))                      # 1 cell + sonar: 1 + 2 h, 2 + 3 fuel
    assert (g.hours, g.fuel) == (3, 95)
    g.act(go((0, 8), "dive"))                           # dive here: 6 h, 8 fuel
    assert (g.hours, g.fuel) == (9, 87)
    assert g.counts["sonar"] == 1 and g.counts["dive"] == 1


def test_home_refuels_and_costs_one_hour_per_cell_plus_four():
    g = new(rival=False)
    g.act(go((0, 6)))                                    # 3 cells
    g.act({"type": "home"})
    assert (g.pos, g.fuel, g.hours) == (world.BASE, 100, 3 + 3 + 4)


@pytest.mark.parametrize("action,key", [
    (go((5, 3)), "reef"), (go(world.BASE), "here"), ({"type": "fly"}, "bad_action"),
    (go((10, 0)), "bad_target"), (go((4, 4), "laser"), "bad_tool"), ({"type": "home"}, "at_base"),
])
def test_invalid_actions(action, key):
    with pytest.raises(GameError) as e:
        new().act(action)
    assert e.value.key == key


def test_tow_when_fuel_runs_out():
    g = new(rival=False, box=(0, 0))
    g.fuel = 6
    events = g.act(go((6, 4), "sonar"))                 # far away: fuel goes below zero
    assert any(e["type"] == "tow" for e in events)
    assert g.pos == world.BASE and g.fuel == world.TOW_FUEL
    assert g.hours == pytest.approx(world.TOW_HOURS + 11 + 2)   # 11 cells + sonar + 24 h tow
    assert g.status == "playing" and g.counts["tow"] == 1


def test_beacon_runs_out():
    g = new(rival=False, box=(0, 0))
    g.hours = 116
    events = g.act(go((0, 8), "dive"))                  # 1 + 6 h > 4 h left
    assert g.status == "lost" and g.reason == "beacon"
    assert events[-1]["type"] == "end" and events[-1]["reason"] == "beacon"


def test_rival_wins_and_player_does_not_get_a_late_result():
    for seed in range(200):
        g = new(seed)
        while g.status == "playing":
            events = g.act(go((0, 8), "dive"))           # keep diving near home: the rival gets there first
        if g.reason == "rival":
            found = next(e for e in events if e.get("rival") and e["type"] == "dive" and e["result"] == "box")
            assert not any(e["type"] in ("sonar", "dive") and not e.get("rival") and e["t"] > found["t"] for e in events)
            assert events[-1]["reason"] == "rival"
            return
    pytest.fail("no map where the rival wins")


def test_events_are_in_time_order():
    g = new(DEMO_SEED)
    events = g.autoplay()
    times = [e["t"] for e in events if "t" in e]
    assert times == sorted(times)


def test_clue_arrives_at_hour_6_and_can_be_applied_or_rejected():
    g = new(rival=False, box=(9, 0))
    events = g.act(go((0, 2)))                          # 7 cells: crosses hour 6
    clue = next(e for e in events if e["type"] == "clue")
    assert clue["t"] == 6 and clue["id"] == "fish"
    assert [c["id"] for c in g.state()["clues"]] == ["fish"]
    before = dict(g.P)
    g.clue("fish", True)
    assert g.P != before and abs(sum(g.P.values()) - 1) < 1e-9
    with pytest.raises(GameError):
        g.clue("fish", True)                              # already used


def test_preview_changes_nothing_and_shows_cost_chance_and_rival():
    g = new()
    before = g.state()
    pv = g.preview(go((6, 3), "dive"))
    assert g.state() == before
    assert pv["hours"] == pv["cells"] + 6 and pv["fuel"] == 2 * pv["cells"] + 8
    assert pv["chance"]["find"] == pytest.approx(g.P[(6, 3)] * 0.97)
    assert "pos" in pv["rival"]
    pv = g.preview(go((6, 3), "sonar"))
    assert 0 < pv["chance"]["echo"] < 1


def test_preview_warns_about_tow():
    g = new()
    g.fuel = 10
    assert "tow" in g.preview(go((9, 0), "dive"))["risky"]


def test_journal_and_exam_text():
    g = new(DEMO_SEED)
    g.autoplay()
    text = "\n".join(format_turn(t, i + 1) for i, t in enumerate(g.turns))
    for tag in ("[BAYES]", "[A*]", "[MDP]", "[RIVAL]", "Z=", "Q(SEARCH)=27.44", "expanded"):
        assert tag in text
    assert any(f["key"] == "feed_sonar" for f in g.feed)
