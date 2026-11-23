"""The online build for GitHub Pages: docs/ = web/ + core/*.py, run by Pyodide in the browser (no server).

    python tools/build_web.py [OUT_DIR]          # default: docs/ in the repository root

- every file of web/ (index.html, js, css, fonts, i18n, data/story*.json, assets, vendor) is copied as is;
- docs/index.html gets <meta name="abyss-backend" content="pyodide">: web/js/api.js then sends every /api/*
  call to core/router.py inside Pyodide instead of fetch (the same Python code as server.py);
- core/*.py go to docs/py/core/, listed with the story files in docs/py/manifest.json (Pyodide's file system
  gets the repository layout: core/ next to web/data/);
- all paths stay relative: the site works at <login>.github.io/abyss/ and at http://localhost:8000/.
Pyodide itself comes from the official jsDelivr CDN (only in this build; the local game stays offline).
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB, CORE = ROOT / "web", ROOT / "core"
MARK = ".abyss-build"                      # only a folder with this mark is ever wiped
META = '<meta name="abyss-backend" content="pyodide">'
SKIP = shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store")


def build(out: Path) -> Path:
    if out.exists():
        if not (out / MARK).exists():
            sys.exit(f"{out} exists and is not an ABYSS build: not touching it")
        shutil.rmtree(out)
    shutil.copytree(WEB, out, ignore=SKIP)
    (out / MARK).write_text("made by tools/build_web.py; the whole folder is rebuilt\n")
    (out / ".nojekyll").write_text("")    # GitHub Pages: serve every file as is

    index = out / "index.html"
    html = index.read_text(encoding="utf-8")
    if META not in html:
        anchor = '<meta charset="utf-8">' if '<meta charset="utf-8">' in html else "<head>"
        if anchor not in html:
            sys.exit("web/index.html has no <head>")
        html = html.replace(anchor, anchor + "\n  " + META, 1)
    index.write_text(html, encoding="utf-8")

    files = []
    (out / "py" / "core").mkdir(parents=True)
    for src in sorted(CORE.glob("*.py")):
        shutil.copy2(src, out / "py" / "core" / src.name)
        files.append([f"py/core/{src.name}", f"core/{src.name}"])
    for story in sorted((WEB / "data").glob("story*.json")):
        files.append([f"data/{story.name}", f"web/data/{story.name}"])
    (out / "py" / "manifest.json").write_text(json.dumps({"files": files}, indent=1), encoding="utf-8")
    return out


def main():
    out = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "docs"
    build(out)
    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    n = sum(1 for f in out.rglob("*") if f.is_file())
    print(f"ABYSS web build: {out}  ({n} files, {size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
