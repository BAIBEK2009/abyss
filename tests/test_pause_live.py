"""A1: the pause stops the game (real Chrome, Playwright). On the deck, during the descent film and under
water: Esc opens the pause, 10 s later the oxygen, the world clock and the hours have not moved.

Skipped when Playwright or Chrome is not installed (`RUN_BROWSER=0` skips it too)."""
import os
import sys
import threading
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
pw_api = pytest.importorskip("playwright.sync_api")
if os.environ.get("RUN_BROWSER") == "0":
    pytest.skip("browser tests off", allow_module_level=True)
from server import make_server  # noqa: E402

SHOTS = Path(__file__).resolve().parent.parent / "screenshots"


@pytest.fixture(scope="module")
def page():
    server = make_server(0, campaign=True)
    g = server.game
    for ev in ("start", "radio_heard", "binoculars", "enter_cabin", "sit_at_table"):
        g.story_event(ev)
    g.pop_story()
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_address[1]}/?lang=ru&nointro=1"
    errors = []
    with pw_api.sync_playwright() as pw:
        try:
            b = pw.chromium.launch(channel="chrome", headless=True, args=["--use-angle=metal", "--enable-gpu"])
        except Exception as e:  # pragma: no cover
            pytest.skip(f"no Chrome: {e}")
        pg = b.new_page(viewport={"width": 1280, "height": 800})
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.add_init_script("try { localStorage.setItem('abyss.coachDone','1'); localStorage.setItem('abyss.introDone','1'); localStorage.setItem('abyss.deckHintsDone','1'); } catch (e) {}")
        pg.goto(url)
        pg.wait_for_selector("body[data-ready='1']", timeout=30000)
        pg.wait_for_timeout(1200)
        pg.errors = errors
        yield pg
        b.close()
    server.shutdown()


def paused_for(page, ms, probe):
    """Open the pause with Esc, wait ms, read probe() before and after, close it with «Continue»."""
    page.keyboard.press("Escape")
    page.wait_for_selector(".menu-screen:not([hidden])", timeout=3000)
    page.wait_for_timeout(300)
    before = page.evaluate(probe)
    page.wait_for_timeout(ms)
    after = page.evaluate(probe)
    assert page.evaluate("window.__clock.paused")
    return before, after


def resume(page):
    page.click("[data-id=menu-continue]")
    page.wait_for_timeout(300)
    assert not page.evaluate("window.__clock.paused")


PROBE = "({t: window.__abyss.view.time, h: window.__abyss.state().beacon_left, d: window.__abyss.diveWhere()})"


def test_pause_on_deck_dive_and_descent(page):
    page.evaluate("window.__abyss.walk.enterDeckNow({x: 0.6, z: -6.0, yaw: Math.PI})")
    page.wait_for_timeout(800)
    a, b = paused_for(page, 4000, PROBE)
    assert a["t"] == b["t"], "the deck kept moving in the pause"
    resume(page)
    t0 = page.evaluate("window.__abyss.view.time")
    page.wait_for_timeout(500)
    assert page.evaluate("window.__abyss.view.time") > t0, "the world did not come back after «Continue»"

    # the descent film: launch Nerpa, pause in the middle of it
    page.evaluate("window.__abyss.walk.goTo('nerpa')")
    for _ in range(160):
        if page.evaluate("!!document.querySelector('[data-id=dive-start]')"):
            break
        if page.evaluate("!!document.querySelector('.speech:not([hidden])')"):
            page.keyboard.press("Enter")
        page.wait_for_timeout(300)
    page.click("[data-id=dive-start]")
    page.wait_for_timeout(5000)
    assert page.evaluate("document.body.classList.contains('descent')")
    a, b = paused_for(page, 5000, PROBE)
    assert a["t"] == b["t"], "the descent film kept playing in the pause"
    resume(page)
    assert page.evaluate("document.body.classList.contains('descent')"), "Esc must not skip the film"
    page.keyboard.press("Space")                                    # skip the rest of the film

    # under water: the oxygen stands still for 10 s
    page.wait_for_selector("[data-id=surface]", state="visible", timeout=30000)
    page.wait_for_function("window.__abyss.diveWhere().mode === 'dive'", timeout=20000)
    page.wait_for_timeout(1500)
    a, b = paused_for(page, 10000, PROBE)
    SHOTS.mkdir(exist_ok=True)
    page.screenshot(path=str(SHOTS / "final_pause_underwater.png"))
    assert a["d"]["o2"] == b["d"]["o2"], f"oxygen ticked in the pause: {a['d']['o2']} -> {b['d']['o2']}"
    assert a["t"] == b["t"] and a["h"] == b["h"]
    resume(page)
    o = page.evaluate("window.__abyss.diveWhere().o2")
    page.wait_for_timeout(1500)
    assert page.evaluate("window.__abyss.diveWhere().o2") < o, "the oxygen did not run again after «Continue»"
    assert not page.errors, page.errors
