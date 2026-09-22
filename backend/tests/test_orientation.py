from app.services.orientation_service import calculate_building_orientation

def test_orientation_northern_hemisphere():
    # Bengaluru latitude ~ 12.97 deg N
    orient = calculate_building_orientation(latitude=12.97, wind_dir_deg=240.0)
    assert 75.0 <= orient.optimal_axis_degrees <= 105.0
    assert "East-West" in orient.axis_label
    assert "North" in orient.solar_exposure_summary
    assert orient.cross_ventilation_rating in ["Excellent", "Good", "Moderate"]

def test_orientation_southern_hemisphere():
    # Sydney latitude ~ -33.86 deg S
    orient = calculate_building_orientation(latitude=-33.86, wind_dir_deg=90.0)
    assert 75.0 <= orient.optimal_axis_degrees <= 105.0
    assert "South" in orient.solar_exposure_summary
