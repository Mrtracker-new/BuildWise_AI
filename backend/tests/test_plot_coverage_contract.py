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
    # Denominator is the canonical polygon area, not the 60 x 60 clamp: the
    # plate would read ~207.5% against 3600 m² - the value that crashed the old
    # code path. It must instead agree with the polygon denominator exactly.
    plate_area = resp.multi_storey.floors[0].envelope["area_sqm"]
    expected = round(plate_area / TRACED_POLYGON["area_sqm"] * 100.0, 1)
    assert metrics.plot_coverage_pct == expected, (metrics.plot_coverage_pct, expected)
    assert metrics.plot_coverage_pct <= 100.0
    # Coverage is a HARD cap at solve time (audit F06/F02): the plate may not
    # exceed the requested 60% of the captured boundary.
    assert metrics.plot_coverage_pct <= 60.0 + 0.5, metrics.plot_coverage_pct
    assert not [w for w in (resp.warnings or []) if "over plot boundary" in w], (
        "a plate inside its boundary must not raise the over-plot warning"
    )


def test_tiny_plot_cannot_overhang_its_boundary():
    """The hard cap replaces the old overhang: a 600 m² plot keeps a 60% plate."""
    # 600 m² plot (20 x 30) whose requested plinth once forced a ~2160 m² plate.
    tiny_plot = _poly([[-20.0, 0.0], [0.0, 0.0], [0.0, 30.0], [-20.0, 30.0]], 600.0, [-20.0, 0.0, 0.0, 30.0])
    resp = generate_floor_plan(
        FloorPlanRequest(**BASE, floors=2, built_up_area_sqft=6000, plot_polygon=tiny_plot)
    )
    plate_area = resp.multi_storey.floors[0].envelope["area_sqm"]
    assert plate_area <= tiny_plot["area_sqm"] * 0.60 + 1.0, plate_area
    assert resp.metrics.plot_coverage_pct <= 60.0 + 0.5, resp.metrics.plot_coverage_pct
    assert not [w for w in (resp.warnings or []) if "over plot boundary" in w], (
        "the cap must make an overhanging plate impossible"
    )
    # The trim that made the cap hold is surfaced, not silently applied.
    assert [w for w in (resp.warnings or []) if w.startswith("LAND-10")], resp.warnings
