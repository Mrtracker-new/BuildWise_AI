"""Derived metrics: every printed percentage is derived from the plan (regression pins).

Repro: the engine used to emit
    vastu_score_pct      = 90.0 if strictness == "high" else 82.0
    plumbing_stack_alignment_pct = 100.0
    space_utilization_pct = 100.0
    circulation_efficiency_pct = 100.0
    prefer_adjacency_score = 94.5
regardless of geometry. These tests fail if any of them becomes a constant again.
"""

from __future__ import annotations

import pytest

from app.schemas.floorplan import FloorPlanRequest
from app.services.floorplan.derived_metrics import (
    circulation_efficiency_pct,
    vastu_pct,
    wet_riser_pct_by_floor,
)
from app.services.floorplan.floorplan_service import generate_floor_plan


def _generate(**overrides):
    payload = dict(
        plot_width_m=12.0,
        plot_depth_m=15.0,
        building_typology="residential_single",
        floors=1,
        vastu_strictness="high",
        ai_provider="mock",
        seed="1001",
        bypass_cache=True,
    )
    payload.update(overrides)
    return generate_floor_plan(FloorPlanRequest(**payload))


def _rooms(building):
    return [room for floor in building.floors for room in floor.rooms]


def test_vastu_score_is_the_measured_share_not_a_strictness_constant():
    response = _generate()
    measured = vastu_pct(_rooms(response.multi_storey))
    assert response.metrics.vastu_compliance_pct == pytest.approx(measured, abs=0.1)
    # The old constants were 90.0 / 82.0; a measured plan is free to differ.
    assert response.metrics.vastu_compliance_pct not in (90.0, 82.0) or (
        measured == pytest.approx(response.metrics.vastu_compliance_pct, abs=0.1)
    )


def test_plumbing_score_is_measured_and_can_be_zero():
    # This four-room T1 plate solves without a circulation core, so no wet room
    # reaches a riser. The honest score is 0 %, not the old 100 %.
    response = _generate(
        required_rooms=["living", "kitchen", "master_bed", "bath_1"],
    )
    floors = response.multi_storey.floors
    expected = wet_riser_pct_by_floor(floors)
    assert any(pct == 0.0 for pct in expected if pct is not None)
    assert response.metrics.plumbing_adjacency_score == pytest.approx(0.0, abs=0.1)


def test_space_and_circulation_are_derived_from_areas():
    response = _generate()
    floors = response.multi_storey.floors
    built_up = sum(floor.built_up_area_sqm for floor in floors)
    envelope = sum((floor.envelope or {}).get("area_sqm", 0.0) for floor in floors)
    assert response.metrics.space_utilization_pct == pytest.approx(
        100.0 * built_up / envelope, abs=0.15
    )
    assert response.metrics.circulation_efficiency_pct == pytest.approx(
        circulation_efficiency_pct(_rooms(response.multi_storey)), abs=0.15
    )


def test_prefer_adjacency_is_not_invented():
    response = _generate()
    certificate = response.multi_storey.mathematical_certificate or {}
    assert certificate.get("prefer_adjacency_score") is None


def test_tolerated_minimum_is_a_declared_relaxation_with_a_warning():
    response = _generate()
    certificate = response.multi_storey.mathematical_certificate or {}
    declared = (certificate.get("details") or {}).get("declared_relaxations") or []
    assert declared, "the 12x15 T1 plate has a sub-minimum clear face; it must be declared"
    declared_rooms = {entry["room"] for entry in declared}
    warnings = [w for w in response.warnings if w.startswith("ROOM-MIN ") and "declared relaxation" in w]
    for room_id in declared_rooms:
        assert any(room_id in warning for warning in warnings), room_id
    # The relaxation is also carried on the room itself, not just in prose.
    relaxed = {
        room.room_id
        for floor in response.multi_storey.floors
        for room in floor.rooms
        if any(rel.get("rule_id") == "NBC-01" for rel in (room.relaxations or []))
    }
    assert declared_rooms <= relaxed
