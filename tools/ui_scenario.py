"""Drive the real game UI in Chrome (Playwright) and screenshot every step.

    python tools/ui_scenario.py OUT_DIR [--seed 2011] [--headed]

Needs `pip install playwright` (dev tool only) and Google Chrome installed.
Fails loudly on any JavaScript error in the page.
"""
import argparse
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from playwright.sync_api import sync_playwright  # noqa: E402

from server import make_server  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--seed", type=int, default=2011)
    ap.add_argument("--headed", action="store_true")
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    server = make_server(0, mode="play", seed=args.seed, echo_exam=False)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_address[1]}/?lang=ru"
    errors = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=not args.headed,
                                     args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("console", lambda m: m.type == "error" and errors.append(f"console: {m.text}"))
        page.add_init_script("try { localStorage.clear(); } catch (e) {}")
        page.goto(url)
        page.wait_for_selector("body[data-ready='1']", timeout=30000)
        page.wait_for_timeout(500)

        def shot(name):
            page.screenshot(path=str(args.out / f"{name}.png"))
            print("shot", name)

        def cell_xy(x, y):
            p = page.evaluate(f"window.__abyss.cellScreen({x}, {y})")
            return p["x"], p["y"]

        def idle():
            page.wait_for_function("!window.__abyss.busy()", timeout=30000)
            page.wait_for_timeout(300)

        def state():
            return page.evaluate("window.__abyss.state()")

        # 1. hover a cell next to the signal -> pencil route + tag
        page.mouse.move(*cell_xy(7, 5))
        page.wait_for_timeout(600)
        shot("01_hover_move")
        # 2. hover a reef
        page.mouse.move(*cell_xy(5, 3))
        page.wait_for_timeout(600)
        shot("02_hover_reef")
        # 3. sail to H6
        page.mouse.move(*cell_xy(7, 5))
        page.wait_for_timeout(300)
        page.mouse.click(*cell_xy(7, 5))
        page.wait_for_timeout(900)
        shot("03_sailing")
        idle()
        s = state()
        assert s["subs"]["you"]["pos"] == [7, 5], s["subs"]["you"]
        shot("04_arrived")
        # 4. sonar check
        page.mouse.move(700, 450)
        page.keyboard.press("Space")
        page.wait_for_timeout(500)
        shot("05_sonar_wave")
        idle()
        shot("06_sonar_result")
        # 5. hover the lift button tag, then F -> first-time confirmation
        page.hover(".tag:has-text('Поднять')")
        page.wait_for_timeout(400)
        shot("07_hover_lift")
        page.mouse.move(700, 450)
        page.keyboard.press("f")
        page.wait_for_selector(".note-card", timeout=5000)
        page.wait_for_timeout(400)
        shot("08_confirm")
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        assert state()["subs"]["you"]["lifts"] == 0
        # 6. AI hint current
        page.keyboard.press("h")
        page.wait_for_timeout(1500)
        shot("09_hint")
        idle()
        # 7. hills off / on
        page.keyboard.press("v")
        page.wait_for_timeout(400)
        shot("10_hills_off")
        page.keyboard.press("v")
        # 8. a few more checks, then go home
        for _ in range(3):
            page.keyboard.press("Space")
            idle()
        shot("11_after_checks")
        page.hover(".tag:has-text('Вернуться')")
        page.wait_for_timeout(500)
        shot("12_hover_home")
        page.mouse.move(700, 450)
        page.keyboard.press("r")
        page.wait_for_timeout(1200)
        shot("13_going_home")
        idle()
        s = state()
        assert s["subs"]["you"]["pos"] == s["subs"]["you"]["base"] and s["subs"]["you"]["fuel"] == 100
        shot("14_home")

        # 9. the real box (read from the server): sail there, sonar, burn fuel, lift
        box = list(server.game.box)
        page.mouse.click(*cell_xy(*box))
        idle()
        page.keyboard.press("Space")
        page.wait_for_timeout(900)
        shot("15_sonar_at_box")
        idle()
        while state()["subs"]["you"]["fuel"] >= 30:
            page.keyboard.press("Space")
            idle()
        shot("16_low_fuel_advice")
        assert state()["subs"]["you"]["advice"] == "RETURN"
        page.keyboard.press("f")
        page.wait_for_selector(".note-card", timeout=5000)
        page.keyboard.press("Enter")
        page.wait_for_timeout(1200)
        shot("17_lifting")
        page.wait_for_selector(".note-card.end", timeout=10000)
        page.wait_for_timeout(500)
        shot("18_end_note")
        assert state()["status"] == "won"
        browser.close()

    server.shutdown()
    if errors:
        print("\n".join(errors))
        sys.exit("JavaScript errors in the page")
    print("scenario OK")


if __name__ == "__main__":
    main()
