"""Acts II-IV of the campaign (B1-B4, B6, B7): storm, decoy, two recorders, choices, endings, demo, save."""
import pytest

from core import storm, world
from core.game import Game, GameError

PROLOGUE = ("start", "radio_heard", "binoculars", "enter_cabin", "sit_at_table")


def new(demo=False, seed=272):
    g = Game(seed, campaign=True, compute_par=False, demo=demo)
    for ev in PROLOGUE:
        g.story_event(ev)
    g.pop_story()
    return g


def top(g):
    return list(max(g.PF, key=g.PF.get))


def to_act2(g):
    g.act({"type": "go", "target": top(g), "tool": "sonar"})
    g.act({"type": "go", "target": top(g), "tool": "dive"})
    assert g.campaign.act == "act2"


def test_storm_moves_and_costs_three():
    assert storm.cells(-1) == set()
    a, b = storm.cells(5), storm.cells(15)
    assert a and b and a != b and not (a & world.REEFS)
    assert storm.passed(80) and not storm.passed(10)


def test_storm_route_detours_and_sonar_is_deaf():
    g = new()
    to_act2(g)
    g.storm_t0 = g.hours - 18                       # put the front over the middle of the square
    sc = g._storm_cells()
    assert sc
    cell = next(iter(sorted(sc)))
    pv = g.preview({"type": "go", "target": list(cell), "tool": "sonar"})
    assert "storm_sonar" in pv["risky"] and pv["chance"]["echo"] == 0.0
    # A* with weights: a route never costs more than going straight through, and storm cells cost 3
    from core.agent import route
    r, plain = g._route(world.BASE, (9, 0)), route(world.BASE, (9, 0))
    assert r.cost == sum(storm.COST if c in sc else 1 for c in r.path[1:])
    assert r.cost <= sum(storm.COST if c in sc else 1 for c in plain.path[1:])
    d = g.pos[0] - g.pos[1]                          # the front's centre right over the ship: listen here
    g.storm_t0 = g.hours - (d - storm.START) / storm.SPEED
    P0 = dict(g.P)
    g.act({"type": "go", "target": list(g.pos), "tool": "sonar"})
    assert g.probes[-1]["result"] == "storm" and g.P == P0     # no information, no Bayes update


def test_decoy_turns_the_rival():
    g = new()
    to_act2(g)
    g.act({"type": "go", "target": top(g), "tool": "sonar"})
    for _ in range(10):
        if g.decoy == "ready":
            break
        g.act(g.advice()["advice"]["action"])
    assert g.decoy == "ready"
    before = g.rival.plan_info()["target"]
    g.drop_decoy()
    after = g.rival.plan_info()["target"]
    assert g.decoy == list(g.pos) and world.manhattan(after, g.pos) <= world.manhattan(before, g.pos)
    assert "decoy_used" in g.campaign.events
    with pytest.raises(GameError):
        g.drop_decoy()                               # one per act


def test_act3_two_maps_and_the_choice():
    g = new(demo=True)
    to_act2(g)
    g.act({"type": "go", "target": top(g), "tool": "dive"})
    assert g.campaign.act == "act3" and g.boxes == {"fdr": None, "cvr": None}
    assert g.P != g.P2 and g.cvr != g.box and 1 <= world.manhattan(g.cvr, g.box) <= 2
    g.choose("act3", "cvr_first")
    assert g.focus == "cvr" and g.campaign.tasks["act3"][0]
    st = g.state()["campaign"]
    assert st["focus"] == "cvr" and st["cvr_left"] == pytest.approx(30.0) and set(st["maps"]) == {"fdr", "cvr"}


@pytest.mark.parametrize("ending", ["investigators", "public", "sell"])
def test_demo_reaches_each_chosen_ending(ending):
    g = new(demo=True)
    to_act2(g)
    g.act({"type": "go", "target": top(g), "tool": "dive"})          # the tail -> act III
    g.choose("act3", "fdr_first")
    for _ in range(2):                                              # one dive per recorder in the demo
        ev = g.act({"type": "go", "target": top(g), "tool": "dive"}, live=True)
        assert next(e for e in ev if e["type"] == "dive" and not e.get("rival"))["scene"]["box"]
        g.dive_end(True, 0.3)
    assert g.boxes == {"fdr": "us", "cvr": "us"} and g.campaign.act == "act4"
    assert sorted(g.campaign.mystery) == [1, 2, 3, 4, 5, 6]
    g.choose("act4", ending)
    assert g.status == "ended" and g.campaign.ending == ending and all(g.campaign.tasks["act4"])


def test_lost_when_the_beacon_dies_with_nothing_on_board():
    g = new()
    to_act2(g)
    g.hours = world.BEACON_HOURS - 1
    g.act({"type": "go", "target": top(g), "tool": "dive"})
    assert g.status == "lost" and g.campaign.ending == "lost"


def test_skip_act_in_demo_only():
    g = new(demo=True)
    for act in ("act2", "act3", "act4"):
        g.skip_act()
        assert g.campaign.act == act
    with pytest.raises(GameError):
        new().skip_act()


def test_save_replays_to_the_same_game():
    g = new()
    to_act2(g)
    for c in g.pending_clues():
        g.clue(c["id"], True)
    g.act(g.advice()["advice"]["action"])
    save = g.state()["save"]
    h = Game.replay(save)
    assert h.hours == g.hours and h.P == g.P and h.campaign.fired == g.campaign.fired and h.pos == g.pos
    with pytest.raises(GameError):
        Game.replay({"v": 1, "seed": 272, "log": []})               # an old save is dropped, not crashed on
