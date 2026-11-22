"""A2: a live player goes through the prologue (real Chrome): real keys by event.code in the kk / ru / en
layouts. E pages the lines, E on a thing that is not usable yet says why, the binoculars can be put down
half-way and taken again (the lines go on), and taken again after the tick.
Walking is the game's own click-to-walk (the A* path a click on a thing starts)."""
import os
import sys
import threading
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "tools"))
pw_api = pytest.importorskip("playwright.sync_api")
if os.environ.get("RUN_BROWSER") == "0":
    pytest.skip("browser tests off", allow_module_level=True)
from server import make_server  # noqa: E402
from live_player import Player  # noqa: E402

TASKS = "window.__abyss.state().campaign.tasks"
SPEECH = "!!document.querySelector('.speech:not([hidden])')"
FACE = """([id, dy]) => {
  const w = window.__abyss.walk, d = w.deck, fp = w.fp;
  const eye = d.space.toWorld(fp.pos.x, d.space.eye, fp.pos.z, fp.eyeWorld().clone());
  const p = typeof id === 'string' ? d.space.toWorld(...d.objects[id].look, eye.clone()) : eye.clone().set(...id);
  const dx = p.x - eye.x, dz = p.z - eye.z, dyy = p.y - eye.y + (dy || 0);
  fp.place(fp.pos.x, fp.pos.z, Math.atan2(dx, dz), Math.atan2(dyy, Math.hypot(dx, dz)));
}"""


def e_until(p, cond, limit=50):
    """Press E (the line goes on) until cond_js holds."""
    for _ in range(limit):
        if p.page.evaluate(cond):
            return
        p.key("KeyE")
        p.page.wait_for_timeout(420)
    raise AssertionError(f"stuck waiting for {cond}")


def stand_at(page, thing, back=0.2):
    page.evaluate(f"() => {{ const o = window.__abyss.walk.deck.objects.{thing}; window.__abyss.walk.fp.place(o.stand[0], o.stand[1] - {back}, 0, 0); }}")
    page.evaluate(FACE, [thing, -0.05])
    page.wait_for_timeout(500)


@pytest.mark.parametrize("lang", ["kk", "ru", "en"])
def test_live_prologue(lang):
    server = make_server(0)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_address[1]}/?lang={lang}"
    errors = []
    with pw_api.sync_playwright() as pw:
        try:
            b = pw.chromium.launch(channel="chrome", headless=True, args=["--use-angle=metal", "--enable-gpu"])
        except Exception as e:  # pragma: no cover
            pytest.skip(f"no Chrome: {e}")
        page = b.new_page(viewport={"width": 1280, "height": 800})
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.add_init_script("try { localStorage.setItem('abyss.deckHintsDone','1'); } catch (e) {}")
        page.goto(url)
        page.wait_for_selector("body[data-ready='1']", timeout=30000)
        p = Player(page, layout="ru" if lang != "en" else "en")   # the Russian layout: E types «у»
        page.wait_for_timeout(1000)
        p.key("KeyE")                                     # E skips the chapter card
        page.wait_for_function("() => window.__abyss.walk.mode === 'deck'", timeout=10000)
        page.wait_for_timeout(800)

        # E on the binoculars before the radio: a reason, not silence
        stand_at(page, "binoculars")
        assert page.evaluate("!!document.querySelector('.fp-prompt:not([hidden])')"), "no [E] prompt on the binoculars"
        p.key("KeyE")
        page.wait_for_timeout(300)
        assert page.evaluate("!!document.querySelector('.fp-note:not([hidden])')"), "E did nothing on the binoculars"
        assert page.evaluate("window.__abyss.walk.mode") == "deck"

        # 1) the radio: walk there, E answers, E pages the lines, E closes the goal cards
        page.evaluate("() => window.__abyss.walk.fp.place(0.2, -6.6, 0, 0)")
        assert page.evaluate("() => window.__abyss.walk.goTo('radio')")
        page.wait_for_function(f"() => {SPEECH}", timeout=30000)
        e_until(p, f"{TASKS}[0] && !document.querySelector('.gcards')")

        # 2) the binoculars: the first line, put them down, take them again, the rest of the lines
        stand_at(page, "binoculars")
        p.key("KeyE")
        page.wait_for_function("() => window.__abyss.walk.mode === 'bino'", timeout=5000)
        page.evaluate(FACE, [page.evaluate("() => window.__abyss.walk.deck.targets.heli.toArray()"), 0])
        page.wait_for_function(f"() => {SPEECH}", timeout=20000)
        e_until(p, f"window.__abyss.walk.debug().stage >= 1 && !({SPEECH})")
        p.key("KeyE")                                     # put them down before the wreck is seen
        page.wait_for_function("() => window.__abyss.walk.mode === 'deck'", timeout=5000)
        assert not page.evaluate(f"{TASKS}[1]"), "the tick came before all the binocular lines"
        stand_at(page, "binoculars")
        p.key("KeyE")                                     # and take them again
        page.wait_for_function("() => window.__abyss.walk.mode === 'bino'", timeout=5000)
        assert page.evaluate("window.__abyss.walk.debug().stage") == 1, "the lines started over"
        page.evaluate(FACE, [page.evaluate("() => window.__abyss.walk.deck.targets.seat.toArray()"), 0])
        page.mouse.wheel(0, -600)
        page.wait_for_function(f"() => {SPEECH}", timeout=20000)
        e_until(p, f"{TASKS}[1] && !({SPEECH})")
        p.key("KeyE")
        page.wait_for_function("() => window.__abyss.walk.mode === 'deck'", timeout=5000)
        stand_at(page, "binoculars")                      # after the tick they still come off the shelf
        p.key("KeyE")
        page.wait_for_function("() => window.__abyss.walk.mode === 'bino'", timeout=5000)
        page.wait_for_timeout(300)
        p.key("KeyE")
        page.wait_for_function("() => window.__abyss.walk.mode === 'deck'", timeout=5000)

        # 3) down the companionway, 4) the chart table
        assert page.evaluate("() => window.__abyss.walk.goTo('stairs')")
        page.wait_for_function("() => window.__abyss.walk.mode === 'cabin'", timeout=40000)
        e_until(p, f"{TASKS}[2] && !({SPEECH})")
        assert page.evaluate("() => window.__abyss.walk.goTo('table')")
        page.wait_for_function("() => window.__abyss.walk.mode === 'table'", timeout=30000)
        page.wait_for_function("() => window.__abyss.state().campaign.act === 'act1'", timeout=30000)
        b.close()
    server.shutdown()
    assert not errors, errors
