"""Table smoke test in real Chrome (Playwright, dev tool only).

"Who is who" + tutorial on first visit -> hover a cell -> choose it -> officers' drawer -> press an action tag (cinema mode) -> radio clue
window -> accept advice -> autopilot to the end -> results card. Fails on any JS error.

    python tools/map_smoke.py OUT_DIR [kk|ru|en]
"""
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from playwright.sync_api import sync_playwright  # noqa: E402

from server import make_server  # noqa: E402

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
server = make_server(0, campaign=False)
threading.Thread(target=server.serve_forever, daemon=True).start()
LANG = sys.argv[2] if len(sys.argv) > 2 else "ru"
url = f"http://127.0.0.1:{server.server_address[1]}/?play=1&lang={LANG}"
errors = []


def shot(page, name):
    page.screenshot(path=str(out / f"{name}.png"))
    print("shot", name)


def settle(page):
    """Wait for the move to end; surface from a live dive; answer the radio if a clue arrived."""
    page.wait_for_function("!window.__abyss.busy() || document.querySelector('.radio-back:not([hidden])') || document.querySelector('.cockpit.live')", timeout=90000)
    if page.is_visible(".cockpit.live"):
        page.wait_for_timeout(1500)
        shot(page, "smoke_dive")
        page.keyboard.press("q")
        page.wait_for_function("!window.__abyss.busy() || document.querySelector('.radio-back:not([hidden])')", timeout=60000)
    page.wait_for_timeout(500)
    if page.is_visible(".radio-back"):
        page.wait_for_timeout(1800)                       # let the typewriter finish
        shot(page, "smoke_radio")
        page.click(".radio-accept")
        page.wait_for_function("!window.__abyss.busy()", timeout=60000)
        page.wait_for_timeout(600)


with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome", headless=True, args=["--use-angle=metal", "--enable-gpu"])
    page = b.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.goto(url)
    page.wait_for_selector("body[data-ready='1']", timeout=30000)
    page.wait_for_selector(".intro:not([hidden])", timeout=10000)   # "who is who" opens on the first visit
    page.wait_for_timeout(400)
    shot(page, "smoke_intro")
    page.click(".intro .go")
    page.wait_for_selector(".coach:not([hidden])", timeout=10000)   # then the tutorial
    page.wait_for_timeout(500)
    shot(page, "smoke_coach1")
    page.click(".coach-next"); page.wait_for_timeout(400)
    page.click(".coach-next"); page.wait_for_timeout(400)
    shot(page, "smoke_coach3")
    page.click(".coach-skip"); page.wait_for_timeout(600)
    shot(page, "smoke_start")

    xy = page.evaluate("window.__abyss.cellScreen(4, 6)")
    page.mouse.move(xy["x"], xy["y"]); page.wait_for_timeout(800)
    shot(page, "smoke_cell_tip")
    page.mouse.click(xy["x"], xy["y"]); page.wait_for_timeout(1200)
    page.hover(".tag-action >> nth=1"); page.wait_for_timeout(700)
    shot(page, "smoke_tag_hover")
    page.keyboard.down("b"); page.wait_for_timeout(1000)
    shot(page, "smoke_drawer")
    page.keyboard.up("b"); page.wait_for_timeout(500)
    page.click(".tag-action >> nth=0")
    page.wait_for_timeout(1500)
    shot(page, "smoke_cinema")
    page.wait_for_selector(".toast", timeout=30000); page.wait_for_timeout(200)
    shot(page, "smoke_toast")
    settle(page)

    page.click(".accept-advice")
    settle(page)
    st = page.evaluate("window.__abyss.state()")
    print("after advice: hours", st["hours"], "pos", st["pos"], "probes", [(p["kind"], p["result"]) for p in st["probes"]])

    page.click(".hud-btn[data-id=autopilot]")
    page.wait_for_selector(".result", timeout=180000)
    page.wait_for_timeout(800)
    st = page.evaluate("window.__abyss.state()")
    print("end:", st["status"], st["reason"], st["counts"], "stars", st["stars"])
    shot(page, "smoke_result")
    b.close()
server.shutdown()
print("errors:", errors or "none")
if errors:
    sys.exit(1)
