import pytest
from app.services.landvalue_service import (
    match_guidance_entry,
    calculate_locality_multiplier,
    calculate_land_value
)

def test_guidance_coordinate_spatial_match():
    # Bengaluru coordinates (12.9716, 77.5946) within 12km radius -> matches blr_core even if address is blank!
    entry = match_guidance_entry(12.9716, 77.5946, "")
    assert entry is not None
    assert entry["id"] == "blr_core"
    assert entry["rate_inr_per_sqft"] == 8500.0

    # Guwahati coordinates (26.1445, 91.7362) -> matches gau_central without geocode
    entry_gau = match_guidance_entry(26.1445, 91.7362, "Site Coordinates")
    assert entry_gau is not None
    assert entry_gau["id"] == "gau_central"
    assert entry_gau["rate_inr_per_sqft"] == 3800.0


def test_locality_multiplier_clamping():
    # Optimal scores (100, 100) -> raw = 1.0 + 30/200 + 30/200 = 1.30 -> clamped to 1.25
    mult_high, b_high = calculate_locality_multiplier(100.0, 100.0)
    assert mult_high == 1.25
    assert b_high.is_clamped is True

    # Low scores (20, 20) -> raw = 1.0 - 50/200 - 50/200 = 0.50 -> clamped to 0.85
    mult_low, b_low = calculate_locality_multiplier(20.0, 20.0)
    assert mult_low == 0.85
    assert b_low.is_clamped is True

    # Baseline scores (70, 70) -> raw = 1.0 -> 1.0
    mult_base, b_base = calculate_locality_multiplier(70.0, 70.0)
    assert mult_base == 1.0
    assert b_base.is_clamped is False


def test_land_value_user_override():
    # User supplies 9500 /sqft override
    result = calculate_land_value(
        lat=12.97,
        lon=77.59,
        address="Bengaluru, Karnataka",
        road_score=75.0,
        facility_score=75.0,
        built_up_area_sqft=2000.0,
        floors=2,
        total_construction_cost_inr=5000000.0,
        override_rate_per_sqft=9500.0,
        plot_area_sqft=1800.0
    )
    assert result.is_user_override is True
    assert result.indicative_rate_per_sqft == 9500.0
    assert result.plot_area_sqft == 1800.0
    assert result.land_cost_inr == 1800.0 * 9500.0
    assert result.combined_project_total_inr == (1800.0 * 9500.0) + 5000000.0
    assert result.confidence_warning is None


def test_land_value_table_miss_without_override():
    # Remote coords outside all metro radii, address unrecognized
    result = calculate_land_value(
        lat=0.0,
        lon=0.0,
        address="Desert Outpost",
        road_score=60.0,
        facility_score=60.0,
        built_up_area_sqft=1500.0,
        floors=1,
        total_construction_cost_inr=3000000.0,
        override_rate_per_sqft=None
    )
    assert result.is_user_override is False
    assert result.indicative_rate_per_sqft is None
    assert result.land_cost_inr is None
    assert result.combined_project_total_inr is None
    assert result.confidence_warning is not None
    assert "No state guidance circle rate" in result.confidence_warning


def test_plot_area_derivation_from_ground_coverage():
    # 2400 sqft built-up, 2 floors -> footprint = 1200 sqft.
    # Ground coverage ratio 0.60 -> plot = 1200 / 0.60 = 2000 sqft
    result = calculate_land_value(
        lat=12.97,
        lon=77.59,
        address="Bengaluru",
        road_score=70.0,
        facility_score=70.0,
        built_up_area_sqft=2400.0,
        floors=2,
        total_construction_cost_inr=4000000.0,
        ground_coverage_ratio=0.60
    )
    assert result.plot_area_sqft == 2000.0
    assert result.ground_coverage_ratio_applied == 0.60


def test_stale_guidance_rate_warning(monkeypatch):
    """
    A circle rate older than two years must carry an
    explicit staleness confidence warning instead of reading as current.
    """
    from app.services import landvalue_service as lv

    stale_table = {
        "_meta": {"mandatory_disclaimer": "test disclaimer"},
        "entries": [{
            "id": "stale_zone",
            "city": "Stalecity",
            "zone_label": "Stale Zone A",
            "center_lat": 12.9716,
            "center_lon": 77.5946,
            "radius_km": 20.0,
            "rate_inr_per_sqft": 5000.0,
            "publication_source": "Historic Registry",
            "effective_year": 2020,
        }],
    }
    monkeypatch.setattr(lv, "_load_guidance_table", lambda: stale_table)

    result = lv.calculate_land_value(
        lat=12.9716,
        lon=77.5946,
        address="Anywhere",
        road_score=70.0,
        facility_score=70.0,
        built_up_area_sqft=2000.0,
        floors=1,
        total_construction_cost_inr=4_400_000.0,
    )
    assert result.as_of_year == 2020
    assert result.confidence_warning is not None
    assert "stale" in result.confidence_warning.lower()
