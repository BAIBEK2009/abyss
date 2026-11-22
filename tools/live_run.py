"""The whole game as a live player (Playwright, real Chrome): only real keys (by event.code, typed in the en / ru /
kk layout), mouse drags, clicks and the wheel. The state is only READ through window.__abyss.

    python tools/live_run.py OUT_DIR [--lang ru] [--layout ru] [--save fresh|old] [--o2fail] [--headed]

Stages: the language screen (fresh) -> the prologue on foot (hints, ◆, WASD, Shift, drag, click on the deck, the
radio with Enter and clicks, the goal cards, the binoculars with the wheel, the companionway, the cabin, the table)
-> the table (a cell, a tag with the sonar, the officers' drawer on Б/B, accept the advice, hints, the menu and a
language change, the autopilot on/off) -> act I: dives from the table (brief, skip the film with Space, the finder,
the trail of debris, a ping, the flap with E held; --o2fail: one dive left to run out of oxygen; one surfacing with
Q) until the chapter card «Act II».
Prints a table of checks; exits 1 if any failed or the page logged errors.
"""
import argparse
import math
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "tools"))
from playwright.sync_api import sync_playwright  # noqa: E402
from live_player import Player, seen  # noqa: E402
from server import make_server  # noqa: E402

SPEECH = ".speech:not([hidden])"


class Run:
    def __init__(self, page, out, lang, layout):
        self.page, self.out, self.lang = page, out, lang
        self.p = Player(page, layout)
        self.checks, self.n = [], 0

    def check(self, name, ok, note=""):
        self.checks.append((name, bool(ok), note))
        print(("  ok   " if ok else "  FAIL ") + name + (f"  ({note})" if note else ""), flush=True)
        if not ok:
            self.shot("FAIL_" + name.replace(" ", "_").replace("/", "-")[:40])
        return ok

    def shot(self, name):
        self.n += 1
        self.page.screenshot(path=str(self.out / f"{self.lang}_{self.n:02d}_{name}.png"))

    def ev(self, js, arg=None):
        return self.page.evaluate(js, arg) if arg is not None else self.page.evaluate(js)

    def wait_for(self, js, timeout_s=20, step=250):
        t0 = time.time()
        while time.time() - t0 < timeout_s:
            try:
                if self.ev(js):
                    return True
            except Exception:
                pass
            self.page.wait_for_timeout(step)
        return False

    def tasks(self):
        return self.ev("window.__abyss.state().campaign?.tasks || []")

    def lines(self, until_js, limit=60, click_every=3):
        """Advance the story lines: Enter, and every few lines a click on the window, until the condition."""
        for i in range(limit):
            if self.ev(until_js):
                return True
            if seen(self.page, SPEECH):
                if i % click_every == click_every - 1:
                    self.page.click(".speech")
                else:
                    self.p.key("Enter")
            self.page.wait_for_timeout(450)
        return self.ev(until_js)

    def click_seen(self, sel, name):
        ok = self.wait_for(f"(() => {{ const f = {self._seen_fn()}; return f({sel!r}); }})()", 15)
        self.check(f"{name}: visible", ok)
        if ok:
            self.page.click(sel)
        return ok

    def _seen_fn(self):
        from live_player import SEEN_JS
        return SEEN_JS


# ---------------------------------------------------------------------------------------------- stages
def stage_language(r: Run, save):
    pg = r.page
    if save == "fresh":
        ok = r.wait_for("!!document.querySelector('.lang-screen')", 15)
        r.check("language screen shown on the first launch", ok and seen(pg, ".lang-card"))
        r.shot("language")
        idx = {"kk": "Digit1", "ru": "Digit2", "en": "Digit3"}[r.lang]
        r.p.key(idx)                                     # by the physical digit key (the kk layout types letters there)
        r.check("language chosen with the digit key", r.wait_for("!document.querySelector('.lang-screen.on')", 5))
    else:
        r.check("old save: no language screen", not seen(pg, ".lang-card"))
    r.check("data ready", r.wait_for("document.body.dataset.ready === '1'", 30))


def stage_deck(r: Run, save):
    pg, p = r.page, r.p
    r.check("chapter card «Prologue» shown", r.wait_for("window.__abyss.table && document.querySelector('.chapter:not([hidden])')", 8) or save == "old")
    r.wait_for("!document.querySelector('.chapter:not([hidden])')", 10)
    r.check("on the deck", p.mode() == "deck")
    pg.wait_for_timeout(800)
    if save == "fresh":
        r.check("deck hints shown", r.wait_for(f"({r._seen_fn()})('.fp-hint')", 8))
    r.check("waypoint ◆ shown", r.wait_for(f"({r._seen_fn()})('.fp-mark')", 5))
    r.shot("deck")
    x0, z0, yaw0, _ = p.pos()
    p.hold("KeyW", 700); x1, z1, *_ = p.pos()
    walked = math.hypot(x1 - x0, z1 - z0)
    r.check("W walks", walked > 0.5, f"{walked:.2f} m")
    p.hold("KeyS", 500); p.hold("KeyA", 400); p.hold("KeyD", 400)
    p.down("ShiftLeft"); a = p.pos(); p.hold("KeyW", 700); b = p.pos(); p.up("ShiftLeft")
    ran = math.hypot(b[0] - a[0], b[1] - a[1])
    r.check("Shift runs (faster than walking)", ran > walked * 1.4, f"{ran:.2f} m vs {walked:.2f}")
    p.drag(200, 0); yaw1 = p.pos()[2]
    r.check("mouse drag turns the head", abs(yaw1 - b[2]) > 0.2)
    # a click on the deck: the captain walks there
    p.turn_to(math.pi, -0.45)
    a = p.pos(); pg.mouse.click(720, 640); pg.wait_for_timeout(2500); b = p.pos()
    r.check("a click on the deck walks there", math.hypot(b[0] - a[0], b[1] - a[1]) > 0.5)


def to_bridge(r: Run, stand):
    for wp in [(0.0, 1.8), (0.0, 4.2), (0.0, 7.4), tuple(stand)]:
        r.p.walk_to(*wp)


def stage_radio(r: Run):
    pg, p = r.page, r.p
    th = p.thing("radio")
    p.walk_to(0.0, -1.0)
    to_bridge(r, th["stand"])
    p.face_point(*th["look"]); pg.wait_for_timeout(400)
    r.check("radio in focus with [E]", p.focus() == "radio" and seen(pg, ".fp-prompt"))
    r.shot("radio_prompt")
    p.key("KeyE")
    r.check("E on the radio: Aigerim speaks", r.wait_for(f"({r._seen_fn()})('{SPEECH}')", 8))
    r.shot("radio_line")
    r.check("the lines go on (Enter and click) to the goal cards", r.lines(f"({r._seen_fn()})('[data-id=cards-ok]')"))
    r.shot("goal_cards")
    if seen(pg, "[data-id=cards-ok]"):
        pg.wait_for_timeout(1300); pg.click("[data-id=cards-ok]")
    r.check("task 1 ticked (radio)", r.wait_for("window.__abyss.state().campaign.tasks[0]", 10))


def world_face(r: Run, getter):
    """Turn the head to a world point (the binoculars' targets) by dragging."""
    for _ in range(3):
        yaw, pitch = r.ev(f"""(() => {{ const w = window.__abyss.walk, fp = w.fp, cam = window.__abyss.view.camera;
            const t = {getter}; const dx = t.x - cam.position.x, dz = t.z - cam.position.z, dy = t.y - cam.position.y;
            return [Math.atan2(dx, dz), Math.atan2(dy, Math.hypot(dx, dz))]; }})()""")
        r.p.turn_to(yaw, pitch, tol=0.01)
        r.page.wait_for_timeout(300)


def stage_binoculars(r: Run):
    pg, p = r.page, r.p
    th = p.thing("binoculars")
    for wp in [(1.5, 10.5), tuple(th["stand"])]:
        p.walk_to(*wp)
    p.face_point(*th["look"]); pg.wait_for_timeout(400)
    r.check("binoculars in focus", p.focus() == "binoculars")
    p.key("KeyE")
    r.check("E: binoculars taken", r.wait_for("window.__abyss.walk.mode === 'bino'", 5))
    z0 = r.ev("window.__abyss.walk.debug().zoom")
    pg.mouse.move(720, 450); pg.mouse.wheel(0, -500); pg.wait_for_timeout(500)
    z1 = r.ev("window.__abyss.walk.debug().zoom")
    r.check("wheel zooms the binoculars", z1 > z0, f"{z0:.1f} -> {z1:.1f}")
    world_face(r, "window.__abyss.walk.deck.targets.heli")
    r.check("the helicopter seen: a line", r.wait_for(f"({r._seen_fn()})('{SPEECH}')", 15))
    r.shot("binoculars")
    r.lines("window.__abyss.walk.debug().stage >= 1 && !document.querySelector('.speech:not([hidden])')")
    world_face(r, "window.__abyss.walk.deck.targets.seat")
    pg.mouse.wheel(0, -600)
    r.check("the seat seen: task 2 ticked", r.lines("window.__abyss.state().campaign.tasks[1]"))
    p.key("KeyE")
    r.check("E: binoculars put down", r.wait_for("window.__abyss.walk.mode === 'deck'", 5))


def stage_down(r: Run):
    pg, p = r.page, r.p
    th = p.thing("stairs")
    for wp in [(1.5, 9.0), (0.0, 7.4), (0.0, 4.2), (0.0, 1.8), (-1.0, 0.2), tuple(th["stand"])]:
        p.walk_to(*wp)
    p.face_point(*th["look"]); pg.wait_for_timeout(400)
    r.check("companionway in focus", p.focus() == "stairs")
    p.key("KeyE")
    r.check("E: down to the cabin", r.wait_for("window.__abyss.walk.mode === 'cabin'", 10))
    r.check("the officers introduce themselves, task 3", r.lines("window.__abyss.state().campaign.tasks[2] && !document.querySelector('.speech:not([hidden])')"))
    r.shot("cabin")


def stage_table(r: Run):
    pg, p = r.page, r.p
    th = p.thing("table")
    p.walk_to(*th["stand"]); p.face_point(*th["look"]); pg.wait_for_timeout(400)
    r.check("chart table in focus", p.focus() == "table")
    p.key("KeyE")
    r.check("E: sit at the table", r.wait_for("window.__abyss.walk.mode === 'table'", 8))
    r.check("act I begins", r.lines("window.__abyss.state().campaign.act === 'act1'"))
    r.wait_for("!document.querySelector('.chapter:not([hidden])')", 8)
    if seen(pg, "[data-id=who-go]"):
        r.check("«Who is who» window", True); pg.click("[data-id=who-go]")
    r.lines(f"!({r._seen_fn()})('{SPEECH}')", limit=20)
    r.check("table HUD visible", r.wait_for(f"({r._seen_fn()})('[data-id=accept-advice]')", 15))
    r.shot("table")


def stage_table_ui(r: Run):
    pg, p = r.page, r.p
    seen_ = lambda s: seen(pg, s)
    # the officers' drawer: hold B / Б (in the ru and kk layouts Б is the Comma key)
    key = "KeyB" if r.lang == "en" else "Comma"
    p.down(key); pg.wait_for_timeout(700)
    r.check(f"officers' drawer opens on hold ({key})", r.ev("document.body.classList.contains('peek')"))
    r.shot("officers")
    p.up(key); pg.wait_for_timeout(600)
    r.check("officers' drawer closes on release", not r.ev("document.body.classList.contains('peek')"))
    # hints (the coach)
    pg.click("[data-id=hints]")
    r.check("hints: coach opens", r.wait_for(f"({r._seen_fn()})('[data-id=coach-next]')", 5))
    pg.click("[data-id=coach-next]"); pg.wait_for_timeout(300)
    if seen_("[data-id=coach-skip]"): pg.click("[data-id=coach-skip]")
    r.check("hints: coach closes", r.wait_for("!document.querySelector('[data-id=coach-skip]') || !(" + r._seen_fn() + ")('[data-id=coach-skip]')", 5))
    # a cell on the map -> the tags with prices
    cell = r.ev("(() => { const s = window.__abyss.state(); let best = null, bp = -1; s.P.forEach((row, x) => row.forEach((v, y) => { if (v > bp) { bp = v; best = [x, y]; } })); return best; })()")
    xy = r.ev("(c) => window.__abyss.cellScreen(c[0], c[1])", cell)
    pg.mouse.click(xy["x"], xy["y"]); pg.wait_for_timeout(800)
    r.check("a cell click shows the tags", seen_("[data-id=go_sonar]"))
    r.shot("tags")
    pg.mouse.click(xy["x"], xy["y"]); pg.wait_for_timeout(500)       # the second click takes the course off
    # the menu (Esc) and back
    p.key("Escape"); pg.wait_for_timeout(600)
    r.check("Esc opens the menu", seen_("[data-id=menu-continue]"))
    if seen_("[data-id=menu-continue]"): pg.click("[data-id=menu-continue]"); pg.wait_for_timeout(500)
    r.check("menu closes", not seen_("[data-id=menu-continue]"))
    # the autopilot on and off at once (it would play the act)
    pg.click("[data-id=autopilot]"); pg.wait_for_timeout(300)
    on = r.ev("document.querySelector('[data-id=autopilot]').classList.contains('active')")
    pg.click("[data-id=autopilot]")
    r.check("autopilot toggles on and off", on and r.wait_for("!document.querySelector('[data-id=autopilot]').classList.contains('active')", 5))
    r.wait_for("!window.__abyss.busy()", 60)
    r.lines(f"!({r._seen_fn()})('{SPEECH}') && !window.__abyss.busy()", limit=30)


def stage_dive(r: Run, how):
    """One live dive from the table by the officers' advice (or the tag over the hill top). how: find | surface | o2."""
    pg, p = r.page, r.p
    # the advice until it is a dive (the sonar first)
    for _ in range(6):
        r.lines(f"!({r._seen_fn()})('{SPEECH}') && !window.__abyss.busy()", limit=30)
        if seen(pg, "[data-id=clue-accept]"):
            pg.click("[data-id=clue-accept]"); r.wait_for("!window.__abyss.busy()", 30); continue
        tool = r.ev("window.__abyss.state().advice?.tool ?? null")
        if not r.wait_for(f"({r._seen_fn()})('[data-id=accept-advice]')", 10):
            break
        pg.click("[data-id=accept-advice]")
        if r.wait_for("!!document.querySelector('[data-id=dive-start]')", 25 if tool != "sonar" else 4):
            break
        r.wait_for("!window.__abyss.busy()", 40)
    ok = r.wait_for(f"({r._seen_fn()})('[data-id=dive-start]')", 30)
    r.check(f"dive ({how}): the brief", ok)
    if not ok:
        return
    r.shot(f"brief_{how}")
    pg.click("[data-id=dive-start]")
    pg.wait_for_timeout(3000)
    p.key("Space")                                          # skip the film
    r.check(f"dive ({how}): Space skips the film to the cockpit", r.wait_for(f"({r._seen_fn()})('[data-id=surface]')", 20))
    pg.wait_for_timeout(1500)
    r.check(f"dive ({how}): the finder is on", seen(pg, "[data-id=finder]"))
    if how == "o2":
        r.check("oxygen runs out: back at the table", r.wait_for("window.__abyss.walk.mode === 'table' && !document.body.classList.contains('diving')", 120))
        return
    if how == "surface":
        p.key("KeyQ")
        r.check("Q surfaces", r.wait_for("!document.body.classList.contains('diving')", 25))
        r.wait_for("!window.__abyss.busy()", 40)
        return
    p.key("Space"); pg.wait_for_timeout(600)                # a ping
    # steer by the finder's needle, by hand
    found = False
    for _ in range(80):
        w = r.ev("window.__abyss.diveWhere()")
        if r.ev("document.querySelector('.ck-tasks li:nth-child(1).done') !== null"):
            r.checks and None
        if seen(pg, ".ck-prompt.on"):
            found = True; break
        b = w.get("bearing") or 0
        if b < -12: p.hold("KeyA", 180)
        elif b > 12: p.hold("KeyD", 180)
        p.hold("KeyW", 450)
    r.check("trail of debris: first piece ticked", r.ev("!!document.querySelector('.ck-tasks li.done')"))
    r.check("the finder led to the find: [hold E]", found)
    r.shot("find")
    if found:
        p.hold("KeyE", 1700)
        r.check("E held: the find in the arm, surfacing", r.wait_for("!document.body.classList.contains('diving')", 25))
    r.wait_for("!window.__abyss.busy()", 60)


def stage_act_end(r: Run):
    pg = r.page
    ok = r.lines("!!document.querySelector('.chapter:not([hidden])') || window.__abyss.state().campaign.act === 'act2'", limit=80)
    r.check("act I ends: chapter card «Act II»", ok)
    r.shot("act2_card")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--lang", default="ru")
    ap.add_argument("--layout", default=None)
    ap.add_argument("--save", default="fresh", choices=["fresh", "old"])
    ap.add_argument("--o2fail", action="store_true")
    ap.add_argument("--headed", action="store_true")
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    server = make_server(0)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_address[1]}/"
    errors = []
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="chrome", headless=not a.headed, args=["--use-angle=metal", "--enable-gpu"])
        page = b.new_page(viewport={"width": 1440, "height": 900})
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e} | {(e.stack or '')[:300]}"))
        page.on("console", lambda m: m.type == "error" and errors.append(f"console: {m.text}"))
        if a.save == "old":      # what the earlier versions left in localStorage
            page.add_init_script(f"try {{ if (!sessionStorage.getItem('seeded')) {{ sessionStorage.setItem('seeded', '1'); "
                                 f"localStorage.setItem('abyss.lang', '{a.lang}'); localStorage.setItem('abyss.introDone', '1'); "
                                 f"localStorage.setItem('abyss.coachDone', '1'); localStorage.setItem('abyss.deckHintsDone', '1'); }} }} catch (e) {{}}")
        page.goto(url)
        r = Run(page, a.out, a.lang, a.layout or a.lang)
        stages = [("language", lambda: stage_language(r, a.save)), ("deck", lambda: stage_deck(r, a.save)),
                  ("radio", lambda: stage_radio(r)), ("binoculars", lambda: stage_binoculars(r)),
                  ("down", lambda: stage_down(r)), ("table", lambda: stage_table(r)), ("table ui", lambda: stage_table_ui(r))]
        if a.o2fail:
            stages.append(("dive o2", lambda: stage_dive(r, "o2")))
        stages += [("dive find", lambda: stage_dive(r, "find")), ("act end", lambda: stage_act_end(r))]
        for name, fn in stages:
            print(f"== {name}", flush=True)
            try:
                fn()
            except Exception as e:      # a stage broke: record it, go on if we can
                r.check(f"stage {name} ran", False, f"{type(e).__name__}: {str(e)[:160]}")
        b.close()
    server.shutdown()
    failed = [c for c in r.checks if not c[1]]
    print(f"\n{a.lang} / layout {a.layout or a.lang} / {a.save}: {len(r.checks) - len(failed)} ok, {len(failed)} failed; JS errors: {errors or 'none'}")
    sys.exit(1 if failed or errors else 0)


if __name__ == "__main__":
    main()
