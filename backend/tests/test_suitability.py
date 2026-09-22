import pytest
from app.services.suitability_service import (
    calculate_slope_score,
    calculate_flood_score,
    evaluate_land_suitability
)

def test_slope_score_boundaries():
    score_flat, status_flat, _ = calculate_slope_score(2.0)
    assert score_flat == 100.0
    assert status_flat == "optimal"

    score_gentle, status_gentle, _ = calculate_slope_score(6.0)
    assert 70.0 <= score_gentle < 85.0
    assert status_gentle == "optimal"

    score_steep, status_steep, _ = calculate_slope_score(18.0)
    assert 20.0 <= score_steep <= 45.0
    assert status_steep == "critical"

def test_flood_score_boundaries():
    score_high_elev, status_high, _ = calculate_flood_score(500.0, 800.0)
    assert score_high_elev >= 80.0
    assert status_high == "optimal"

    score_low_elev, status_low, _ = calculate_flood_score(5.0, 1800.0)
    assert score_low_elev < 75.0

def test_overall_suitability_weights():
    climate = {
        "temperature_max_c": 30.0,
        "temperature_min_c": 20.0,
        "wind_speed_kmh": 12.0,
        "annual_precipitation_mm": 900.0
    }
    score, verdict, factors = evaluate_land_suitability(
        lat=12.97,
        lon=77.59,
        elevation_m=920.0,
        slope_pct=2.5,
        climate=climate
    )
    assert len(factors) == 5
    total_weight = sum(f.weight for f in factors)
    assert pytest.approx(total_weight, 0.001) == 1.0
    assert 0.0 <= score <= 100.0
    assert verdict in ["Suitable", "Conditionally Suitable", "Challenging"]
