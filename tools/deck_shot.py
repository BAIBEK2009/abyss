"""One or more fixed first-person views on the deck / in the cabin, with frame time. Dev tool.

    python tools/deck_shot.py OUT_DIR name:x:z:yaw[:pitch[:mode]] ... [--weather calm|storm|fog|dawn] [--lang ru]

mode: deck (default) | cabin (cabin spaces are metres too). Exits 1 on JS errors.
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
ap.add_argument("views", nargs="+")
ap.add_argument("--weather", default=None)
ap.add_argument("--time", default=None)
ap.add_argument("--lang", default="ru")
args = ap.parse_args()
args.out.mkdir(parents=True, exist_ok=True)
server = make_server(0)
g = server.game
for ev in ("start", "radio_heard", "binoculars", "enter_cabin", "sit_at_table"):
    g.story_event(ev)
g.pop_story()
threading.Thread(target=server.serve_forever, daemon=True).start()
q = f"?play=1&nointro=1&lang={args.lang}" + (f"&weather={args.weather}" if args.weather else "") + (f"&time={args.time}" if args.time else "")
errors = []
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome", headless=True, args=["--use-angle=metal", "--enable-gpu", "--disable-gpu-vsync", "--disable-frame-rate-limit"])
    page = b.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.add_init_script("try { localStorage.setItem('abyss.coachDone','1'); localStorage.setItem('abyss.introDone','1'); localStorage.setItem('abyss.deckHintsDone','1'); } catch (e) {}")
    page.goto(f"http://127.0.0.1:{server.server_address[1]}/{q}")
    page.wait_for_selector("body[data-ready='1']", timeout=30000)
    page.wait_for_timeout(1500)
    for v in args.views:
        name, x, z, yaw, *rest = v.split(":")
        pitch = float(rest[0]) if rest else 0.0
        mode = rest[1] if len(rest) > 1 else "deck"
        if mode == "cabin":
            page.evaluate(f"window.__abyss.walk.enterCabinNow('stairs'); window.__abyss.walk.fp.place({x}, {z}, {yaw}, {pitch})")
        else:
            page.evaluate(f"window.__abyss.walk.enterDeckNow({{x: {x}, z: {z}, yaw: {yaw}, pitch: {pitch}}})")
        page.wait_for_timeout(2500)
        page.evaluate("document.querySelectorAll('.goal, .fp-hint, .fp-mark').forEach((e) => e.style.visibility = 'hidden')")
        page.screenshot(path=str(args.out / f"{name}.png"))
        perf = page.evaluate("window.__abyss.perf()")
        print(f"  {name:22s} {perf['ms']} ms  {perf['calls']} calls  {perf['tris']} tris")
    b.close()
server.shutdown()
print("errors:", errors or "none")
sys.exit(1 if errors else 0)
