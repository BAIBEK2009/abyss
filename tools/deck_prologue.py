"""The prologue on foot in real Chrome (CLAUDE.md 23.2): deck -> radio -> binoculars -> companionway ->
cabin -> chart table, with screenshots. Dev tool (Playwright).

    python tools/deck_prologue.py OUT_DIR [kk|ru|en] [--prefix m12b]

The captain walks the way a click does (an A* path up to the thing, then E), the lines go on with Enter,
the binoculars are turned to the helicopter and then to the seat. Exits with 1 on JS errors or when the
prologue does not end in act I.
"""
import argparse
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from playwright.sync_api import sync_playwright  # noqa: E402
from server import make_server  # noqa: E402

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("lang", nargs="?", default="ru")
    ap.add_argument("--prefix", default="m12b")
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    server = make_server(0)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_address[1]}/?play=1&lang={args.lang}"
    errors = []

TASKS = "window.__abyss.state().campaign.tasks"
FACE = """([id, dy]) => {            // turn the head to a thing (or a world point) like the mouse would
  const w = window.__abyss.walk, d = w.deck, fp = w.fp;
  const eye = d.space.toWorld(fp.pos.x, d.space.eye, fp.pos.z, fp.eyeWorld().clone());   // the camera moves next frame
  const p = typeof id === 'string' ? d.space.toWorld(...d.objects[id].look, eye.clone()) : eye.clone().set(...id);
  const dx = p.x - eye.x, dz = p.z - eye.z, dyy = p.y - eye.y + (dy || 0);
  fp.place(fp.pos.x, fp.pos.z, Math.atan2(dx, dz), Math.atan2(dyy, Math.hypot(dx, dz)));
}"""

def run_prologue(page, shot):
    """From the deck to the chart table; page is on the game, the prologue not started."""
    wait = page.wait_for_timeout

    wait(4500)                                             # the chapter card "Prologue"
    # the waypoint at the edge: the radio is behind the captain
    page.evaluate("() => window.__abyss.walk.fp.place(-0.1, 4.2, Math.PI + 0.12, 0.0)")
    wait(700); shot("marker_edge")
    # the deck from the stern quarter: A-frame, Nerpa, winch, the bridge
    page.evaluate("() => window.__abyss.walk.fp.place(3.7, -13.2, -0.2, 0.03)")
    wait(900); shot("deck")
    # 1) the radio on the bridge
    page.evaluate("() => window.__abyss.walk.fp.place(0.2, -6.6, 0, 0)")
    assert page.evaluate("() => window.__abyss.walk.goTo('radio')"), "no path to the radio"
    page.wait_for_function("() => !!document.querySelector('.speech:not([hidden])')", timeout=30000)
    wait(600); shot("radio")
    lines_until(page, "!!document.querySelector('.gcards')")
    wait(1200); page.click("[data-id=cards-ok]")
    page.wait_for_function(f"() => {TASKS}[0]", timeout=15000)
    # 2) the binoculars: the prompt with the outline first, then look south
    page.evaluate("""() => { const o = window.__abyss.walk.deck.objects.binoculars; window.__abyss.walk.fp.place(o.stand[0], o.stand[1] - 0.2, 0, 0); }""")
    page.evaluate(FACE, ["binoculars", -0.05])
    wait(900); shot("prompt_e")
    page.keyboard.press("e")
    page.wait_for_function("() => window.__abyss.walk.mode === 'bino'", timeout=5000)
    page.evaluate(FACE, [[ *page.evaluate("() => window.__abyss.walk.deck.targets.heli.toArray()") ], 0])
    page.wait_for_function("() => !!document.querySelector('.speech:not([hidden])')", timeout=20000)
    wait(1800); shot("binoculars")
    lines_until(page, "window.__abyss.walk.debug().stage >= 1 && !document.querySelector('.speech:not([hidden])')")
    seat = page.evaluate("() => window.__abyss.walk.deck.targets.seat.toArray()")
    page.evaluate(FACE, [seat, 0])
    page.mouse.wheel(0, -600); wait(400)
    page.wait_for_function("() => !!document.querySelector('.speech:not([hidden])')", timeout=20000)
    wait(1500); shot("binoculars_seat")
    lines_until(page, f"{TASKS}[1]")
    page.keyboard.press("e")
    page.wait_for_function("() => window.__abyss.walk.mode === 'deck'", timeout=5000)
    # 3) down the companionway
    assert page.evaluate("() => window.__abyss.walk.goTo('stairs')"), "no path to the companionway"
    page.wait_for_function("() => window.__abyss.walk.mode === 'cabin'", timeout=40000)
    lines_until(page, f"{TASKS}[2] && !document.querySelector('.speech:not([hidden])')")
    wait(600); shot("cabin")
    # 4) the chart table
    assert page.evaluate("() => window.__abyss.walk.goTo('table')"), "no path to the table"
    page.wait_for_function("() => window.__abyss.walk.mode === 'table'", timeout=30000)
    page.wait_for_function("() => window.__abyss.state().campaign.act === 'act1'", timeout=30000)
    wait(5000); shot("table")


def lines_until(page, cond_js, limit=40):
    for _ in range(limit):
        if page.evaluate(cond_js):
            return
        page.keyboard.press("Enter")
        page.wait_for_timeout(450)
    raise SystemExit(f"stuck waiting for {cond_js}")


if __name__ == "__main__":
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="chrome", headless=True, args=["--use-angle=metal", "--enable-gpu"])
        page = b.new_page(viewport={"width": 1440, "height": 900})
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.goto(url)
        page.wait_for_selector("body[data-ready='1']", timeout=30000)
        run_prologue(page, lambda name: (page.screenshot(path=str(args.out / f"{args.prefix}_{name}.png")), print("shot", name)))
        b.close()
    server.shutdown()
    print("errors:", errors or "none")
    sys.exit(1 if errors else 0)
