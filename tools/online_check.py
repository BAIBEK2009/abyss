"""The online build (docs/, Pyodide) end to end in real Chrome: build docs/, serve it with a plain
`python3 -m http.server` (no game server at all), play the demo to an ending in each language.

    python tools/online_check.py [--sub] [--headed] [--cases kk:investigators,ru:public,en:sell,ru:lost]

--sub serves docs/ under /abyss/ (like <login>.github.io/abyss/) instead of the site root.
Prints a table; exits 1 on any failure or any console error.
"""
import argparse
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "tools"))
from playwright.sync_api import sync_playwright  # noqa: E402
from build_web import build  # noqa: E402
from live_player import Player  # noqa: E402

ACT = "window.__abyss.state().campaign.act"
SHOTS = ROOT / "screenshots"


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def skip(page, p, to_act, limit=80):
    for _ in range(limit):
        if page.evaluate(f"{ACT} === '{to_act}'") or page.evaluate("!!document.querySelector('.choice-back')"):
            return
        if page.evaluate("!!document.querySelector('.chapter:not([hidden]), .speech:not([hidden]), .intro:not([hidden]), .gcards, .coach:not([hidden])')"):
            p.key("KeyE")
        elif page.evaluate("(() => { const b = document.querySelector('[data-id=skip-act]'); return !!b && !b.hidden && !b.disabled && getComputedStyle(b).display !== 'none'; })()"):
            page.click("[data-id=skip-act]")
        page.wait_for_timeout(500)
    raise AssertionError(f"stuck before {to_act}: act {page.evaluate(ACT)}")


def play(b, base, lang, ending):
    errors = []
    page = b.new_page(viewport={"width": 1280, "height": 800})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.add_init_script("try { localStorage.clear(); localStorage.setItem('abyss.deckHintsDone','1'); } catch (e) {}")
    t0 = time.time()
    page.goto(f"{base}?lang={lang}&demo=1")
    page.wait_for_selector(".py-loading", timeout=15000)
    loading = page.inner_text(".py-loading-text")
    page.wait_for_selector("body[data-ready='1']", timeout=180000)
    boot = time.time() - t0
    p = Player(page, layout="en" if lang == "en" else "ru")
    page.wait_for_timeout(800)
    skip(page, p, "act1")
    if ending == "lost":
        page.wait_for_function("!window.__abyss.busy()", timeout=30000)
        skip(page, p, "act1", 5)
        calm = 0
        for _ in range(80):
            if page.evaluate("!!document.querySelector('.speech:not([hidden]), .chapter, .gcards, .intro:not([hidden])') || window.__abyss.busy()"):
                calm = 0; p.key("KeyE")
            else:
                calm += 1
                if calm >= 5:
                    break
            page.wait_for_timeout(400)
        page.evaluate("window.__abyssPy.runPython('_session.game.hours = 119.0')")
        page.click("[data-id=sonar_here]")
    else:
        skip(page, p, "act3")
        page.wait_for_selector(".choice-back", timeout=30000)
        p.key("Digit1")
        page.wait_for_function("window.__abyss.state().campaign.choices.act3 === 'cvr_first'", timeout=10000)
        skip(page, p, "act4")
        page.wait_for_selector(".choice-back", timeout=60000)
        p.key({"investigators": "Digit1", "public": "Digit2", "sell": "Digit3"}[ending])
    page.wait_for_selector(".ending.talk", timeout=40000)
    got = page.evaluate("window.__abyss.state().campaign.ending")
    saved = page.evaluate("JSON.parse(localStorage.getItem('abyss.save') || 'null')?.log?.length || 0")
    SHOTS.mkdir(exist_ok=True)
    page.screenshot(path=str(SHOTS / f"online_{lang}_{ending}.png"))
    page.close()
    return got == ending, got, boot, loading.replace("\n", " / "), saved, errors


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sub", action="store_true")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--cases", default="kk:investigators,ru:public,en:sell,ru:lost")
    a = ap.parse_args()
    docs = build(ROOT / "docs")
    port = free_port()
    tmp = tempfile.TemporaryDirectory()
    if a.sub:
        (Path(tmp.name) / "abyss").symlink_to(docs, target_is_directory=True)
        cwd, base = tmp.name, f"http://127.0.0.1:{port}/abyss/"
    else:
        cwd, base = str(docs), f"http://127.0.0.1:{port}/"
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"], cwd=cwd,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    rows, bad = [], 0
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch(channel="chrome", headless=not a.headed, args=["--use-angle=metal", "--enable-gpu"])
            for case in a.cases.split(","):
                lang, ending = case.split(":")
                try:
                    ok, got, boot, loading, saved, errors = play(b, base, lang, ending)
                except Exception as e:  # noqa: BLE001
                    ok, got, boot, loading, saved, errors = False, f"error: {e}"[:120], 0, "", 0, []
                ok = ok and not errors
                bad += not ok
                rows.append((lang, ending, got, f"{boot:.1f}", loading, saved, len(errors), "ok" if ok else "FAIL"))
                for e in errors[:5]:
                    print("   console:", e[:200])
            b.close()
    finally:
        srv.terminate()
    print(f"\nbase {base}")
    print("| lang | ending | got | Python ready, s | loading text | saved calls | console errors | result |")
    print("|---|---|---|---|---|---|---|---|")
    for r in rows:
        print("| " + " | ".join(map(str, r)) + " |")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
