"""All the fix_*.png screenshots in one pass (the final graphics pass). Dev tool.

    python tools/fix_shots.py [OUT_DIR=screenshots]

Deck / cabin views with frame time and draw calls, the descent (seal, sprats), the seabed (sturgeon, gobies),
the storm over the chart table. Prints ms / calls per view; exits 1 on JS errors.
"""
import math
import subprocess
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "tools"))
from playwright.sync_api import sync_playwright  # noqa: E402
from server import make_server  # noqa: E402

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "screenshots")
OUT.mkdir(parents=True, exist_ok=True)
PY = sys.executable
bad = False


def run(args):
    global bad
    r = subprocess.run([PY, *args], capture_output=True, text=True, cwd=ROOT)
    out = (r.stdout + r.stderr).strip().splitlines()
    for line in out:
        if " ms " in line or "errors" in line:
            print(line)
    bad |= r.returncode != 0


S = str(OUT)
run(["tools/deck_shot.py", S, "fix_poseidon_dawn:1.6:-8.6:1.72:0.06", "--time", "dawn"])
run(["tools/deck_shot.py", S, "fix_sea_night_wake:4.0:2.0:2.2:-0.18", "fix_crew_deck:0.2:-1.5:2.9:-0.08", "fix_crew_bridge:0.8:9.4:-0.6:-0.05", "--time", "night"])
run(["tools/deck_shot.py", S, "fix_ship_outside:4.6:22:2.6:-0.55", "fix_sky_morning:-1.0:-9.0:0.35:0.25", "fix_cabin:1.9:2.0:3.75:-0.12:cabin", "--time", "morning"])
run(["tools/campaign_shots.py", S, "--to", "act2storm", "--name", "fix_storm_clouds_table"])

# under water: the descent (seal in shot 3, sprats in shot 4), then the seabed (sturgeon, gobies)
server = make_server(0)
g = server.game
for ev in ("start", "radio_heard", "binoculars", "enter_cabin", "sit_at_table"):
    g.story_event(ev)
g.pop_story()
threading.Thread(target=server.serve_forever, daemon=True).start()
errors = []
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome", headless=True, args=["--use-angle=metal", "--enable-gpu", "--disable-gpu-vsync", "--disable-frame-rate-limit"])
    page = b.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.add_init_script("try { localStorage.setItem('abyss.coachDone','1'); localStorage.setItem('abyss.introDone','1'); localStorage.setItem('abyss.deckHintsDone','1'); } catch (e) {}")
    page.goto(f"http://127.0.0.1:{server.server_address[1]}/?lang=ru&nointro=1&play=1&sturgeon=1")
    page.wait_for_selector("body[data-ready='1']", timeout=30000)
    page.wait_for_timeout(1200)
    page.evaluate("window.__abyss.walk.enterDeckNow({x: 0.6, z: -6.0, yaw: Math.PI})")
    page.wait_for_timeout(600)
    page.evaluate("window.__abyss.walk.goTo('nerpa')")
    for _ in range(160):
        if page.evaluate("!!document.querySelector('[data-id=dive-start]')"):
            break
        if page.evaluate("!!document.querySelector('.speech:not([hidden])')"):
            page.keyboard.press("Enter")
        page.wait_for_timeout(300)
    page.click("[data-id=dive-start]")
    page.wait_for_function("document.body.classList.contains('descent')", timeout=20000)
    page.wait_for_timeout(8600); page.screenshot(path=str(OUT / "fix_seal.png"))
    page.wait_for_timeout(5600); page.screenshot(path=str(OUT / "fix_sprat.png"))
    page.wait_for_selector("[data-id=surface]", state="visible", timeout=40000)
    page.wait_for_function("window.__abyss.diveWhere().mode === 'dive'", timeout=20000)
    page.wait_for_timeout(2500)

    def face(p, dist, down):
        tx, tz = p[0], p[2]
        page.evaluate(f"window.__abyss.diveLook({tx - dist * 0.0}, {tz + dist}, 0, {down})")

    for _ in range(20):
        lf = page.evaluate("window.__abyss.diveWhere().life")
        if lf and lf.get("sturgeon"):
            break
        page.wait_for_timeout(300)
    lf = page.evaluate("window.__abyss.diveWhere().life")
    if lf and lf.get("sturgeon"):
        x, y, z = lf["sturgeon"]
        page.evaluate(f"window.__abyss.diveLook({x + 2.6}, {z + 2.6}, {math.atan2(2.6, 2.6)}, 0.2)")
        page.wait_for_timeout(700); page.screenshot(path=str(OUT / "fix_sturgeon.png"))
    gx, gy, gz = page.evaluate("window.__abyss.diveWhere().life.goby")
    page.evaluate(f"window.__abyss.diveLook({gx}, {gz + 1.6}, 0, 0.75)")
    page.wait_for_timeout(250); page.screenshot(path=str(OUT / "fix_gobies.png"))
    perf = page.evaluate("window.__abyss.perf()")
    print(f"  under_water            {perf['ms']} ms  {perf['calls']} calls")
    b.close()
server.shutdown()
print("errors:", errors or "none")
sys.exit(1 if bad or errors else 0)
