"""Three languages (CLAUDE.md 23.1): every interface string lives in web/i18n/{ru,kk,en}.json.

- no Cyrillic in web/js and web/*.html (not even in comments): all texts go through t('key');
- the three files have the same keys and the same {placeholders};
- the three story files have the same structure and "lang" at the root.
"""
import json
import re
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent / "web"
CYRILLIC = re.compile(r"[\u0400-\u04FF\u0500-\u052F]")
LANGS = ("ru", "kk", "en")


def _ui(lang):
    return json.loads((WEB / "i18n" / f"{lang}.json").read_text(encoding="utf-8"))


def test_no_cyrillic_in_code():
    files = list((WEB / "js").rglob("*.js")) + list(WEB.glob("*.html"))
    assert files
    bad = []
    for f in files:
        for n, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            if CYRILLIC.search(line):
                bad.append(f"{f.relative_to(WEB)}:{n}: {line.strip()[:80]}")
    assert not bad, "Cyrillic outside web/i18n:\n" + "\n".join(bad)


def test_ui_files_have_the_same_keys_and_placeholders():
    files = {l: _ui(l) for l in LANGS}
    for l, d in files.items():
        assert d["_lang"] == l
    keys = set(files["ru"])
    for l in ("kk", "en"):
        assert set(files[l]) == keys, (l, set(files[l]) ^ keys)
    ph = lambda s: {m.lower() for m in re.findall(r"\{(\w+)\}", s)}
    for k in keys:
        want = ph(files["ru"][k])
        for l in ("kk", "en"):
            assert ph(files[l][k]) == want, (l, k, files[l][k])
        for l in LANGS:
            assert files[l][k].strip() or k == "tg_dive_tail", (l, k)


def test_kazakh_file_is_kazakh():
    kk = _ui("kk")
    text = "".join(v for k, v in kk.items() if not k.startswith("_"))
    for ch in "әғқңөұүі":           # һ is rare (loan words only)
        assert ch in text.lower(), ch


def test_story_files_have_the_same_structure():
    names = {"ru": "story.json", "kk": "story.kk.json", "en": "story.en.json"}
    S = {l: json.loads((WEB / "data" / n).read_text(encoding="utf-8")) for l, n in names.items()}
    tech = {"id", "on", "type", "speaker", "scene", "clue", "show", "portrait", "channel", "found_by", "oxygen_s"}

    def walk(a, b, path):
        assert type(a) is type(b), path
        if isinstance(a, dict):
            assert set(a) == set(b), (path, set(a) ^ set(b))
            for k in a:
                if k in tech:
                    assert a[k] == b[k], (path + "." + k, a[k], b[k])
                walk(a[k], b[k], path + "." + k)
        elif isinstance(a, list):
            assert len(a) == len(b), path
            for i, (x, y) in enumerate(zip(a, b)):
                walk(x, y, f"{path}[{i}]")

    for l in ("kk", "en"):
        assert S[l]["lang"] == l
        walk(S["ru"], S[l], l)
