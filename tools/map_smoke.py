"""Map smoke test in real Chrome (Playwright, dev tool only): no JS errors, a click shows the
course and the rival forecast ghost, N plays the officers' advice until the demo map is won.

    python tools/map_smoke.py OUT_DIR
"""
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from playwright.sync_api import sync_playwright
from server import make_server

out = sys.argv[1]
server = make_server(0)
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{server.server_address[1]}/?lang=ru"
errors = []
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome", headless=True, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    page = b.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.goto(url)
    page.wait_for_selector("body[data-ready='1']", timeout=30000)
    page.wait_for_timeout(800)
    xy = page.evaluate("window.__abyss.cellScreen(4, 6)")
    page.mouse.move(xy["x"], xy["y"]); page.wait_for_timeout(200)
    page.mouse.click(xy["x"], xy["y"]); page.wait_for_timeout(900)
    page.screenshot(path=f"{out}/m5_forecast.png")
    page.keyboard.press("n"); page.wait_for_timeout(1300)
    page.screenshot(path=f"{out}/m5_playing.png")
    page.wait_for_function("!window.__abyss.busy()", timeout=30000)
    page.wait_for_timeout(500)
    st = page.evaluate("window.__abyss.state()")
    print("after N: hours", st["hours"], "pos", st["pos"], "probes", [(p["kind"], p["result"]) for p in st["probes"]])
    page.screenshot(path=f"{out}/m5_after_move.png")
    for _ in range(4):
        page.keyboard.press("n"); page.wait_for_timeout(300)
        page.wait_for_function("!window.__abyss.busy()", timeout=60000)
    st = page.evaluate("window.__abyss.state()")
    print("after 5 N:", st["status"], st["counts"])
    page.wait_for_timeout(500)
    page.screenshot(path=f"{out}/m5_end.png")
    b.close()
server.shutdown()
print("errors:", errors or "none")
if errors:
    sys.exit(1)
