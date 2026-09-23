import pytest
from unittest.mock import patch, MagicMock
from app.services.vastu_service import (
    rank_entrances,
    compute_slope_reading,
    fetch_nearest_road_approach,
    evaluate_vastu_advisory
)
from app.schemas.response import RoadApproach

def test_vastu_entrance_ranking_south_road():
    """
    Amendment 6: A south-approach plot (180 deg) yields top three NE, E, S
    with S carrying is_approach_side True, carrying the approach bonus and approach rationale.
    """
    south_road = RoadApproach(
        bearing_degrees=180.0,
        approach_side="S",
        distance_meters=25.0,
        is_fallback=False
    )
    ranked = rank_entrances(south_road)
    assert len(ranked) == 3

    top_directions = [r.direction for r in ranked]
    assert top_directions == ["NE", "E", "S"]

    # Verify S properties
    s_entry = next(r for r in ranked if r.direction == "S")
    assert s_entry.is_approach_side is True
    assert "access road" in s_entry.practical_rationale
    assert s_entry.score == 85.0  # Base 45 + climate 5 + approach 35 = 85


def test_vastu_entrance_ranking_north_road():
    """
    A north-approach plot (0 deg) aligns with canonical Kubera face.
    """
    north_road = RoadApproach(
        bearing_degrees=0.0,
        approach_side="N",
        distance_meters=15.0,
        is_fallback=False
    )
    ranked = rank_entrances(north_road)
    top_directions = [r.direction for r in ranked]
    assert "N" in top_directions
    n_entry = next(r for r in ranked if r.direction == "N")
    assert n_entry.is_approach_side is True
    assert n_entry.score == 140.0  # Base 95 + climate 10 + approach 35 = 140


def test_vastu_overpass_fallback_no_fabricated_geometry():
    """
    Amendment 1: When Overpass times out or fails, bearing is None, side is 'unknown',
    is_fallback is True, approach bonus is skipped, and entrance ranking is based on Vastu + climate only.
    """
    fallback_road = RoadApproach(
        bearing_degrees=None,
        approach_side="unknown",
        distance_meters=None,
        is_fallback=True
    )
    ranked = rank_entrances(fallback_road)
    top_directions = [r.direction for r in ranked]
    assert top_directions == ["NE", "N", "E"]
    # All approach flags must be False
    for r in ranked:
        assert r.is_approach_side is False


def test_slope_auspiciousness():
    # Synthetic slope reading for Bengaluru
    reading = compute_slope_reading(920.0, 12.9716, 77.5946)
    assert reading.drainage_direction in ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    assert reading.auspiciousness in ["favourable", "neutral", "requires_remedy"]
    if reading.auspiciousness == "requires_remedy":
        assert reading.remedy_notes is not None


@pytest.mark.asyncio
async def test_evaluate_vastu_advisory_flow():
    # Mock Overpass HTTP failure to test graceful fallback
    with patch("httpx.AsyncClient.post", side_effect=Exception("Overpass timeout")):
        advisory, warnings = await evaluate_vastu_advisory(12.9716, 77.5946, 920.0)
        assert advisory.road_approach.is_fallback is True
        assert advisory.road_approach.bearing_degrees is None
        assert advisory.road_approach.approach_side == "unknown"
        assert len(advisory.ranked_entrances) == 3
        assert len(advisory.room_grid) == 9
        assert len(advisory.reconciliation_notes) >= 4
        assert len(warnings) > 0
        assert "Road network telemetry unavailable" in warnings[0]
