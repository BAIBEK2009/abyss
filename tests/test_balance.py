"""Balance acceptance test (CLAUDE.md v3, 5.8) over 400 maps (~3 s)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))

from balance import win_rates  # noqa: E402


def test_advice_beats_simple_policies():
    r = win_rates(400)
    assert r["advice"] >= 0.58
    assert r["advice"] > r["dive_only"]
    assert r["sonar_only"] == 0
    assert r["random"] < 0.1
