"""Screenshots of the table in real Chrome (Playwright, dev tool only), the tutorial skipped.

    python tools/table_shot.py OUT.png [--ai-turns N] [--size 1440x900] [--hover X,Y] [--wait 2500]

Prints JS errors and exits with 1 if there were any.
"""
import argparse
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from playwright.sync_api import sync_playwright  # noqa: E402

from server import make_server  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("out", type=Path)
ap.add_argument("--ai-turns", type=int, default=0)
ap.add_argument("--seed", type=int, default=272)
ap.add_argument("--size", default="1440x900")
ap.add_argument("--hover", default=None, help="cell x,y to hover before the shot")
ap.add_argument("--wait", type=int, default=2500, help="ms after load")
ap.add_argument("--intro", action="store_true", help="keep the opening camera flight")
ap.add_argument("--keys", default="", help="keys to hold during the shot, e.g. b")
ap.add_argument("--campaign", action="store_true", help="the story campaign (default: v3 free search)")
args = ap.parse_args()

server = make_server(0, seed=args.seed, campaign=args.campaign)
for _ in range(args.ai_turns):
    if server.game.status != "playing":
        break
    server.game.autoplay(max_actions=1)
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{server.server_address[1]}/?lang=ru"
w, h = map(int, args.size.lower().split("x"))
errors = []
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome", headless=True, args=["--use-angle=metal", "--enable-gpu"])
    page = b.new_page(viewport={"width": w, "height": h})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.add_init_script("try { localStorage.setItem('abyss.coachDone', '1'); localStorage.setItem('abyss.introDone', '1'); } catch (e) {}")
    page.goto(url if args.intro else url + "&nointro=1")
    try:
        page.wait_for_selector("body[data-ready='1']", timeout=30000)
    except Exception:
        print("page did not start:", *errors, sep="\n  ")
        sys.exit(1)
    page.wait_for_timeout(args.wait)
    if args.hover:
        x, y = map(int, args.hover.split(","))
        xy = page.evaluate(f"window.__abyss.cellScreen({x}, {y})")
        page.mouse.move(xy["x"], xy["y"])
        page.wait_for_timeout(900)
    for k in args.keys:
        page.keyboard.down(k)
    if args.keys:
        page.wait_for_timeout(1200)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(args.out))
    b.close()
server.shutdown()
print("saved", args.out)
if errors:
    print("JS errors:", *errors, sep="\n  ")
    sys.exit(1)
