"""B6 / B7: the campaign goes from the prologue to each of the four endings in real Chrome (the demo,
kk / ru / en, keys by event.code in the Russian layout), and a save in localStorage survives a server restart."""
import os
import socket
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

SHOTS = ROOT / "screenshots"
ACT = "window.__abyss.state().campaign.act"


def launch(pw):
    try:
        return pw.chromium.launch(channel="chrome", headless=True, args=["--use-angle=metal", "--enable-gpu"])
    except Exception as e:  # pragma: no cover
        pytest.skip(f"no Chrome: {e}")


def open_page(b, url, errors, init="try { localStorage.clear(); localStorage.setItem('abyss.deckHintsDone','1'); } catch (e) {}"):
    page = b.new_page(viewport={"width": 1280, "height": 800})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    if init:
        page.add_init_script(init)
    page.goto(url)
    page.wait_for_selector("body[data-ready='1']", timeout=30000)
    return page


def skip(page, p, to_act, limit=80):
    """Press «skip to the next act» (and E on chapter cards / lines) until the campaign is in to_act."""
    for _ in range(limit):
        if page.evaluate(f"{ACT} === '{to_act}'"):
            return
        if page.evaluate("!!document.querySelector('.choice-back')"):
            return
        if page.evaluate("!!document.querySelector('.chapter:not([hidden]), .speech:not([hidden]), .intro:not([hidden]), .gcards, .coach:not([hidden])')"):
            p.key("KeyE")
        elif page.evaluate("(() => { const b = document.querySelector('[data-id=skip-act]'); return !!b && !b.hidden && !b.disabled && getComputedStyle(b).display !== 'none'; })()"):
            page.click("[data-id=skip-act]")
        page.wait_for_timeout(500)
    page.screenshot(path=str(SHOTS / f"fail_skip_{to_act}.png"))
    raise AssertionError(f"stuck before {to_act}: act {page.evaluate(ACT)}")


@pytest.mark.parametrize("lang,ending", [("kk", "investigators"), ("ru", "public"), ("en", "sell"), ("ru", "lost")])
def test_demo_campaign_to_each_ending(lang, ending):
    server = make_server(0, demo=True)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    errors = []
    with pw_api.sync_playwright() as pw:
        b = launch(pw)
        page = open_page(b, f"http://127.0.0.1:{server.server_address[1]}/?lang={lang}&demo=1", errors)
        p = Player(page, layout="en" if lang == "en" else "ru")
        page.wait_for_timeout(800)
        skip(page, p, "act1")
        if ending == "lost":                               # the beacon runs out before anything is raised
            page.wait_for_function("!window.__abyss.busy()", timeout=30000)
            skip(page, p, "act1", 5)
            calm = 0
            for _ in range(80):                            # the story settles: no card, line or window for 2 s
                if page.evaluate("!!document.querySelector('.speech:not([hidden]), .chapter, .gcards, .intro:not([hidden])') || window.__abyss.busy()"):
                    calm = 0; p.key("KeyE")
                else:
                    calm += 1
                    if calm >= 5:
                        break
                page.wait_for_timeout(400)
            server.game.hours = 119.0
            page.click("[data-id=sonar_here]")
        else:
            skip(page, p, "act3")
            page.wait_for_selector(".choice-back", timeout=30000)
            p.key("Digit1")                                # act III: the voice first
            page.wait_for_function(f"window.__abyss.state().campaign.choices.act3 === 'cvr_first'", timeout=10000)
            skip(page, p, "act4")
            page.wait_for_selector(".choice-back", timeout=60000)
            if lang == "ru" and ending == "public":
                page.screenshot(path=str(SHOTS / "m10_choice_act4_live.png"))
            p.key({"investigators": "Digit1", "public": "Digit2", "sell": "Digit3"}[ending])
        page.wait_for_selector(".ending.talk", timeout=40000)
        assert page.evaluate("window.__abyss.state().campaign.ending") == ending
        b.close()
    server.shutdown()
    assert not errors, errors


def test_save_survives_a_server_restart_and_old_saves_are_dropped():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]
    server = make_server(port, demo=True)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    errors = []
    with pw_api.sync_playwright() as pw:
        b = launch(pw)
        ctx = b.new_context(viewport={"width": 1280, "height": 800})
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"http://127.0.0.1:{port}/?lang=ru&demo=1")
        page.wait_for_selector("body[data-ready='1']", timeout=30000)
        p = Player(page, layout="ru")
        skip(page, p, "act2")
        hours = page.evaluate("window.__abyss.state().hours")
        assert page.evaluate("JSON.parse(localStorage.getItem('abyss.save')).log.length") > 0
        server.shutdown(); server.server_close()
        server = make_server(port)                         # a fresh server: the prologue of a new game
        threading.Thread(target=server.serve_forever, daemon=True).start()
        page.goto(f"http://127.0.0.1:{port}/?lang=ru")
        page.wait_for_selector("[data-id=mm-continue]", timeout=30000)
        p.key("Enter")                                     # Continue: the save is replayed on the server
        page.wait_for_selector("body[data-ready='1']", timeout=30000)
        page.wait_for_timeout(800)
        assert page.evaluate(ACT) == "act2" and page.evaluate("window.__abyss.state().hours") == hours
        # a save from an older version: "start again", not a crash
        page.evaluate("localStorage.setItem('abyss.save', JSON.stringify({v: 1, seed: 272, log: [['act', {}, false]]}))")
        server.game.log.clear()
        page.goto(f"http://127.0.0.1:{port}/?lang=ru")
        page.wait_for_selector("[data-id=mm-continue]", timeout=30000)
        page.click("[data-id=mm-continue]")
        page.wait_for_selector(".mm-note:not(:empty)", timeout=5000)
        assert not page.evaluate("!!document.querySelector('[data-id=mm-continue]')")
        b.close()
    server.shutdown()
    assert not errors, errors
