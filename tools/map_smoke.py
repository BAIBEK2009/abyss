"""Table smoke test in real Chrome (Playwright, dev tool only).

No JS errors; hovering "Accept advice" shows the advice route; clicking it plays a move;
the autopilot then finishes the demo map.

    python tools/map_smoke.py OUT_DIR
"""
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from playwright.sync_api import sync_playwright  # noqa: E402

from server import make_server  # noqa: E402

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
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
    page.hover(".accept-advice")
    page.wait_for_timeout(500)
    page.screenshot(path=str(out / "smoke_advice_hover.png"))
    page.click(".accept-advice")
    page.wait_for_timeout(1500)
    page.screenshot(path=str(out / "smoke_playing.png"))
    page.wait_for_function("!window.__abyss.busy()", timeout=30000)
    st = page.evaluate("window.__abyss.state()")
    print("after advice: hours", st["hours"], "pos", st["pos"], "probes", [(p["kind"], p["result"]) for p in st["probes"]])
    page.click(".hud-btn:has-text('Автопилот')")
    page.wait_for_function("window.__abyss.state().status !== 'playing'", timeout=120000)
    page.wait_for_timeout(800)
    st = page.evaluate("window.__abyss.state()")
    print("autopilot:", st["status"], st["counts"])
    page.screenshot(path=str(out / "smoke_end.png"))
    b.close()
server.shutdown()
print("errors:", errors or "none")
if errors:
    sys.exit(1)
