"""Plot-coverage metric contract (traced-polygon regression).

Regression origin: a real funnel request (a traced trapezoid boundary, 9050.5 m²,
sent alongside the clamped ``plot_width_m``/``plot_depth_m`` = 60/60) returned
HTTP 500:

    FloorPlanMetrics.plot_coverage_pct
      Input should be less than or equal to 100 [input_value=207.5]

The metric divided the ground-plate area by the *clamped rectangle* (60 x 60 =
3600 m²) instead of the canonical plot area, so a legitimate request crashed the
report funnel's blueprint step.

Pinned invariants:
  1. The coverage denominator is the SAME plot area as the FAR check: the
     canonical polygon area when a traced boundary is supplied.
  2. ``plot_coverage_pct`` stays inside its declared 0..100 contract for every
     input, so the metrics model can never 500 on a valid request.
  3. A footprint that genuinely overhangs the boundary is disclosed: capped at
     100% AND reported through ``response.warnings`` (the list the API returns
     and the UI renders) - never silently.
"""

from app.schemas.floorplan import FloorPlanRequest
from app.services.floorplan.floorplan_service import generate_floor_plan


# The exact payload captured from the failing E2E run (traced boundary).
TRACED_POLYGON = {
    "vertices": [[-118.76, 50.386], [-49.879, 50.386], [-49.879, 176.35], [-124.698, 176.35]],
    "shape_type": "trapezoid",
    "area_sqm": 9050.51,
    "perimeter_m": 395.77,
    "bounding_box": [-124.698, 50.386, -49.879, 176.35],
    "is_regular_rectangle": False,
}

BASE = {
    "plot_width_m": 60.0,
    "plot_depth_m": 60.0,
    "required_rooms": ["master_bed", "kitchen", "living", "bath_1"],
    "vastu_strictness": "high",
    "building_typology": "residential_single",
    "quality_grade": "standard",
    "ground_coverage_ratio": 0.6,
    "bypass_cache": True,
    "design_intent": "maximize_enclosed",
}


def _poly(vertices, area, bbox):
    return {
        "vertices": vertices,
        "shape_type": "trapezoid",
        "area_sqm": area,
        "perimeter_m": 0.0,
        "bounding_box": bbox,
        "is_regular_rectangle": False,
    }


def test_traced_boundary_never_crashes_the_metrics_contract():
    """The captured 500 payload now solves, with coverage measured on the polygon."""
    resp = generate_floor_plan(
        FloorPlanRequest(**BASE, floors=1, built_up_area_sqft=2000, plot_polygon=TRACED_POLYGON)
    )
    metrics = resp.metrics
    assert 0.0 <= metrics.plot_coverage_pct <= 100.0
    # Denominator is the canonical polygon area, not the 60 x 60 clamp:
    # the plate is ~7469 m², i.e. ~82.5% of 9050.5 m² (it would read 207.5%
    # against 3600 m² - the value that crashed the old code path).
    assert metrics.plot_coverage_pct == 82.5, metrics.plot_coverage_pct
    plate_area = resp.multi_storey.floors[0].envelope["area_sqm"]
    expected = round(plate_area / TRACED_POLYGON["area_sqm"] * 100.0, 1)
    assert metrics.plot_coverage_pct == expected
    assert not [w for w in (resp.warnings or []) if "over plot boundary" in w], (
        "a plate inside its boundary must not raise the over-plot warning"
    )


def test_overhanging_plate_is_capped_and_disclosed():
    """A plate larger than its plot: 100% cap + an explicit warning in the response."""
    # 600 m² plot (20 x 30) whose requested plinth forces a ~2160 m² ground plate.
    tiny_plot = _poly([[-20.0, 0.0], [0.0, 0.0], [0.0, 30.0], [-20.0, 30.0]], 600.0, [-20.0, 0.0, 0.0, 30.0])
    resp = generate_floor_plan(
        FloorPlanRequest(**BASE, floors=2, built_up_area_sqft=6000, plot_polygon=tiny_plot)
    )
    assert resp.metrics.plot_coverage_pct == 100.0
    plate_area = resp.multi_storey.floors[0].envelope["area_sqm"]
    assert plate_area > tiny_plot["area_sqm"], "fixture no longer produces an overhang"
    over = [w for w in (resp.warnings or []) if "over plot boundary" in w]
    assert len(over) == 1, resp.warnings
    # The disclosure carries the real numbers, not just a flag.
    assert f"{plate_area:.1f}" in over[0]
    assert "600.0" in over[0]
