"""The whole game through its real interface in Chrome (Playwright), with a screenshot of every step
(CLAUDE.md 13.4, adapted to v3.2): the prologue on foot (deck -> radio -> binoculars -> cabin -> table),
three moves by hand at the table, a dive launched from the deck, a radio clue, then the autopilot to the
results. Buttons are found by data-id only, so the scenario runs in all three languages.

    python tools/ui_scenario.py OUT_DIR [--lang kk|ru|en|all] [--headed]

Fails loudly on any JavaScript error in the page.
"""
import argparse
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

from playwright.sync_api import sync_playwright  # noqa: E402

from deck_prologue import lines_until, run_prologue  # noqa: E402
from server import make_server  # noqa: E402

SPEECH_OPEN = "!!document.querySelector('.speech:not([hidden])')"
BUSY = "window.__abyss.busy()"


def scenario(pw, out: Path, lang: str, headed: bool) -> list[str]:
    server = make_server(0)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_address[1]}/?lang={lang}"
    errors: list[str] = []
    browser = pw.chromium.launch(channel="chrome", headless=not headed, args=["--use-angle=metal", "--enable-gpu"])
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e} | {(e.stack or '')[:400]}"))
    page.on("console", lambda m: m.type == "error" and errors.append(f"console: {m.text}"))
    page.goto(url)
    page.wait_for_selector("body[data-ready='1']", timeout=30000)
    wait = page.wait_for_timeout
    n = [0]

    def shot(name):
        n[0] += 1
        page.screenshot(path=str(out / f"{lang}_{n[0]:02d}_{name}.png"))
        print(lang, "shot", name)

    def visible(sel):
        return page.evaluate(f"""(() => {{ const e = document.querySelector('{sel}'); if (!e) return false;
          const r = e.getBoundingClientRect(); if (!r.width || !r.height) return false;
          for (let x = e; x; x = x.parentElement) {{ const cs = getComputedStyle(x); if (x.hidden || cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; }}
          return true; }})()""")

    def settle(limit=90):
        """Let a move finish: story lines go on with Enter, clues get accepted, the 'who is who' card closed."""
        quiet = 0
        for _ in range(limit):
            if visible("[data-id=clue-accept]"):
                shot("clue"); page.click("[data-id=clue-accept]"); wait(1500); continue
            if visible("[data-id=who-go]"):
                page.click("[data-id=who-go]"); wait(500); continue
            if visible("[data-id=coach-skip]"):
                page.click("[data-id=coach-skip]"); wait(400); continue
            if page.evaluate(SPEECH_OPEN):
                page.keyboard.press("Enter"); wait(450); continue
            if page.evaluate(BUSY) or page.evaluate("!!document.querySelector('.chapter:not([hidden])')"):
                quiet = 0; wait(400); continue
            quiet += 1
            if quiet >= 3:
                return
            wait(500)
        raise SystemExit(f"{lang}: the move did not settle")

    # 1) the prologue on foot
    run_prologue(page, shot)
    settle()
    shot("act1_table")
    # 2) three moves by hand: the officers' advice, sonar right here, then just sail somewhere
    page.click("[data-id=accept-advice]"); wait(600); settle(); shot("move1_advice")
    page.wait_for_selector("[data-id=sonar_here]", timeout=10000)
    page.hover("[data-id=sonar_here]"); wait(500); shot("move2_hover_tag")
    page.click("[data-id=sonar_here]"); wait(600); settle(); shot("move2_sonar")
    page.click("[data-id=accept-advice]"); wait(600); settle(); shot("move3_advice")
    # 3) a dive from the deck: stand up -> cabin -> up the companionway -> [E] on Nerpa -> brief -> surface
    page.click(".hud-btn[data-id=stand]")
    page.wait_for_function("window.__abyss.walk.mode === 'cabin'", timeout=10000)
    wait(600); shot("cabin_on_foot")
    page.evaluate("window.__abyss.walk.goTo('stairs_up')")
    page.wait_for_function("window.__abyss.walk.mode === 'deck'", timeout=30000)
    wait(800)
    page.evaluate("window.__abyss.walk.goTo('nerpa')")
    try:
        for _ in range(120):                   # Murat's "Nerpa is ready" waits for a click, then the brief
            if visible("[data-id=dive-start]"):
                break
            if page.evaluate(SPEECH_OPEN):
                page.keyboard.press("Enter")
            wait(500)
        page.wait_for_selector("[data-id=dive-start]", timeout=5000)
    except Exception:
        shot("FAIL_no_brief")
        print(page.evaluate("JSON.stringify({w: window.__abyss.walk.debug(), busy: window.__abyss.busy(), dive: !!window.__abyss.state().dive, act: window.__abyss.state().campaign.act})"))
        raise
    wait(500); shot("dive_brief")
    page.click("[data-id=dive-start]")
    wait(6500); shot("dive_descent")                      # Nerpa sinking past the camera (scenes/nerpa.js)
    page.wait_for_selector("[data-id=surface]", state="visible", timeout=60000)
    wait(9000); shot("dive_cockpit")
    page.click("[data-id=surface]")
    settle(); shot("after_dive")
    # 4) the autopilot to the end (it accepts clues itself; the story lines go on by themselves)
    page.click(".hud-btn[data-id=autopilot]")
    for _ in range(600):
        if visible(".result-back"):
            break
        if visible("[data-id=clue-accept]"):
            page.click("[data-id=clue-accept]")
        if visible("[data-id=who-go]"):
            page.click("[data-id=who-go]")
        wait(500)
    else:
        raise SystemExit(f"{lang}: no results after the autopilot")
    wait(1200); shot("result")
    browser.close()
    server.shutdown()
    return errors


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--lang", default="all")
    ap.add_argument("--headed", action="store_true")
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    langs = ["kk", "ru", "en"] if args.lang == "all" else [args.lang]
    failed = False
    with sync_playwright() as pw:
        for lang in langs:
            errors = scenario(pw, args.out, lang, args.headed)
            print(lang, "errors:", errors or "none")
            failed |= bool(errors)
    if failed:
        sys.exit("JavaScript errors in the page")
    print("scenario OK:", ", ".join(langs))


if __name__ == "__main__":
    main()
