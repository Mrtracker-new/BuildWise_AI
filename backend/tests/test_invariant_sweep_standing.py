"""
test_invariant_sweep_standing.py - the adversarial sweep as a STANDING harness
==============================================================================
``scripts/qa_invariant_sweep.py`` runs the full 28-case adversarial matrix; that is
too slow for every test run. This module keeps the sweep wired into the suite by
re-running two pinned reproductions through the REAL sweep code:

  * T1-tiny-8x10 (seed 1003) - the refusal repro. It previously produced four
    "violations" (no land report, no gate, no certificate, no T1 programme)
    against a generation that had correctly refused the brief. The refusal now
    carries a full L1-L15 FAIL gate, and the sweep judges it on
    refusal-honesty (I10) instead of on rooms it never drew.
  * T1-rect-20x20 (seed 1002) - a solved plate that used to violate
    I5-SCHEDULE-AREA-FIELD and I5-SVG-SCHEDULE-TRUNCATED. Both must stay closed:
    the schedule publishes gross/clear areas separately and the sheet prints
    every room.

Run the full matrix with:
    python scripts/qa_invariant_sweep.py --quick
"""

import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
for _p in (str(BACKEND), str(BACKEND / "scripts")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

try:
    from scripts import qa_invariant_sweep as sweep  # type: ignore[import-not-found]
except ImportError:
    import qa_invariant_sweep as sweep  # type: ignore[import-not-found]  # noqa: E402

_PLOTS = {p["key"]: p for p in sweep.PLOTS}


def _run(typ_key: str, typology: str, plot_key: str, seed: str):
    sweep.violations.clear()
    sweep.case_rows.clear()
    row = sweep.run_case(
        typ_key, typology, _PLOTS[plot_key], 1, "high", seed, quick=True
    )
    return row, list(sweep.violations)


@pytest.fixture(scope="module")
def declined_case():
    return _run("T1", "residential_single", "tiny-8x10", "1003")


@pytest.fixture(scope="module")
def rect_case():
    return _run("T1", "residential_single", "rect-20x20", "1002")


def test_refusal_repro_passes_sweep_as_honest_decline(declined_case):
    row, violations = declined_case
    assert row["declined"] is True, "the 8x10 m repro is expected to be refused"
    assert [v["code"] for v in violations] == [], (
        "a refusal must satisfy the refusal-honesty invariants (no land report / "
        "gate / certificate is EXPECTED when nothing was solved): "
        f"{[v['code'] for v in violations]}"
    )
    assert row["decline"]["gate"] == "FAIL"


def test_rect_repro_passes_sweep_with_zero_violations(rect_case):
    row, violations = rect_case
    assert not row["declined"], "the 20x20 m repro must be solved, not refused"
    assert [v["code"] for v in violations] == [], (
        f"sweep regressions on {row['case_id']}: "
        + "; ".join(f"{v['code']} {v['detail']}" for v in violations)
    )
