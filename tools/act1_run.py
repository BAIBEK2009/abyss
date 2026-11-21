"""Act I end to end in real Chrome (Playwright, dev tool only): sonar, the fishermen on the radio, the dive
briefing, a live dive to the flap (grabbed with E), Van der Berg, the act II card. Screenshots on the way.

    python tools/act1_run.py OUT_DIR [--prefix m9a_4]
"""
import argparse
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from playwright.sync_api import sync_playwright  # noqa: E402
from server import make_server  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("out", type=Path)
ap.add_argument("--prefix", default="act1")
args = ap.parse_args()
args.out.mkdir(parents=True, exist_ok=True)
server = make_server(0)
g = server.game
for ev in ("start", "radio_heard", "enter_cabin", "sit_at_table"):
    g.story_event(ev)
g.pop_story()
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{server.server_address[1]}/?lang=ru&nointro=1"
errors, shots = [], set()
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome", headless=True, args=["--use-angle=metal", "--enable-gpu"])
    page = b.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.add_init_script("try { localStorage.setItem('abyss.coachDone','1'); localStorage.setItem('abyss.introDone','1'); } catch (e) {}")
    page.goto(url)
    page.wait_for_selector("body[data-ready='1']", timeout=30000)
    page.wait_for_timeout(1500)

    def shot(name):
        if name in shots:
            return
        shots.add(name)
        page.screenshot(path=str(args.out / f"{args.prefix}_{name}.png"))
        print("shot", name, flush=True)

    vis = lambda sel: page.evaluate(f"!!document.querySelector('{sel}') && !document.querySelector('{sel}').hidden && getComputedStyle(document.querySelector('{sel}')).display !== 'none'")
    sonars, dived, faced, t0 = 0, False, False, time.time()
    while time.time() - t0 < 240:
        st = page.evaluate("window.__abyss.state()")
        camp = st["campaign"]
        if camp["act"] == "act2" and not vis(".chapter") and not vis(".speech"):
            page.wait_for_timeout(1500); shot("09_act2_table"); break
        if vis(".chapter"):
            page.wait_for_timeout(1200); shot("08_act2_card"); page.wait_for_timeout(500); continue
        if vis(".radio-back"):
            page.wait_for_timeout(2500); shot("02_radio_fishermen"); page.click(".radio-accept"); page.wait_for_timeout(600); continue
        if vis(".brief-back"):
            page.wait_for_timeout(600); shot("04_brief"); page.click(".br-go"); continue
        if page.evaluate("document.body.classList.contains('diving')"):
            if page.evaluate("document.querySelector('.cockpit').classList.contains('live')"):
                if vis(".speech"):
                    page.wait_for_timeout(1500); shot("05_cockpit_dana")
                if not faced and page.evaluate("window.__abyss.faceBox()"):
                    faced = True; page.wait_for_timeout(3400); shot("06_flap_seen")
                    page.keyboard.down("e"); page.wait_for_timeout(1800); page.keyboard.up("e")
            page.wait_for_timeout(300); continue
        if vis(".speech"):
            page.wait_for_timeout(2600)
            beat = page.evaluate("document.querySelector('.sp-text').textContent.slice(0, 18)")
            name = {"Эхо! Металл": "01_dana_echo", "Тишина. Это то": "01_dana_silence", "«Нерпа» готова": "03_murat_ready",
                    "Это закрылок, на ": "07_dana_flap", "«Тұлпар», говорит": "07b_berg"}.get(next((k for k in ["Эхо! Металл", "Тишина. Это то", "«Нерпа» готова", "Это закрылок, на ", "«Тұлпар», говорит"] if beat.startswith(k)), ""), None)
            if name:
                shot(name)
            if not page.evaluate("document.querySelector('.speech').classList.contains('auto')"):
                page.click(".speech")
            page.wait_for_timeout(300); continue
        if page.evaluate("window.__abyss.busy()"):
            page.wait_for_timeout(300); continue
        # the captain's moves: sonar at Dana's pin until the clue, then dive at the top of the hill
        tgt = st["advice"]["vera"]["target"]
        if st["hours"] < 6 or sonars < 1:
            sonars += 1
            page.evaluate(f"void window.__abyss.table.run({{type:'go', target:[{tgt[0]},{tgt[1]}], tool:'sonar'}})")
        elif not dived:
            dived = True
            top = max(((x, y) for y in range(10) for x in range(10)), key=lambda c: st["P"][c[1]][c[0]])
            page.evaluate(f"void window.__abyss.table.run({{type:'go', target:[{top[0]},{top[1]}], tool:'dive'}})")
        page.wait_for_timeout(600)
    st = page.evaluate("window.__abyss.state()")
    print("end:", st["campaign"]["act"], st["campaign"]["mystery"], "rival:", bool(st["rival"]), "hours:", st["hours"])
    b.close()
server.shutdown()
print("errors:", errors or "none")
sys.exit(1 if errors else 0)
