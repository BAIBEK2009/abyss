"""Screenshots of the story campaign in real Chrome (Playwright, dev tool only).

    python tools/story_shots.py OUT_DIR SCRIPT [--size 1440x900] [--act act1] [--prefix m9a] [--lang kk|ru|en|pick]

--lang pick: no ?lang= and an empty localStorage, so the page opens on the language screen; the script
then starts at once (use "ready" after choosing a card to wait for the game).

SCRIPT is a comma-separated list of steps:
    wait:MS           wait
    shot:NAME         save OUT_DIR/PREFIX_NAME.png
    js:CODE           run JavaScript in the page (window.__abyss is the game)
    click:SELECTOR    click an element
    cell:X;Y          click a cell on the chart
    key:KEY;MS        hold a key for MS
    until:JS          wait until the JS expression is true (up to 60 s)
    ready             wait until the game is on screen (automatic first step unless --lang pick)
    sonar             the server-side: one sonar at Dana's pin (before the page loads, first step only)
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
ap.add_argument("script")
ap.add_argument("--size", default="1440x900")
ap.add_argument("--act", default=None, help="start the campaign in this act (prologue beats skipped)")
ap.add_argument("--prefix", default="story")
ap.add_argument("--seed", type=int, default=272)
ap.add_argument("--lang", default="ru", help="kk | ru | en, or pick = the language screen")
ap.add_argument("--fresh", action="store_true", help="forget the first-launch flags (who-is-who)")
args = ap.parse_args()
args.out.mkdir(parents=True, exist_ok=True)

server = make_server(0, seed=args.seed)
g = server.game
steps = [s for s in args.script.split(",") if s]
if args.act:
    for ev in ("start", "radio_heard", "binoculars", "enter_cabin", "sit_at_table"):
        if g.campaign.act == args.act:
            break
        g.story_event(ev)
    g.campaign.act = args.act
    g.pop_story()
while steps and steps[0] == "sonar":
    steps.pop(0)
    g.act({"type": "go", "target": g.advice()["vera"]["target"], "tool": "sonar"})
    g.pop_story()
threading.Thread(target=server.serve_forever, daemon=True).start()
lang_q = "" if args.lang == "pick" else f"lang={args.lang}&"
url = f"http://127.0.0.1:{server.server_address[1]}/?{lang_q}nointro=1"
w, h = map(int, args.size.lower().split("x"))
errors = []
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome", headless=True, args=["--use-angle=metal", "--enable-gpu"])
    page = b.new_page(viewport={"width": w, "height": h})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    if not args.fresh:
        page.add_init_script("try { localStorage.setItem('abyss.coachDone','1'); localStorage.setItem('abyss.introDone','1'); } catch (e) {}")
    page.goto(url)
    if args.lang != "pick":
        steps.insert(0, "ready")
    for st in steps:
        kind, _, arg = st.partition(":")
        if kind == "ready":
            page.wait_for_selector("body[data-ready='1']", timeout=30000)
        elif kind == "wait":
            page.wait_for_timeout(int(arg))
        elif kind == "shot":
            page.screenshot(path=str(args.out / f"{args.prefix}_{arg}.png"))
            print("shot", arg)
        elif kind == "js":
            page.evaluate(f"() => {{ void ({arg}); }}")      # never wait on a returned promise
        elif kind == "click":
            page.click(arg)
        elif kind == "cell":
            x, y = map(int, arg.split(";"))
            xy = page.evaluate(f"window.__abyss.cellScreen({x}, {y})")
            page.mouse.click(xy["x"], xy["y"])
        elif kind == "key":
            k, ms = arg.split(";")
            page.keyboard.down(k); page.wait_for_timeout(int(ms)); page.keyboard.up(k)
        elif kind == "until":
            page.wait_for_function(arg, timeout=60000)
        else:
            raise SystemExit(f"unknown step {st}")
    b.close()
server.shutdown()
print("errors:", errors or "none")
sys.exit(1 if errors else 0)
