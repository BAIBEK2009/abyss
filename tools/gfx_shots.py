"""Fixed views of the deck, the lifeboat, the bridge and the cabin porthole, for the look (gfx_*.png). Dev tool.

    python tools/gfx_shots.py OUT_DIR [--weather calm|storm|fog|dawn] [--prefix gfx_] [--perf]

Starts after the prologue (act I), puts the captain at fixed spots and saves a frame of each; --perf also prints
ms per frame (vsync off) and draw calls at each spot.
"""
import argparse
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from playwright.sync_api import sync_playwright  # noqa: E402
from server import make_server  # noqa: E402

# (name, where, fp.place args [x, z, yaw, pitch]); deck: x across, z along (the bridge 3..12), yaw 0 = to the bow
SPOTS = [
    ("deck", "deck", [3.7, -13.2, -0.2, 0.03]),           # from the stern quarter: A-frame, Nerpa, the bridge, the sea
    ("deck_side", "deck", [-3.6, -4.0, 0.15, 0.02]),       # along the port side to the bow, the sea and the moon path
    ("lifeboat", "deck", [3.4, 4.4, 0.95, 0.12]),          # the lifeboat on its davits, close
    ("bridge", "deck", [-1.75, 10.35, -0.42, -0.3]),        # the radio and the console, close
    ("porthole", "cabin", None),                           # the cabin's porthole
]

ap = argparse.ArgumentParser()
ap.add_argument("out", type=Path)
ap.add_argument("--weather", default="")
ap.add_argument("--prefix", default="gfx_")
ap.add_argument("--perf", action="store_true")
args = ap.parse_args()
args.out.mkdir(parents=True, exist_ok=True)

server = make_server(0)
g = server.game
for ev in ("start", "radio_heard", "binoculars", "enter_cabin", "sit_at_table"):
    g.story_event(ev)
g.pop_story()
threading.Thread(target=server.serve_forever, daemon=True).start()
q = f"&weather={args.weather}" if args.weather else ""
url = f"http://127.0.0.1:{server.server_address[1]}/?lang=ru&nointro=1{q}"
MEASURE = """async (sec) => {
  const t0 = performance.now(); let n = 0;
  await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < sec * 1000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
  const p = window.__abyss.perf(); return { ms: +((performance.now() - t0) / n).toFixed(2), calls: p.calls };
}"""
errors = []
with sync_playwright() as pw:
    flags = ["--use-angle=metal", "--enable-gpu"] + (["--disable-gpu-vsync", "--disable-frame-rate-limit"] if args.perf else [])
    b = pw.chromium.launch(channel="chrome", headless=True, args=flags)
    page = b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2 if args.perf else 1)
    page.on("pageerror", lambda e: errors.append(f"{e} | {(e.stack or '')[:300]}"))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.add_init_script("try { localStorage.setItem('abyss.coachDone','1'); localStorage.setItem('abyss.introDone','1'); localStorage.setItem('abyss.deckHintsDone','1'); } catch (e) {}")
    page.goto(url)
    page.wait_for_selector("body[data-ready='1']", timeout=30000)
    page.wait_for_timeout(1500)
    page.add_style_tag(content=".goal, .fp-mark, .fp-hint, .speech, .toasts { visibility: hidden !important; }")   # the frame only
    for name, where, at in SPOTS:
        if where == "deck":
            page.evaluate("window.__abyss.walk.enterDeckNow()")
        else:
            page.evaluate("window.__abyss.walk.enterCabinNow('stairs')")
        page.wait_for_timeout(500)
        if at:
            page.evaluate(f"window.__abyss.walk.fp.place({at[0]}, {at[1]}, {at[2]}, {at[3]})")
        else:     # the cabin: face the porthole wall
            page.evaluate("(() => { const f = window.__abyss.walk.fp; f.place(-0.6, 0.6, Math.PI + 0.05, 0.06); })()")
        page.wait_for_timeout(2200)
        page.screenshot(path=str(args.out / f"{args.prefix}{name}{'_' + args.weather if args.weather else ''}.png"))
        if args.perf:
            r = page.evaluate(MEASURE, 2.5)
            print(f"  {name:10s} {r['ms']:6.2f} ms  {r['calls']:4d} calls", flush=True)
        else:
            print("shot", name, flush=True)
    b.close()
server.shutdown()
print("errors:", errors or "none")
sys.exit(1 if errors else 0)
