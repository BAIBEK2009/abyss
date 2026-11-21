"""ABYSS · The Captain's Chart — entry point.

    python main.py                 # start the server (demo map) and open the browser
    python main.py --seed 7        # another map
    python main.py --exam          # also print every turn of the three algorithms here
    python main.py --no-browser --port 8765
    python main.py --lang kk       # force a language (otherwise the game asks once and remembers)
"""
from __future__ import annotations
import argparse
import sys
import threading
import webbrowser

if sys.version_info < (3, 9):
    sys.exit("ABYSS needs Python 3.9+ (found %d.%d)." % sys.version_info[:2])

from core.game import DEMO_SEED  # noqa: E402
from server import make_server  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="ABYSS · Bayesian deep-sea search")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--seed", type=int, default=DEMO_SEED, help=f"map seed (default: demo map {DEMO_SEED})")
    parser.add_argument("--lang", choices=["kk", "ru", "en"], default=None,
                        help="force a language; by default the game asks on the first launch (and remembers)")
    parser.add_argument("--exam", action="store_true", help="print every turn (Bayes, A*, MDP, rival) here")
    parser.add_argument("--no-browser", action="store_true", help="do not open the browser")
    parser.add_argument("--free", action="store_true", help="free search without the story campaign (v3 rules)")
    args = parser.parse_args()

    server = make_server(args.port, seed=args.seed, lang=args.lang or "ru", exam=args.exam, campaign=not args.free)
    # ?lang= would win over the player's saved choice and hide the language screen: only when asked for
    url = f"http://127.0.0.1:{args.port}/" + (f"?lang={args.lang}" if args.lang else "")
    print(f"ABYSS: {url}  (Ctrl+C to quit)" + ("  · exam mode: turns are printed below" if args.exam else ""))
    if not args.no_browser:
        threading.Timer(0.5, webbrowser.open, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nABYSS: bye")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
