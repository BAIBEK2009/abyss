"""Algorithm 3 — MDP for battery (fuel) management: keep searching or go home?

States : HIGH (fuel >= 35), LOW (fuel < 35), LOST (terminal: sub lost).
Actions: SEARCH, RETURN.   Discount gamma = 0.9.

Transitions and rewards (ASSUMPTIONS, listed in the README):
    SEARCH from HIGH : R = -1 ,  -> HIGH 0.7, -> LOW 0.3
    SEARCH from LOW  : R = -1 ,  -> LOW 0.6,  -> LOST 0.4
    RETURN from any  : R = -15,  -> HIGH 1.0   (recharge at the ship)

State values (ASSUMPTION): V(HIGH) = 40, V(LOW) = 12, V(LOST) = -100.

One Bellman step / expected value per action:
    Q(s, a) = R(s, a) + gamma * sum_s' P(s' | s, a) * V(s')
The agent picks the action with the larger Q.
"""
from dataclasses import dataclass

HIGH, LOW, LOST = "HIGH", "LOW", "LOST"
SEARCH, RETURN = "SEARCH", "RETURN"
STATES = (HIGH, LOW)
ACTIONS = (SEARCH, RETURN)

GAMMA = 0.9
FUEL_THRESHOLD = 35          # v3: LOW means fuel < 35

V = {HIGH: 40.0, LOW: 12.0, LOST: -100.0}

# (state, action) -> (reward, {next_state: probability})
MODEL = {
    (HIGH, SEARCH): (-1.0, {HIGH: 0.7, LOW: 0.3}),
    (LOW, SEARCH): (-1.0, {LOW: 0.6, LOST: 0.4}),
    (HIGH, RETURN): (-15.0, {HIGH: 1.0}),
    (LOW, RETURN): (-15.0, {HIGH: 1.0}),
}


@dataclass
class Decision:
    fuel: int
    state: str
    q: dict          # {action: Q-value}
    action: str      # argmax_a Q(state, a)


def state_of(fuel: int) -> str:
    return HIGH if fuel >= FUEL_THRESHOLD else LOW


def q_value(state: str, action: str, values: dict = V) -> float:
    """Q(s, a) = R + gamma * sum P(s'|s,a) * V(s')."""
    reward, nxt = MODEL[(state, action)]
    return reward + GAMMA * sum(p * values[s2] for s2, p in nxt.items())


def q_values(state: str, values: dict = V) -> dict:
    return {a: q_value(state, a, values) for a in ACTIONS}


def decide(fuel: int) -> Decision:
    """Turn the fuel level into a state, evaluate both actions, pick the max."""
    s = state_of(fuel)
    q = q_values(s)
    return Decision(fuel=fuel, state=s, q=q, action=max(ACTIONS, key=lambda a: q[a]))  # tie -> SEARCH


def bellman_update(values: dict = V) -> dict:
    """One value-iteration sweep: V'(s) = max_a Q(s, a); LOST is terminal and keeps its value."""
    new = {s: max(q_values(s, values).values()) for s in STATES}
    new[LOST] = values[LOST]
    return new
