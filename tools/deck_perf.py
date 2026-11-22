"""Frame time and draw calls on the deck, in the wheelhouse and in the cabin, with a screenshot of each spot.
Dev tool (Playwright, real Chrome with Metal, vsync and the frame-rate limit off so the time is the real cost).

    python tools/deck_perf.py OUT_DIR [--prefix perf_] [--seconds 3]

Prints for each spot: ms per frame (mean over the window), FPS, draw calls, triangles. Exits 1 on JS errors.
"""
import argparse
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from playwright.sync_api import sync_playwright  # noqa: E402
from server import make_server  # noqa: E402

# deck coordinates (scenes/deck.js): x across, z along the ship (the wheelhouse z 3..12), yaw 0 looks to the bow
SPOTS = [
    ("deck_door", "deck", {"x": 0.9, "z": 0.6, "yaw": 0.25}),          # the open watertight door at the back of the wheelhouse
    ("deck_aft", "deck", {"x": 0.6, "z": -6.0, "yaw": 3.14159}),        # the working deck: the A-frame and Nerpa
    ("deck_walk", "deck", {"x": -2.0, "z": 1.0, "yaw": 3.6}),           # the deck towards the stern, the sea
    ("house_corridor", "deck", {"x": 0.0, "z": 3.7, "yaw": 0.0}),       # inside: the corridor to the bridge
    ("house_doors", "deck", {"x": 0.0, "z": 4.6, "yaw": 1.5708}),       # the cabin doors in the corridor
    ("bridge", "deck", {"x": 0.6, "z": 9.0, "yaw": 0.0}),               # the bridge: the console, the radio
    ("cabin", "cabin", None),
    ("cabin_door", "cabin", "back"),               # turned round: the watertight door at the companionway
]

ap = argparse.ArgumentParser()
ap.add_argument("out", type=Path)
ap.add_argument("--prefix", default="perf_")
ap.add_argument("--seconds", type=float, default=3)
args = ap.parse_args()
args.out.mkdir(parents=True, exist_ok=True)

server = make_server(0)
g = server.game
for ev in ("start", "radio_heard", "binoculars", "enter_cabin", "sit_at_table"):
    g.story_event(ev)
g.pop_story()
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{server.server_address[1]}/?lang=ru&nointro=1"
errors = []
MEASURE = """async (sec) => {
  const t0 = performance.now(); let n = 0;
  await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < sec * 1000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
  const ms = (performance.now() - t0) / n, p = window.__abyss.perf();
  return { ms: +ms.toFixed(2), fps: +(1000 / ms).toFixed(1), calls: p.calls, tris: p.tris };
}"""
rows = []
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome", headless=True,
                           args=["--use-angle=metal", "--enable-gpu", "--disable-gpu-vsync", "--disable-frame-rate-limit"])
    page = b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)     # a Retina MacBook: pixel ratio 1.5 after the cap
    page.on("pageerror", lambda e: errors.append(f"{e} | {(e.stack or '')[:300]}"))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.add_init_script("try { localStorage.setItem('abyss.coachDone','1'); localStorage.setItem('abyss.introDone','1'); localStorage.setItem('abyss.deckHintsDone','1'); } catch (e) {}")
    page.goto(url)
    page.wait_for_selector("body[data-ready='1']", timeout=30000)
    page.wait_for_timeout(1500)
    for name, where, start in SPOTS:
        if where == "deck":
            page.evaluate(f"window.__abyss.walk.enterDeckNow({start})".replace("'", '"').replace("True", "true"))
        else:
            page.evaluate("window.__abyss.walk.enterCabinNow('stairs')")
            if start == "back":
                page.wait_for_timeout(400)
                page.evaluate("(() => { const f = window.__abyss.walk.fp, p = f.pos; f.place(1.45, 1.55, 0.55, -0.05); })()")
        page.wait_for_timeout(1500)
        r = page.evaluate(MEASURE, args.seconds)
        page.screenshot(path=str(args.out / f"{args.prefix}{name}.png"))
        rows.append((name, r))
        print(f"  {name:15s} {r['ms']:6.2f} ms  {r['fps']:6.1f} fps  {r['calls']:5d} calls  {r['tris']:8d} tris", flush=True)
    b.close()
server.shutdown()
print("errors:", errors or "none")
sys.exit(1 if errors else 0)
