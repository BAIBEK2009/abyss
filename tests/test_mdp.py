"""MDP battery model — Q-values checked by hand (CLAUDE.md, section 5.3).

HIGH: Q(SEARCH) = -1 + 0.9 * (0.7*40 + 0.3*12)    = -1 + 0.9 * 31.6  = 27.44
      Q(RETURN) = -15 + 0.9 * 40                     = 21.00
LOW:  Q(SEARCH) = -1 + 0.9 * (0.6*12 + 0.4*(-100)) = -1 + 0.9 * -32.8 = -30.52
      Q(RETURN) = 21.00
"""
import pytest

from core import mdp


def test_high_fuel_prefers_search():
    q = mdp.q_values(mdp.HIGH)
    assert q[mdp.SEARCH] == pytest.approx(27.44)
    assert q[mdp.RETURN] == pytest.approx(21.0)
    assert mdp.decide(62).action == mdp.SEARCH


def test_low_fuel_prefers_return():
    q = mdp.q_values(mdp.LOW)
    assert q[mdp.SEARCH] == pytest.approx(-30.52)
    assert q[mdp.RETURN] == pytest.approx(21.0)
    assert mdp.decide(24).action == mdp.RETURN


@pytest.mark.parametrize("fuel,state", [(100, mdp.HIGH), (35, mdp.HIGH), (34, mdp.LOW), (0, mdp.LOW)])
def test_fuel_threshold(fuel, state):
    assert mdp.state_of(fuel) == state


def test_decision_reports_inputs_and_q():
    d = mdp.decide(62)
    assert d.state == mdp.HIGH and d.fuel == 62
    assert set(d.q) == {mdp.SEARCH, mdp.RETURN}


def test_transition_rows_sum_to_one():
    for (_s, _a), (_r, nxt) in mdp.MODEL.items():
        assert sum(nxt.values()) == pytest.approx(1.0)


def test_one_bellman_update():
    V1 = mdp.bellman_update()
    assert V1[mdp.HIGH] == pytest.approx(27.44)   # max(27.44, 21.0)
    assert V1[mdp.LOW] == pytest.approx(21.0)     # max(-30.52, 21.0)
    assert V1[mdp.LOST] == -100.0                 # terminal
