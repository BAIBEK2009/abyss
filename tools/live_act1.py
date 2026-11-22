"""A5: a live player from the language screen to the act II card (real Chrome). Dev tool.

    python tools/live_act1.py OUT_DIR [--lang kk|ru|en|all]

Only real input: keys by event.code in the kk/ru/en layout (CDP), mouse clicks on the chart cells and on the
buttons. The game is only READ (where is the cell on screen, what does the finder needle say).
Language screen (keys 1/2/3) -> chapter card (E) -> deck: radio, binoculars (put down, taken again), the
companionway, the chart table -> sonar at Dana's pin -> the fishermen on the radio -> dive 1: the film skipped
with Space, surface with Q at once -> dive 2: the oxygen runs out (sonar pings) -> dive 3: by the finder
needle along the debris trail to the flap, hold E -> Van der Berg -> the act II card.
Prints a table of the steps; exits 1 on a failed step or JS errors.
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
from server import make_server  # noqa: E402
from live_player import Player, seen  # noqa: E402

TASKS = "window.__abyss.state().campaign.tasks"
SPEECH = "!!document.querySelector('.speech:not([hidden])')"
FACE = """([id, dy]) => {
  const w = window.__abyss.walk, d = w.deck, fp = w.fp;
  const eye = d.space.toWorld(fp.pos.x, d.space.eye, fp.pos.z, fp.eyeWorld().clone());
  const p = typeof id === 'string' ? d.space.toWorld(...d.objects[id].look, eye.clone()) : eye.clone().set(...id);
  const dx = p.x - eye.x, dz = p.z - eye.z, dyy = p.y - eye.y + (dy || 0);
  fp.place(fp.pos.x, fp.pos.z, Math.atan2(dx, dz), Math.atan2(dyy, Math.hypot(dx, dz)));
}"""


class Run:
    def __init__(self, page, lang, out):
        self.page, self.lang, self.out = page, lang, out
        self.p = Player(page, layout=lang if lang != "kk" else "kk")
        self.steps = []

    def shot(self, name):
        self.page.screenshot(path=str(self.out / f"a5_{self.lang}_{name}.png"))

    def step(self, name, fn):
        t0 = time.time()
        try:
            fn()
            self.steps.append((name, "ok", f"{time.time() - t0:.0f} s"))
            return True
        except Exception as e:  # noqa: BLE001
            self.steps.append((name, "FAIL", str(e).splitlines()[0][:120]))
            self.shot("fail_" + name.split()[0])
            return False

    # ---------------------------------------------------------------- helpers
    def ev(self, js, *a):
        return self.page.evaluate(js, *a)

    def wait(self, ms):
        self.page.wait_for_timeout(ms)

    def e_until(self, cond, limit=60):
        for _ in range(limit):
            if self.ev(cond):
                return
            self.p.key("KeyE")
            self.wait(420)
        raise AssertionError(f"stuck: {cond}")

    def stand_at(self, thing):
        self.ev(f"() => {{ const o = window.__abyss.walk.deck.objects.{thing}; window.__abyss.walk.fp.place(o.stand[0], o.stand[1] - 0.2, 0, 0); }}")
        self.ev(FACE, [thing, -0.05])
        self.wait(500)

    def table_ui(self, until, limit_s=120):
        """Work through whatever the table shows (lines, cards, who-is-who, coach, radio clue, chapter) until cond
        holds and nothing new has popped up for 1.5 s."""
        t0, calm = time.time(), 0
        while time.time() - t0 < limit_s:
            if self.ev(until) and not self.ev(self.POPUP):
                calm += 1
                if calm >= 4:
                    return
                self.wait(400); continue
            calm = 0
            if seen(self.page, ".chapter"):
                self.p.key("KeyE")
            elif self.ev(SPEECH) or seen(self.page, ".gcards"):
                self.p.key("KeyE")
            elif seen(self.page, "[data-id=who-go]"):
                self.p.key("KeyE")                    # E closes «who is who»
            elif seen(self.page, "[data-id=coach-skip]"):
                self.page.click("[data-id=coach-skip]")
            elif seen(self.page, "[data-id=clue-accept]"):
                self.wait(1200); self.shot("radio_clue"); self.page.click("[data-id=clue-accept]")
            self.wait(450)
        raise AssertionError(f"stuck at the table: {until}")

    POPUP = ("!!document.querySelector('.speech:not([hidden]), .gcards, .chapter:not([hidden]), .intro:not([hidden]), "
             ".coach:not([hidden]), .radio-back:not([hidden])')")

    def click_cell(self, x, y):
        s = self.ev(f"window.__abyss.cellScreen({x}, {y})")
        self.page.mouse.click(s["x"], s["y"])
        self.wait(400)

    def top_cell(self):
        st = self.ev("window.__abyss.state()")
        P = st["P"]
        return max(((x, y) for y in range(10) for x in range(10)), key=lambda c: P[c[1]][c[0]]), st

    def start_dive(self):
        """From the table: the top of the hill, the dive tag, the brief, the film (Space skips it)."""
        (x, y), st = self.top_cell()
        if list(st["pos"]) == [x, y]:
            self.page.click("[data-id=dive_here]")
        else:
            self.click_cell(x, y)
            self.page.click("[data-id=go_dive]")
        self.table_ui("!!document.querySelector('[data-id=dive-start]')", 90)
        self.wait(500)
        self.page.click("[data-id=dive-start]")
        self.page.wait_for_function("document.body.classList.contains('descent')", timeout=20000)
        self.wait(2500)
        self.p.key("Space")
        self.page.wait_for_function("window.__abyss.diveWhere().mode === 'dive'", timeout=40000)
        self.wait(800)

    def back_at_table(self):
        self.page.wait_for_function("!document.body.classList.contains('diving')", timeout=60000)
        self.table_ui("!window.__abyss.busy() && !document.body.classList.contains('diving') && !(" + SPEECH + ")", 60)

    # ---------------------------------------------------------------- the run
    def run(self):
        pg = self.page
        ok = self.step("экран языка (1/2/3) и меню (E — новая игра)", lambda: (
            pg.wait_for_selector(".lang-screen", timeout=30000), self.p.key({"kk": "Digit1", "ru": "Digit2", "en": "Digit3"}[self.lang]),
            pg.wait_for_selector("[data-id=mm-new]", timeout=30000), self.p.key("KeyE"),
            pg.wait_for_selector("body[data-ready='1']", timeout=30000), self.wait(1200)))
        if not ok:
            return
        self.step("карточка «Пролог» (E)", lambda: (self.p.key("KeyE"), pg.wait_for_function("() => window.__abyss.walk.mode === 'deck'", timeout=10000), self.wait(600)))

        def radio():
            self.ev("() => window.__abyss.walk.fp.place(0.2, -6.6, 0, 0)")
            assert self.ev("() => window.__abyss.walk.goTo('radio')")
            pg.wait_for_function(f"() => {SPEECH}", timeout=30000)
            self.e_until(f"{TASKS}[0] && !document.querySelector('.gcards')")
        self.step("рация на мостике (реплики E)", radio)

        def bino():
            self.stand_at("binoculars"); self.p.key("KeyE")
            pg.wait_for_function("() => window.__abyss.walk.mode === 'bino'", timeout=5000)
            self.ev(FACE, [self.ev("() => window.__abyss.walk.deck.targets.heli.toArray()"), 0])
            pg.wait_for_function(f"() => {SPEECH}", timeout=20000)
            self.e_until(f"window.__abyss.walk.debug().stage >= 1 && !({SPEECH})")
            self.p.key("KeyE"); pg.wait_for_function("() => window.__abyss.walk.mode === 'deck'", timeout=5000)
            self.stand_at("binoculars"); self.p.key("KeyE")
            pg.wait_for_function("() => window.__abyss.walk.mode === 'bino'", timeout=5000)
            self.ev(FACE, [self.ev("() => window.__abyss.walk.deck.targets.seat.toArray()"), 0])
            pg.mouse.wheel(0, -600)
            pg.wait_for_function(f"() => {SPEECH}", timeout=20000)
            self.shot("binoculars")
            self.e_until(f"{TASKS}[1] && !({SPEECH})")
            self.p.key("KeyE"); pg.wait_for_function("() => window.__abyss.walk.mode === 'deck'", timeout=5000)
        self.step("бинокль (положить, взять снова)", bino)

        def down():
            assert self.ev("() => window.__abyss.walk.goTo('stairs')")
            pg.wait_for_function("() => window.__abyss.walk.mode === 'cabin'", timeout=40000)
            self.e_until(f"{TASKS}[2] && !({SPEECH})")
            self.shot("cabin")
        self.step("трап → каюта", down)

        def table():
            assert self.ev("() => window.__abyss.walk.goTo('table')")
            pg.wait_for_function("() => window.__abyss.walk.mode === 'table'", timeout=30000)
            pg.wait_for_function("() => window.__abyss.state().campaign.act === 'act1'", timeout=30000)
            self.table_ui("!window.__abyss.busy() && !(" + SPEECH + ") && !!document.querySelector('[data-id=sonar_here], [data-id=go_sonar]')", 90)
            self.shot("table")
        self.step("штурманский стол → акт I", table)

        def sonar():
            tgt = self.ev("window.__abyss.state().advice.vera.target")
            pos = self.ev("window.__abyss.state().pos")
            if list(pos) == list(tgt):
                pg.click("[data-id=sonar_here]")
            else:
                self.click_cell(*tgt); pg.click("[data-id=go_sonar]")
            pg.wait_for_function("(window.__abyss.state().counts?.sonar || 0) > 0 || window.__abyss.state().hours > 0", timeout=30000)
            self.table_ui("!window.__abyss.busy() && !(" + SPEECH + ")", 60)
            # until the fishermen's clue arrives (6 h): more sonar at Dana's pin
            for _ in range(5):
                if self.ev("window.__abyss.state().hours >= 6"):
                    break
                pg.click("[data-id=accept-advice]")
                self.table_ui("!window.__abyss.busy() && !(" + SPEECH + ")", 60)
        self.step("сонар по совету + улика рыбаков", sonar)

        def dive_q():
            self.start_dive()
            self.shot("cockpit")
            self.wait(2000)
            self.p.key("KeyQ")
            self.back_at_table()
        self.step("погружение 1: пропуск Пробелом, всплытие Q", dive_q)

        def dive_o2():
            self.start_dive()
            for _ in range(200):                     # pings cost 3 s of oxygen each
                if not self.ev("document.body.classList.contains('diving')") or self.ev("window.__abyss.diveWhere().mode") != "dive":
                    break
                self.p.key("Space"); self.wait(1900)
            self.back_at_table()
        self.step("погружение 2: кислород кончился", dive_o2)

        def dive_find():
            self.start_dive()
            pg.wait_for_timeout(1200)
            self.p.down("KeyW")
            t0 = time.time()
            while time.time() - t0 < 70 and self.ev("window.__abyss.diveWhere().mode") == "dive":
                if self.ev("!!document.querySelector('.ck-prompt.on, .ck-grab.on')") or self.ev("document.querySelectorAll('.ck-tasks li.done').length >= 2") and self.near():
                    self.p.up("KeyW")
                    self.p.hold("KeyE", 1700)
                    if not self.ev("document.body.classList.contains('diving')") or self.ev("window.__abyss.diveWhere().mode") != "dive":
                        break
                    self.p.down("KeyW")
                fd = self.ev("window.__abyss.diveWhere().bearing") or 0
                if abs(fd) > 10:
                    self.p.hold("KeyA" if fd < 0 else "KeyD", 200)
                self.wait(250)
            self.p.up("KeyW")
            self.shot("flap")
            self.table_ui("window.__abyss.state().campaign.act === 'act2' && !!document.querySelector('.chapter')", 150)
            self.wait(1000); self.shot("act2_card")
        self.step("погружение 3: пеленгатор, цепочка, закрылок (E)", dive_find)

    def near(self):
        w = self.ev("window.__abyss.diveWhere()")
        return w["hint"][0] is not None and w["hint"][0] < 3.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--lang", default="all")
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    langs = ["kk", "ru", "en"] if args.lang == "all" else [args.lang]
    failed = False
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="chrome", headless=True, args=["--use-angle=metal", "--enable-gpu"])
        for lang in langs:
            server = make_server(0)
            threading.Thread(target=server.serve_forever, daemon=True).start()
            page = b.new_page(viewport={"width": 1440, "height": 900})
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: m.type == "error" and errors.append(m.text))
            page.add_init_script("try { if (!sessionStorage.getItem('x')) { localStorage.clear(); sessionStorage.setItem('x', '1'); } localStorage.setItem('abyss.deckHintsDone','1'); } catch (e) {}")
            page.goto(f"http://127.0.0.1:{server.server_address[1]}/")
            r = Run(page, lang, args.out)
            r.run()
            page.close(); server.shutdown()
            print(f"\n== {lang} ==")
            for name, res, note in r.steps:
                print(f"| {name} | {res} | {note} |")
            print("JS errors:", errors or "none")
            failed |= any(s[1] != "ok" for s in r.steps) or bool(errors)
        b.close()
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
