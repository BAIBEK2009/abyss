"""Frames of the descent film and the seabed (CLAUDE.md 23.3-E), in real Chrome. Dev tool.

    python tools/descent_shots.py OUT_DIR [--lang ru] [--every 0.5] [--seconds 21]

Starts the campaign in act I, launches Nerpa from the deck ([E] on her), clicks through Murat's line and the
brief, then saves a frame every --every seconds of the film (descent_NN.png), and finally the cockpit on the
seabed (bottom.png). Exits with 1 on JS errors.
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
ap.add_argument("--lang", default="ru")
ap.add_argument("--every", type=float, default=0.5)
ap.add_argument("--seconds", type=float, default=21)
ap.add_argument("--free", action="store_true", help="free search (no story): dive straight onto the box, for the debris and box close-ups")
args = ap.parse_args()
args.out.mkdir(parents=True, exist_ok=True)

server = make_server(0, campaign=not args.free)
g = server.game
if not args.free:
    for ev in ("start", "radio_heard", "binoculars", "enter_cabin", "sit_at_table"):
        g.story_event(ev)
    g.pop_story()
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{server.server_address[1]}/?lang={args.lang}&nointro=1"
errors = []
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome", headless=True, args=["--use-angle=metal", "--enable-gpu"])
    page = b.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: errors.append(f"{e} | {(e.stack or '')[:300]}"))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.on("response", lambda r: r.status >= 400 and errors.append(f"{r.status} {r.request.method} {r.url} {r.request.post_data or ''}"))
    page.add_init_script("try { localStorage.setItem('abyss.coachDone','1'); localStorage.setItem('abyss.introDone','1'); localStorage.setItem('abyss.deckHintsDone','1'); } catch (e) {}")
    page.goto(url)
    page.wait_for_selector("body[data-ready='1']", timeout=30000)
    page.wait_for_timeout(1500)
    if args.free:      # straight onto the box (the free search has no brief): the debris and the recorder are there
        page.evaluate(f"() => {{ void window.__abyss.table.run({{type: 'go', target: {list(g.box)}, tool: 'dive'}}); }}")   # do not wait for the dive to end
    else:
        page.evaluate("window.__abyss.walk.enterDeckNow({x: 0.6, z: -6.0, yaw: Math.PI})")
        page.wait_for_timeout(800)
        page.evaluate("window.__abyss.walk.goTo('nerpa')")
    for _ in range(0 if args.free else 160):
        if page.evaluate("!!document.querySelector('[data-id=dive-start]')"):
            break
        if page.evaluate("!!document.querySelector('.speech:not([hidden])')"):
            page.keyboard.press("Enter")
        page.wait_for_timeout(300)
    if not args.free:
        page.click("[data-id=dive-start]")
    n = int(args.seconds / args.every)
    perf = []
    for i in range(n):
        page.wait_for_timeout(int(args.every * 1000))
        page.screenshot(path=str(args.out / f"descent_{i:02d}.png"))
        perf.append((f"descent_{i:02d}", page.evaluate("window.__abyss.perf()")))
    page.wait_for_selector("[data-id=surface]", state="visible", timeout=30000)
    page.wait_for_timeout(2500)
    page.screenshot(path=str(args.out / "bottom.png"))
    perf.append(("bottom", page.evaluate("window.__abyss.perf()")))
    # fixed views on the seabed (CLAUDE.md 23.3-E): rocks, the mud volcano, a piece of debris, the find
    page.evaluate("window.__abyss.diveLook(-6, 6, 2.4, 0.15)"); page.wait_for_timeout(1500)
    page.screenshot(path=str(args.out / "bed_rocks.png"))
    page.evaluate("window.__abyss.diveLook(3.0, -4.6, 0.08, 0.02)"); page.wait_for_timeout(1500)
    page.screenshot(path=str(args.out / "bed_volcano.png"))
    where = page.evaluate("window.__abyss.diveWhere()")
    def face(p, dist, down):
        """Look at a point the way Nerpa comes to it: from the landing spot (the origin), dist metres short of it."""
        import math
        tx, tz = p[0], p[2]
        L = math.hypot(tx, tz) or 1
        cx, cz = tx - tx / L * dist, tz - tz / L * dist
        page.evaluate(f"window.__abyss.diveLook({cx}, {cz}, {math.atan2(-(tx - cx), -(tz - cz))}, {down})")
    if where["debris"]:
        face(where["debris"][-1], 3.4, 0.45); page.wait_for_timeout(1500)
        page.screenshot(path=str(args.out / "debris_close.png"))
        if "dv_seats" in where.get("keys", []):
            face(where["debris"][where["keys"].index("dv_seats")], 2.6, 0.4); page.wait_for_timeout(1500)
            page.screenshot(path=str(args.out / "seats_close.png"))
            perf.append(("seats", page.evaluate("window.__abyss.perf()")))
    if where["box"]:
        page.evaluate("window.__abyss.diveLook(0, 0, 0, 0.3)")
        page.evaluate("window.__abyss.faceBox()"); page.wait_for_timeout(1800)
        page.screenshot(path=str(args.out / "find_close.png"))
        perf.append(("find", page.evaluate("window.__abyss.perf()")))
    b.close()
server.shutdown()
for name, p in perf:
    print(f"  {name}: {p['ms']} ms, {p['calls']} calls, {p['tris']} tris")
print("frames:", n, "| errors:", errors or "none")
sys.exit(1 if errors else 0)
