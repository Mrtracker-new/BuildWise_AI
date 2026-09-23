import pytest
import time
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.schemas.floorplan import FloorPlanRequest, FloorPlanResponse
from app.services.floorplan.grid_model import SpatialGrid, RoomBox
from app.services.floorplan.csp_engine import CSPEngine
from app.services.floorplan.floorplan_service import generate_floor_plan
from app.services.report_service import generate_pdf_report


def test_spatial_grid_discretization():
    grid = SpatialGrid(plot_width_m=10.0, plot_depth_m=12.0)
    assert grid.rows >= 8 and grid.cols >= 8
    assert grid.cell_w_m > 0 and grid.cell_d_m > 0

    # Test quadrant detection
    ne_box = RoomBox(room_id="puja", r=0, c=grid.cols - 2, w=2, h=2)
    assert grid.is_in_ne_quadrant(ne_box)

    se_box = RoomBox(room_id="kitchen", r=grid.rows - 2, c=grid.cols - 2, w=2, h=2)
    assert grid.is_in_se_quadrant(se_box)

    sw_box = RoomBox(room_id="master_bed", r=grid.rows - 3, c=0, w=3, h=3)
    assert grid.is_in_sw_quadrant(sw_box)


def test_high_vastu_quadrant_constraints():
    req = FloorPlanRequest(
        plot_width_m=10.0,
        plot_depth_m=12.0,
        required_rooms=["master_bed", "kitchen", "living", "puja", "bath_1"],
        vastu_strictness="high"
    )
    res = generate_floor_plan(req)
    assert res.status in ("optimal", "compromise")
    assert res.metrics.vastu_compliance_pct >= 80.0

    grid = SpatialGrid(10.0, 12.0)
    placement_map = {p.room_id: p for p in res.placements}

    # Kitchen must be in SE
    kitchen = placement_map.get("kitchen")
    assert kitchen is not None
    k_box = RoomBox(room_id="kitchen", r=kitchen.row, c=kitchen.col, w=kitchen.width, h=kitchen.height)
    assert grid.is_in_se_quadrant(k_box) or kitchen.zone in ("SE", "E")

    # Puja must be in NE
    puja = placement_map.get("puja")
    assert puja is not None
    p_box = RoomBox(room_id="puja", r=puja.row, c=puja.col, w=puja.width, h=puja.height)
    assert grid.is_in_ne_quadrant(p_box) or puja.zone == "NE"

    # Master Bed must be in SW
    mbed = placement_map.get("master_bed")
    assert mbed is not None
    m_box = RoomBox(room_id="master_bed", r=mbed.row, c=mbed.col, w=mbed.width, h=mbed.height)
    assert grid.is_in_sw_quadrant(m_box) or mbed.zone in ("SW", "S")

    # Bath_1 must NOT be in NE
    bath = placement_map.get("bath_1")
    assert bath is not None
    assert bath.zone != "NE"


def test_plumbing_adjacency():
    req = FloorPlanRequest(
        plot_width_m=12.0,
        plot_depth_m=12.0,
        required_rooms=["kitchen", "bath_1", "bath_2", "living", "master_bed"],
        vastu_strictness="medium"
    )
    res = generate_floor_plan(req)
    assert res.status in ("optimal", "compromise")
    assert res.metrics.plumbing_adjacency_score >= 40.0


def test_spatial_disjointness_and_containment():
    req = FloorPlanRequest(
        plot_width_m=12.0,
        plot_depth_m=14.0,
        required_rooms=["master_bed", "kitchen", "living", "puja", "bath_1", "bed_2"],
        vastu_strictness="high"
    )
    res = generate_floor_plan(req)

    # Check non-overlap
    boxes = [RoomBox(p.room_id, p.row, p.col, p.width, p.height) for p in res.placements]
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            assert not boxes[i].overlaps(boxes[j]), f"Collision between {boxes[i].room_id} and {boxes[j].room_id}"

    # Check grid containment
    grid = SpatialGrid(12.0, 14.0)
    for b in boxes:
        assert b.r >= 0 and b.c >= 0
        assert b.r_end <= grid.rows
        assert b.c_end <= grid.cols


def test_timeout_fallback_protection():
    grid = SpatialGrid(plot_width_m=8.0, plot_depth_m=8.0)
    # Extremely tight timeout (0.0001s) to force timeout guard trigger
    solver = CSPEngine(
        grid=grid,
        required_rooms=["master_bed", "kitchen", "living", "puja", "bath_1", "bath_2", "bed_2", "dining"],
        vastu_strictness="high",
        timeout_seconds=0.0001,
        max_iterations=100
    )
    placements, status, warnings = solver.solve()
    assert status in ("compromise", "failed")
    assert any("timeout" in w.lower() or "iteration" in w.lower() or "effort" in w.lower() for w in warnings)


def test_svg_blueprint_validity():
    req = FloorPlanRequest(
        plot_width_m=10.0,
        plot_depth_m=12.0,
        required_rooms=["master_bed", "kitchen", "living", "puja", "bath_1"],
        vastu_strictness="high"
    )
    res = generate_floor_plan(req)
    svg = res.svg_blueprint

    assert svg.startswith("<svg")
    assert svg.endswith("</svg>")
    assert "MASTER BEDROOM" in svg
    assert "KITCHEN" in svg
    assert "LIVING ROOM" in svg
    assert "MAIN ENTRY" in svg
    assert "GRAPHIC SCALE" in svg
    assert "stroke-linecap=\"square\"" in svg
    assert "<path d=" in svg  # Door swing arcs
    # Check that elliptical arc command 'A' is used in door swings
    assert " A " in svg
    # Check that 45-degree slashes are present on dimension lines (stroke-width 1.6)
    assert 'stroke-width="1.6"' in svg
    # Ensure no old wall cover rects exist (the old ones had height="6")
    assert 'height="6" fill=' not in svg



@pytest.mark.asyncio
async def test_api_generate_floorplan_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "plot_width_m": 10.0,
            "plot_depth_m": 12.0,
            "required_rooms": ["master_bed", "kitchen", "living", "puja", "bath_1"],
            "vastu_strictness": "high"
        }
        resp = await client.post("/api/generate-floorplan", json=payload)
        assert resp.status_code == 200
        data = resp.json()

        assert data["status"] in ("optimal", "compromise")
        assert "grid_matrix" in data
        assert "svg_blueprint" in data
        assert "metrics" in data
        assert data["metrics"]["vastu_compliance_pct"] > 0
        assert data["timing_ms"] >= 0.0


def test_pdf_report_with_floorplan_integration():
    req = FloorPlanRequest(
        plot_width_m=10.0,
        plot_depth_m=12.0,
        required_rooms=["master_bed", "kitchen", "living", "puja", "bath_1"],
        vastu_strictness="high"
    )
    fp_res = generate_floor_plan(req)

    analysis_data = {
        "request_id": "BW-TEST-FP",
        "timestamp": "2026-09-23T15:00:00Z",
        "coordinates": {"latitude": 12.9716, "longitude": 77.5946},
        "formatted_address": "Bengaluru, Karnataka, India",
        "overall_suitability_score": 82.5,
        "suitability_verdict": "High Feasibility",
        "factors": [],
        "cost_estimate": {"base_cost_inr": 4500000, "base_rate_per_sqft": 2250, "total_estimated_cost_inr": 4800000},
        "floorplan": fp_res.model_dump()
    }

    pdf_buffer = generate_pdf_report(analysis_data)
    pdf_bytes = pdf_buffer.getvalue()
    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 5000


def test_floorplan_duplicate_room_deduplication():
    req = FloorPlanRequest(
        plot_width_m=10.0,
        plot_depth_m=12.0,
        required_rooms=["kitchen", "kitchen", "puja", "living", "master_bed"],
        vastu_strictness="high"
    )
    assert len(req.required_rooms) == 4
    res = generate_floor_plan(req)
    assert res.status in ("optimal", "compromise")
    assert len(res.placements) == 4


def test_drawing_generation_with_pydantic_models():
    from app.services.floorplan.floorplan_service import create_floorplan_reportlab_drawing
    req = FloorPlanRequest(
        plot_width_m=10.0,
        plot_depth_m=12.0,
        required_rooms=["master_bed", "kitchen", "living", "puja", "bath_1"],
        vastu_strictness="high"
    )
    fp_res = generate_floor_plan(req)
    # Pass with actual Pydantic RoomPlacement objects
    data_with_objects = {
        "grid_matrix": fp_res.grid_matrix,
        "placements": fp_res.placements
    }
    drawing = create_floorplan_reportlab_drawing(data_with_objects)
    assert drawing is not None
    assert drawing.width == 480.0


def test_draw_floorplan_reportlab_direct():
    from app.services.report_service import draw_floorplan_reportlab
    req = FloorPlanRequest(
        plot_width_m=10.0,
        plot_depth_m=12.0,
        required_rooms=["master_bed", "kitchen", "living", "puja", "bath_1"],
        vastu_strictness="high"
    )
    fp_res = generate_floor_plan(req)
    drawing = draw_floorplan_reportlab(
        placements=fp_res.placements,
        grid_matrix=fp_res.grid_matrix,
        width=520.0,
        height=220.0
    )
    assert drawing is not None
    assert drawing.width == 520.0
    assert drawing.height == 220.0
    # Verify that shapes exist in drawing (Rect, Line, String, ArcPath)
    shape_types = {type(s).__name__ for s in drawing.contents}
    assert "Rect" in shape_types
    assert "Line" in shape_types
    assert "String" in shape_types
    assert "ArcPath" in shape_types

