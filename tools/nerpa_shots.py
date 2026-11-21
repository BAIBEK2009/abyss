"""Nerpa on her cradle from fixed views (side, three-quarters, front), in real Chrome. Dev tool.

    python tools/nerpa_shots.py OUT_DIR [--lang ru]
"""
import argparse
import math
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from playwright.sync_api import sync_playwright  # noqa: E402
from server import make_server  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("out", type=Path)
ap.add_argument("--lang", default="ru")
args = ap.parse_args()
args.out.mkdir(parents=True, exist_ok=True)
server = make_server(0, campaign=True)
for ev in ("start", "radio_heard", "binoculars", "enter_cabin", "sit_at_table"):
    server.game.story_event(ev)
server.game.pop_story()
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{server.server_address[1]}/?lang={args.lang}&nointro=1"
errors = []
NX, NZ = 0.6, -10.2          # Nerpa on her cradle (ship-local)
VIEWS = {"side": (4.3, -10.5), "34": (3.4, -7.0), "front": (0.6, -6.6)}
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome", headless=True, args=["--use-angle=metal", "--enable-gpu"])
    page = b.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.add_init_script("try { localStorage.setItem('abyss.coachDone','1'); localStorage.setItem('abyss.introDone','1'); localStorage.setItem('abyss.deckHintsDone','1'); } catch (e) {}")
    page.goto(url)
    page.wait_for_selector("body[data-ready='1']", timeout=30000)
    page.wait_for_timeout(1500)
    for name, (x, z) in VIEWS.items():
        yaw = math.atan2(NX - x, NZ - z)
        page.evaluate(f"window.__abyss.walk.enterDeckNow({{x: {x}, z: {z}, yaw: {yaw}}})")
        page.wait_for_timeout(1800)
        page.add_style_tag(content="#ui, .hud, .goal, .fp-hint, .fp-prompt, .deck-hint { visibility: hidden !important; }")
        page.screenshot(path=str(args.out / f"nerpa_{name}.png"))
        print(name, page.evaluate("window.__abyss.perf()"))
    b.close()
server.shutdown()
print("errors:", errors or "none")
sys.exit(1 if errors else 0)
