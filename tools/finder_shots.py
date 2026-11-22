"""Navigation under water (CLAUDE.md 22.3 / M12d), in real Chrome. Dev tool.

    python tools/finder_shots.py OUT_DIR [--lang ru] [--free] [--prefix m12d_]

Act I: the ship is put over the top of the hill, Nerpa is launched from the deck, the film is skipped; then:
  finder_far      the cockpit right after landing (the finder far from the find: the needle wanders)
  finder_near     a few metres from the find (the needle steady, five bars)
  first_debris    the moment the first piece of the debris trail is seen (Dana's line, the dive checklist)
  sonar_map       the sonar screen after a ping: the track, the covered seabed, the zone, the marks
  buoy            a transponder buoy at the edge of the zone, in the searchlight
--free: the free search (no story), a dive straight onto the box.
Exits with 1 on JS errors.
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
ap.add_argument("--free", action="store_true")
ap.add_argument("--prefix", default="m12d_")
args = ap.parse_args()
args.out.mkdir(parents=True, exist_ok=True)

server = make_server(0, campaign=not args.free)
g = server.game
if not args.free:
    for ev in ("start", "radio_heard", "binoculars", "enter_cabin", "sit_at_table"):
        g.story_event(ev)
    g.pop_story()
    g.pos = max((c for c in g.P if g.P[c] > 0), key=lambda c: g.P[c])      # over the top of the hill: the flap
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{server.server_address[1]}/?lang={args.lang}&nointro=1"
errors = []


def shot(page, name):
    page.screenshot(path=str(args.out / f"{args.prefix}{name}.png"))
    print("shot", name)


with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome", headless=True, args=["--use-angle=metal", "--enable-gpu"])
    page = b.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: errors.append(f"{e} | {(e.stack or '')[:300]}"))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.add_init_script("try { localStorage.setItem('abyss.coachDone','1'); localStorage.setItem('abyss.introDone','1'); localStorage.setItem('abyss.deckHintsDone','1'); } catch (e) {}")
    page.goto(url)
    page.wait_for_selector("body[data-ready='1']", timeout=30000)
    page.wait_for_timeout(1500)
    if args.free:
        page.evaluate(f"() => {{ void window.__abyss.table.run({{type: 'go', target: {list(g.box)}, tool: 'dive'}}); }}")
    else:
        page.evaluate("window.__abyss.walk.enterDeckNow({x: 0.6, z: -6.0, yaw: Math.PI})")
        page.wait_for_timeout(800)
        page.evaluate("window.__abyss.walk.goTo('nerpa')")
        for _ in range(160):
            if page.evaluate("!!document.querySelector('[data-id=dive-start]')"):
                break
            if page.evaluate("!!document.querySelector('.speech:not([hidden])')"):
                page.keyboard.press("Enter")
            page.wait_for_timeout(300)
        page.click("[data-id=dive-start]")
    for _ in range(12):                                   # skip the film
        page.wait_for_timeout(700)
        page.keyboard.press("Space")
    page.wait_for_selector("[data-id=surface]", state="visible", timeout=40000)
    page.wait_for_timeout(2600)
    shot(page, "finder_far")
    # the sonar screen: swim along the trail by hand for a while (the track, the covered bed), then ping
    for key, ms in (("w", 2500), ("a", 700), ("w", 2200), ("d", 1400), ("w", 2400)):
        page.keyboard.down("KeyW")
        if key != "w":
            page.keyboard.down("Key" + key.upper())
        page.wait_for_timeout(ms)
        page.keyboard.up("Key" + key.upper())
    page.keyboard.up("KeyW")
    page.keyboard.press("Space")
    page.wait_for_timeout(1600)
    page.locator(".ck-scope").screenshot(path=str(args.out / f"{args.prefix}sonar_map_crop.png"))
    shot(page, "sonar_map")
    where = page.evaluate("window.__abyss.diveWhere()")
    print("where:", {k: where.get(k) for k in ("box", "debris", "buoys")})

    def look(x, z, yaw, down):
        page.evaluate(f"window.__abyss.diveLook({x}, {z}, {yaw}, {down})")

    def face(p, dist, down, side=0.0):
        """From the landing spot towards p, dist metres short of it; side turns the bow away (radians)."""
        tx, tz = p[0], p[2]
        L = math.hypot(tx, tz) or 1
        cx, cz = tx - tx / L * dist, tz - tz / L * dist
        look(cx, cz, math.atan2(-(tx - cx), -(tz - cz)) + side, down)

    if where.get("debris"):                               # the first piece of the trail comes into the light
        face(where["debris"][0], 4.2, 0.45)
        page.wait_for_timeout(900)
        shot(page, "first_debris")
        page.wait_for_timeout(2500)
    if where.get("box"):
        face(where["box"], 4.5, 0.3, 0.35)
        page.wait_for_timeout(3500)
        shot(page, "finder_near")
    if where.get("buoys"):
        face(where["buoys"][0], 4.0, 0.25)
        page.wait_for_timeout(1800)
        shot(page, "buoy")
    b.close()
server.shutdown()
print("errors:", errors or "none")
sys.exit(1 if errors else 0)
