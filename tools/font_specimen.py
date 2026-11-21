"""Screenshot: the Kazakh letters in every font of the game (CLAUDE.md 23.1).

    python tools/font_specimen.py [OUT.png]

Each row is one @font-face family + weight + style from web/css/game.css; next to it the same line in
a fallback font, so a letter that fell back would stand out. Exits with 1 on JS errors.
"""
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from playwright.sync_api import sync_playwright  # noqa: E402
from server import make_server  # noqa: E402

out = Path(sys.argv[1] if len(sys.argv) > 1 else "screenshots/m12a_kazakh_fonts.png")
out.parent.mkdir(parents=True, exist_ok=True)
LINE = "Әә Ғғ Ққ Ңң Өө Ұұ Үү Һһ Іі"
WORDS = "Мақсат: қара жәшікті «Посейдоннан» бұрын табу · Ақтау · Ұшақ · Өңір · Һ"
FACES = [("Prata", 400, "normal", "titles"), ("Onest", 400, "normal", "text"), ("Onest", 600, "normal", "text"),
         ("Onest", 700, "normal", "buttons"), ("Onest", 800, "normal", "labels"), ("Caveat", 400, "normal", "pencil"),
         ("Caveat", 700, "normal", "pencil"), ("PT Mono", 400, "normal", "radio, logbook"),
         ("Cormorant Garamond", 500, "italic", "chart names"), ("Cormorant Garamond", 600, "italic", "chart names"),
         ("Cormorant Garamond", 700, "italic", "chart names"), ("Cormorant Garamond", 700, "normal", "dials")]

server = make_server(0)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{server.server_address[1]}"
rows = "".join(
    f'<tr><td class="n">{f} {w}{" italic" if s == "italic" else ""}<br><small>{use}</small></td>'
    f'<td style="font-family:\'{f}\';font-weight:{w};font-style:{s}"><div class="big">{LINE}</div><div class="w">{WORDS}</div></td></tr>'
    for f, w, s, use in FACES)
html = f"""<!doctype html><html lang="kk"><head><meta charset="utf-8"><link rel="stylesheet" href="{base}/css/game.css">
<style>html,body{{height:auto!important;overflow:visible!important;background:#efe6d2!important;position:static!important}} body{{color:#2b2a33;margin:0;padding:24px}} table{{border-collapse:collapse}}
td{{padding:8px 16px;border-bottom:1px solid #c9b99a;vertical-align:middle}} .n{{font:600 13px/1.3 Menlo,monospace;color:#6d5a3a;width:230px}}
.n small{{color:#9a8f78}} .big{{font-size:34px;line-height:1.15}} .w{{font-size:18px;color:#4b3517}}
h1{{font:400 22px Menlo,monospace;margin:0 0 12px}}</style></head>
<body><h1>ABYSS · Kazakh letters in every game font</h1><table>{rows}</table></body></html>"""
errors = []
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome", headless=True)
    page = b.new_page(viewport={"width": 1180, "height": 900})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(base + "/i18n/kk.json")          # same origin, so the fonts load
    page.set_content(html)
    page.evaluate("document.fonts.ready")
    page.wait_for_timeout(600)
    page.screenshot(path=str(out), full_page=True)
    b.close()
server.shutdown()
print("shot", out, "errors:", errors or "none")
sys.exit(1 if errors else 0)
