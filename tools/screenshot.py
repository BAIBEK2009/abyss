"""Take a screenshot of the game with headless Chrome (for milestone reports).

    python tools/screenshot.py screenshots/m0.png [--size 1440x900] [--query "lang=en"]

Starts the game server on a free port, opens the page in headless Chrome
(software WebGL), waits a few seconds of page time, saves a PNG and stops the server.
"""
import argparse
import shutil
import subprocess
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from server import make_server  # noqa: E402

CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    shutil.which("google-chrome") or "",
    shutil.which("chromium") or "",
]


def find_chrome() -> str:
    for c in CHROME_CANDIDATES:
        if c and Path(c).exists():
            return c
    sys.exit("Chrome not found — open the game in a browser and take the screenshot by hand.")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--size", default="1440x900")
    ap.add_argument("--query", default="lang=ru")
    ap.add_argument("--wait-ms", type=int, default=6000, help="virtual page time before the shot")
    ap.add_argument("--seed", type=int, default=272, help="game seed (same map on every shot)")
    ap.add_argument("--ai-turns", type=int, default=0, help="let the AI crew make N moves before the shot")
    args = ap.parse_args()

    server = make_server(0, seed=args.seed, campaign=False)  # port 0 = any free port
    port = server.server_address[1]
    for _ in range(args.ai_turns):          # advance the game, e.g. to show a grown hill
        if server.game.status != "playing":
            break
        server.game.autoplay(max_actions=1)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    out = args.out.resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    w, h = args.size.lower().split("x")
    cmd = [
        find_chrome(),
        "--headless=new",
        "--hide-scrollbars",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--force-device-scale-factor=1",
        f"--window-size={w},{h}",
        f"--virtual-time-budget={args.wait_ms}",
        f"--screenshot={out}",
        f"http://127.0.0.1:{port}/?{args.query}",
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=120)
    finally:
        server.shutdown()
    print(f"saved {out}")


if __name__ == "__main__":
    main()
