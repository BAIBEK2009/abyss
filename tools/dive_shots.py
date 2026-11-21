"""Screenshots of the dive sequence in real Chrome (Playwright, dev tool only).

    python tools/dive_shots.py OUT_DIR [--cell 1,8] [--at 3.2,5.6,9,12]

Chooses a cell, presses "sail there and dive" and saves a shot at each moment (seconds after the click).
"""
import argparse
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from playwright.sync_api import sync_playwright  # noqa: E402
from server import make_server  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("out", type=Path)
ap.add_argument("--cell", default="1,8")
ap.add_argument("--at", default="3.5,6.0,9.5,13.0")
ap.add_argument("--prefix", default="dive")
ap.add_argument("--keys", default="", help="key script after the last shot, e.g. 'w:2,d:1'")
args = ap.parse_args()
args.out.mkdir(parents=True, exist_ok=True)
server = make_server(0)
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{server.server_address[1]}/?lang=ru&nointro=1"
errors = []
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome", headless=True, args=["--use-angle=metal", "--enable-gpu"])
    page = b.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.add_init_script("localStorage.setItem('abyss.coachDone','1');localStorage.setItem('abyss.introDone','1')")
    page.goto(url)
    page.wait_for_selector("body[data-ready='1']", timeout=30000)
    page.wait_for_timeout(1200)
    x, y = map(int, args.cell.split(","))
    xy = page.evaluate(f"window.__abyss.cellScreen({x}, {y})")
    page.mouse.click(xy["x"], xy["y"]); page.wait_for_timeout(900)
    page.click(".tag-action >> nth=1")
    t0 = time.time()
    for i, at in enumerate(float(a) for a in args.at.split(",")):
        page.wait_for_timeout(max(0, int((at - (time.time() - t0)) * 1000)))
        page.screenshot(path=str(args.out / f"{args.prefix}_{i + 1}.png"))
        print("shot", i + 1, f"{time.time() - t0:.1f}s")
    for step in filter(None, args.keys.split(",")):
        k, sec = step.split(":")
        page.keyboard.down(k); page.wait_for_timeout(int(float(sec) * 1000)); page.keyboard.up(k)
    b.close()
server.shutdown()
print("errors:", errors or "none")
