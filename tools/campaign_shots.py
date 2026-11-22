"""Screenshots of the later acts (B1-B5): the campaign is advanced in the core, then the page is opened. Dev tool.

    python tools/campaign_shots.py OUT_DIR --to act2|act2storm|act3|act4|board [--lang ru] [--name m10_storm_map]

act2storm: act II with the storm front over the middle of the square and the decoy ready.
Exits 1 on JS errors.
"""
import argparse
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from playwright.sync_api import sync_playwright  # noqa: E402
from server import make_server  # noqa: E402

PROLOGUE = ("start", "radio_heard", "binoculars", "enter_cabin", "sit_at_table")


def top(g):
    return list(max(g.PF, key=g.PF.get))


def advance(g, to):
    for ev in PROLOGUE:
        g.story_event(ev)
    if to == "lost":                                 # the beacon dies before anything is raised
        g.act({"type": "go", "target": top(g), "tool": "sonar"})
        g.hours = 119
        g.act({"type": "go", "target": top(g), "tool": "dive"})
        g.pop_story()
        return
    g.act({"type": "go", "target": top(g), "tool": "sonar"})
    g.act({"type": "go", "target": top(g), "tool": "dive"})          # act I: the flap
    if to.startswith("act2"):
        g.act({"type": "go", "target": top(g), "tool": "sonar"})
        for c in g.pending_clues():
            g.clue(c["id"], True)
        if to == "act2storm":
            g.storm_t0 = g.hours - 16
            for _ in range(8):
                if g.decoy == "ready":
                    break
                g.act({"type": "go", "target": list(g.pos), "tool": "sonar"})
        g.pop_story()
        return
    g.act({"type": "go", "target": top(g), "tool": "dive"})          # act II: the tail
    if to == "act3":
        g.pop_story()
        return
    if to == "board":                                # every slot found: skip act III in the demo
        g.skip_act()
        g.pop_story()
        return
    g.choose("act3", "fdr_first")
    for _ in range(2):
        g.act({"type": "go", "target": top(g), "tool": "dive"}, live=True)
        g.dive_end(True, 0.3)
    g.pop_story()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--to", default="act2storm")
    ap.add_argument("--lang", default="ru")
    ap.add_argument("--name", default=None)
    ap.add_argument("--wait", type=int, default=4000)
    ap.add_argument("--pick", type=int, default=0, help="act IV: press this number on the choice, then shoot the ending")
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    server = make_server(0, demo=args.to in ("act3", "act4", "board"))
    if args.to == "lost":
        server = make_server(0)
    advance(server.game, args.to)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_address[1]}/?lang={args.lang}&nointro=1"
    errors = []
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="chrome", headless=True, args=["--use-angle=metal", "--enable-gpu"])
        page = b.new_page(viewport={"width": 1440, "height": 900})
        page.on("pageerror", lambda e: errors.append(f"{e} | {(e.stack or '')[:300]}"))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.add_init_script("try { localStorage.setItem('abyss.coachDone','1'); localStorage.setItem('abyss.introDone','1'); localStorage.setItem('abyss.deckHintsDone','1'); } catch (e) {}")
        page.goto(url)
        page.wait_for_selector("body[data-ready='1']", timeout=30000)
        page.wait_for_timeout(args.wait)
        for _ in range(20):                           # lines that are still waiting: page through them
            if not page.evaluate("!!document.querySelector('.speech:not([hidden])')"):
                break
            page.keyboard.press("Enter"); page.wait_for_timeout(400)
        page.wait_for_timeout(800)
        if args.to == "board":
            page.evaluate("window.__abyss.table.board.show(window.__abyss.state().campaign.mystery)")
            page.wait_for_timeout(900)
        name = args.name or f"m10_{args.to}"
        page.screenshot(path=str(args.out / f"{name}.png"))
        if args.pick:
            page.keyboard.press(f"Digit{args.pick}")
            page.wait_for_timeout(1500)
            for _ in range(10):
                if not page.evaluate("!!document.querySelector('.speech:not([hidden])')"):
                    break
                page.keyboard.press("Enter"); page.wait_for_timeout(400)
            page.wait_for_selector(".ending.talk", timeout=20000)
            page.wait_for_timeout(1500)
            ending = page.evaluate("window.__abyss.state().campaign.ending")
            page.screenshot(path=str(args.out / f"m10_ending_{ending}.png"))
            print("shot ending", ending)
        if args.to == "lost":
            page.wait_for_selector(".ending.talk", timeout=20000)
            page.wait_for_timeout(1500)
            page.screenshot(path=str(args.out / "m10_ending_lost.png"))
        print("shot", name, "|", page.evaluate("JSON.stringify(window.__abyss.state().campaign.storm || null).slice(0, 120)"))
        b.close()
    server.shutdown()
    print("errors:", errors or "none")
    sys.exit(1 if errors else 0)
