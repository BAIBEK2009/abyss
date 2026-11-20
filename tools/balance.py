"""Balance acceptance test (CLAUDE.md v3, 5.8): win rate of simple policies over many maps.

    python tools/balance.py [--seeds 400]

Policies (all accept the radio clues):
    advice     always take the officers' joint advice
    dive_only  always dive at the most likely cell
    sonar_only always listen with the sonar at the most likely cell (never dives -> never wins)
    random     random free cell with a random tool, sometimes go home

Requirement: advice >= 58 % and advice better than dive_only.
"""
import argparse
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core import bayes, world  # noqa: E402
from core.game import Game  # noqa: E402


def policy_advice(g, rng):
    return g.advice()["advice"]["action"]


def policy_dive_only(g, rng):
    return {"type": "go", "target": list(bayes.argmax(g.P, near=g.pos)), "tool": "dive"}


def policy_sonar_only(g, rng):
    return {"type": "go", "target": list(bayes.argmax(g.P, near=g.pos)), "tool": "sonar"}


def policy_random(g, rng):
    if g.pos != world.BASE and rng.random() < 0.1:
        return {"type": "home"}
    free = [c for c in world.all_cells() if world.is_free(c)]
    return {"type": "go", "target": list(rng.choice(free)), "tool": rng.choice(["sonar", "dive"])}


POLICIES = {"advice": policy_advice, "dive_only": policy_dive_only,
            "sonar_only": policy_sonar_only, "random": policy_random}


def play(seed: int, policy, max_actions: int = 300) -> Game:
    g = Game(seed=seed, compute_par=False)
    rng = random.Random(f"{seed}:policy")
    for _ in range(max_actions):
        if g.status != "playing":
            break
        for c in g.pending_clues():
            g.clue(c["id"], True)
        g.act(policy(g, rng))
    return g


def win_rates(seeds: int) -> dict:
    out = {}
    for name, policy in POLICIES.items():
        wins = sum(play(s, policy).status == "won" for s in range(seeds))
        out[name] = wins / seeds
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=400)
    args = ap.parse_args()
    rates = win_rates(args.seeds)
    print(f"{'policy':<12} wins ({args.seeds} maps)")
    for name, r in rates.items():
        print(f"{name:<12} {r * 100:5.1f} %")
    ok = rates["advice"] >= 0.58 and rates["advice"] > rates["dive_only"]
    print("\nOK: advice >= 58 % and beats dive_only" if ok else "\nFAIL: tune the thresholds in core/agent.py")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
