"""Bayes: sonar 3x3, camera, clues — numbers checked by hand (CLAUDE.md v3, 13.4)."""
import pytest

from core import bayes, world

SHIP = (5, 5)
INSIDE = (5, 5)                                   # in the 3x3 square around SHIP
FAR = [(0, 0), (9, 0), (0, 9), (9, 9)]            # Chebyshev distance >= 2


def toy_prior():
    """P = 0.20 inside the 3x3 square around the ship, the other 0.80 outside."""
    P = {INSIDE: 0.2}
    for c in FAR:
        P[c] = 0.8 / len(FAR)
    return P


def test_sonar_silence_hand_checked():
    # 0.20 * 0.20 / (0.20 * 0.20 + 0.92 * 0.80) = 0.04 / 0.776 = 0.0515
    P, Z = bayes.sonar(toy_prior(), SHIP, echo=False)
    assert Z == pytest.approx(0.776)
    assert P[INSIDE] == pytest.approx(0.0515, abs=1e-4)


def test_sonar_echo_hand_checked():
    # 0.80 * 0.20 / (0.80 * 0.20 + 0.08 * 0.80) = 0.16 / 0.224 = 0.7143
    P, Z = bayes.sonar(toy_prior(), SHIP, echo=True)
    assert Z == pytest.approx(0.224)
    assert P[INSIDE] == pytest.approx(0.7143, abs=1e-4)


def test_sonar_covers_the_3x3_square():
    for cell in [(4, 4), (6, 6), (4, 6), (5, 4)]:
        assert bayes.sonar_likelihood(cell, SHIP, True) == 0.80
    for cell in [(3, 5), (7, 7), (5, 7)]:
        assert bayes.sonar_likelihood(cell, SHIP, True) == 0.08
    assert bayes.sonar_likelihood((5, 5), SHIP, False) == pytest.approx(0.20)
    assert bayes.sonar_likelihood((0, 0), SHIP, False) == pytest.approx(0.92)


def camera_prior():
    return {(5, 5): 0.5, (5, 6): 0.3, (0, 0): 0.2}   # dive cell, neighbour (d=1), far (d>=2)


def test_camera_nothing_hand_checked():
    # L = 0.02, 0.40, 0.97 -> Z = 0.01 + 0.12 + 0.194 = 0.324
    P, Z = bayes.camera(camera_prior(), (5, 5), "nothing")
    assert Z == pytest.approx(0.324)
    assert P[(5, 5)] == pytest.approx(0.01 / 0.324)
    assert P[(5, 6)] == pytest.approx(0.12 / 0.324)
    assert P[(0, 0)] == pytest.approx(0.194 / 0.324)


def test_camera_debris_points_to_neighbours():
    # L = 0.01, 0.60, 0.03 -> Z = 0.005 + 0.18 + 0.006 = 0.191; the neighbour jumps to 0.9424
    P, Z = bayes.camera(camera_prior(), (5, 5), "debris")
    assert Z == pytest.approx(0.191)
    assert P[(5, 6)] == pytest.approx(0.18 / 0.191)


def test_camera_box_leaves_only_the_dive_cell():
    P, _ = bayes.camera(camera_prior(), (5, 5), "box")
    assert P[(5, 5)] == pytest.approx(1.0)


def test_camera_table_rows_sum_to_one():
    for row in world.CAMERA.values():
        assert sum(row.values()) == pytest.approx(1.0)


@pytest.mark.parametrize("evidence", ["echo", "silence", "box", "debris", "nothing"])
def test_belief_sums_to_one_and_reefs_stay_zero(evidence):
    P = world.prior((6.0, 3.5))
    for _ in range(3):
        if evidence in ("echo", "silence"):
            P, _ = bayes.sonar(P, (5, 4), evidence == "echo")
        elif evidence != "box":
            P, _ = bayes.camera(P, (6, 4), evidence)
    assert sum(P.values()) == pytest.approx(1.0, abs=1e-9)
    assert all(P[r] == 0.0 for r in world.REEFS)


def test_chances_before_acting():
    P = toy_prior()
    assert bayes.echo_chance(P, SHIP) == pytest.approx(0.2 * 0.8 + 0.8 * 0.08)  # = Z of an echo
    assert bayes.find_chance(P, INSIDE) == pytest.approx(0.2 * 0.97)


def test_prior_is_normalised_peaks_near_signal_and_skips_reefs():
    P = world.prior((6.5, 4.5))                    # centre of cell (6, 4)
    assert sum(P.values()) == pytest.approx(1.0)
    assert bayes.argmax(P) == (6, 4)
    assert all(P[r] == 0.0 for r in world.REEFS)


def test_sum_around_and_argmax_tie():
    P = {(0, 0): 0.4, (1, 1): 0.1, (5, 5): 0.4, (9, 9): 0.1}
    assert bayes.sum_around(P, (0, 0)) == pytest.approx(0.5)
    assert bayes.argmax(P, near=(6, 6)) == (5, 5)
