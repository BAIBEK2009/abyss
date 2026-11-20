"""Exam mode (`python main.py --exam`): print every turn as  input -> calc -> output -> why.

    [BAYES] input : P(F4)=0.2310, sonar at F4 -> SILENCE
            calc  : L=0.20 inside 3x3, 0.92 outside; Z=sum L*P=0.7764; P'=L*P/Z
            output: P(F4)=0.0595, best G4: 0.1203 -> 0.1550
            why   : no echo around F4, so belief moves to other cells
"""
from core import world

PAD = " " * 8


def _cell(c) -> str:
    return world.cell_name(tuple(c))


def _block(tag: str, rows) -> str:
    head = f"[{tag}]".ljust(8)
    return "\n".join(f"{head if i == 0 else PAD}{label.ljust(6)}: {text}" for i, (label, text) in enumerate(rows))


def _bayes(b) -> list:
    if b is None:
        return [("input", "no new evidence this turn"), ("calc", "-"), ("output", "belief unchanged"),
                ("why", "only sailing / refuelling")]
    best = f"best {_cell(b['best'])}: {b['best_prior']:.4f} -> {b['best_posterior']:.4f}" if "best" in b else ""
    if b["kind"] == "sonar":
        L = b["L"]
        echo = b["result"] == "echo"
        return [
            ("input", f"P({_cell(b['cell'])})={b['prior']:.4f}, sonar at {_cell(b['cell'])} -> {b['result'].upper()}"),
            ("calc", f"L={L['inside']:.2f} inside 3x3, {L['outside']:.2f} outside; Z=sum L*P={b['Z']:.4f}; P'=L*P/Z"),
            ("output", f"P({_cell(b['cell'])})={b['posterior']:.4f}, {best}"),
            ("why", f"echo around {_cell(b['cell'])}: belief gathers there" if echo
             else f"no echo around {_cell(b['cell'])}: belief moves to other cells"),
        ]
    if b["kind"] == "dive":
        if b["result"] == "box":
            return [("input", f"P({_cell(b['cell'])})={b['prior']:.4f}, camera at {_cell(b['cell'])}"),
                    ("calc", "camera shows the box (p=0.97 when it is there)"), ("output", "FOUND"),
                    ("why", "the search is over")]
        L = b["L"]
        return [
            ("input", f"P({_cell(b['cell'])})={b['prior']:.4f}, camera at {_cell(b['cell'])} -> {b['result'].upper()}"),
            ("calc", f"L={L['d0']:.2f} (d=0), {L['d1']:.2f} (d=1), {L['d2']:.2f} (d>=2); Z={b['Z']:.4f}"),
            ("output", f"P({_cell(b['cell'])})={b['posterior']:.4f}, {best}"),
            ("why", "debris: the box is probably next door" if b["result"] == "debris"
             else "nothing here: its share goes to the other cells"),
        ]
    # radio clue
    return [
        ("input", f"radio clue '{b['clue']['kind']}', reliability {b['clue']['reliability']:.0%}"),
        ("calc", f"L(best)={b['best_L']:.2f}; Z={b['Z']:.4f}; P'=L*P/Z"),
        ("output", best),
        ("why", "a 75 %-reliable hint moves the hills but erases nothing"),
    ]


def _astar(a) -> list:
    if a is None:
        return [("input", "-"), ("calc", "-"), ("output", "no route this turn"), ("why", "-")]
    if a["moves"] == 0:
        return [("input", f"ship already at {_cell(a['goal'])}"), ("calc", "no search needed"),
                ("output", "0 moves"), ("why", "the tool is used right here")]
    route = "->".join(_cell(c) for c in a["path"])
    return [
        ("input", f"start {_cell(a['start'])}, goal {_cell(a['goal'])}, {len(world.REEFS)} reefs"),
        ("calc", f"f=g+h (Manhattan h), expanded {a['expanded']} nodes"),
        ("output", f"{route} ({a['moves']} moves, {a['moves'] * world.MOVE_HOURS} h, "
                   f"{a['moves'] * world.MOVE_FUEL} fuel)"),
        ("why", "shortest safe route around the reefs"),
    ]


def _mdp(m) -> list:
    if m is None:
        return [("input", "-"), ("calc", "-"), ("output", "-"), ("why", "-")]
    q = m["q"]
    return [
        ("input", f"fuel {m['fuel']} -> state {m['state']} (LOW below {m['threshold']})"),
        ("calc", f"Q(SEARCH)={q['SEARCH']:.2f}, Q(RETURN)={q['RETURN']:.2f}, gamma=0.9"),
        ("output", m["action"]),
        ("why", "enough fuel: searching is worth more" if m["action"] == "SEARCH"
         else "low fuel: risk of being towed outweighs searching"),
    ]


def _rival(r) -> str:
    if r is None:
        return "[RIVAL] -"
    return (f"[RIVAL] Poseidon-2 -> {_cell(r['target'])} in {r['arrive_in']:.1f} h, then {r['tool']}"
            f" (finished in {r['tool_end_in']:.1f} h)")


def format_turn(rec: dict, n: int) -> str:
    a = rec["action"]
    if a["type"] == "clue":
        what = f"accept radio clue '{a['id']}'"
    elif a["type"] == "home":
        what = "return to base and refuel"
    else:
        what = f"go to {_cell(a['target'])}" + (f" + {a['tool']}" if a["tool"] else "")
    head = f"=== turn {n} · hour {rec['t0']:g} -> {rec['t1']:g} · {what} ==="
    return "\n".join([head, _block("BAYES", _bayes(rec["bayes"])), _block("A*", _astar(rec["astar"])),
                      _block("MDP", _mdp(rec["mdp"])), _rival(rec["rival"])])
