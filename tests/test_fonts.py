"""Every font of the game has the Kazakh letters (CLAUDE.md 23.1).

Decorative fonts often lack ә ғ қ ң ө ұ ү һ і and the browser falls back to another font letter by
letter. The CSS splits each face into latin / cyrillic / cyrillic-ext files by unicode-range; here we
check that, for each family + weight + style, the files together cover all Kazakh letters, and that
every letter falls into the unicode-range of a file that actually has it.
"""
import re
from pathlib import Path

from fontTools.ttLib import TTFont

WEB = Path(__file__).resolve().parent.parent / "web"
KAZAKH = "ӘәҒғҚқҢңӨөҰұҮүҺһІі"
FACE = re.compile(r"@font-face\s*\{(.*?)\}", re.S)


def _ranges(spec):
    out = []
    for part in spec.split(","):
        a, _, b = part.strip()[2:].partition("-")
        out.append((int(a, 16), int(b or a, 16)))
    return out


def _faces():
    faces = {}
    for body in FACE.findall((WEB / "css" / "game.css").read_text(encoding="utf-8")):
        fam = re.search(r'font-family:\s*"([^"]+)"', body).group(1)
        weight = re.search(r"font-weight:\s*(\d+)", body).group(1)
        style = (re.search(r"font-style:\s*(\w+)", body) or [None, "normal"])[1]
        url = re.search(r'url\("\.\./([^"]+)"\)', body).group(1)
        rng = _ranges(re.search(r"unicode-range:\s*([^;]+);", body).group(1))
        faces.setdefault((fam, weight, style), []).append((WEB / url, rng))
    return faces


def test_every_face_has_kazakh_letters():
    faces = _faces()
    families = {f for f, _, _ in faces}
    assert {"Prata", "Caveat", "Onest", "PT Mono", "Cormorant Garamond"} <= families
    for key, files in faces.items():
        missing = []
        for ch in KAZAKH:
            cp = ord(ch)
            ok = any(lo <= cp <= hi and cp in TTFont(path).getBestCmap()
                     for path, rng in files for lo, hi in rng)
            if not ok:
                missing.append(ch)
        assert not missing, f"{key}: no glyphs for {''.join(missing)}"


def test_no_font_without_kazakh_is_used():
    css = (WEB / "css" / "game.css").read_text(encoding="utf-8")
    assert "Manrope" not in css            # Manrope has no ә ғ қ ң ұ
    for js in (WEB / "js").rglob("*.js"):
        assert "Manrope" not in js.read_text(encoding="utf-8"), js
