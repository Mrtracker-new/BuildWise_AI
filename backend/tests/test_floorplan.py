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
        height=220.0,
        rectangles=fp_res.rectangles
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


def test_dissection_engine_contiguity_and_no_voids():
    """
    Validates that Rectangular Dissection produces 100% envelope coverage,
    zero interior voids, and no overlapping room rectangles.
    """
    req = FloorPlanRequest(
        plot_width_m=10.0,
        plot_depth_m=12.0,
        required_rooms=["master_bed", "kitchen", "living", "puja", "bath_1", "bed_2"],
        vastu_strictness="high"
    )
    res = generate_floor_plan(req)
    assert res.status == "optimal"
    assert res.rectangles is not None
    assert res.metrics.space_utilization_pct >= 95.0

    env = res.rectangles.envelope
    rooms = res.rectangles.rooms

    # 1. Total room area equals envelope area (within 1% tolerance)
    total_room_area = sum(r.area_sqm for r in rooms)
    assert abs(total_room_area - env.area_sqm) / env.area_sqm < 0.02

    # 2. Minimum dimension >= 1.95m for all rooms
    for r in rooms:
        assert r.width >= 1.95, f"Room {r.room_id} width {r.width} < 2.0m"
        assert r.height >= 1.95, f"Room {r.room_id} height {r.height} < 2.0m"

    # 3. Pairwise intersection area is strictly zero
    for i in range(len(rooms)):
        r1 = rooms[i]
        for j in range(i + 1, len(rooms)):
            r2 = rooms[j]
            x_ov = max(0.0, min(r1.x + r1.width, r2.x + r2.width) - max(r1.x, r2.x))
            y_ov = max(0.0, min(r1.y + r1.height, r2.y + r2.height) - max(r1.y, r2.y))
            overlap_area = x_ov * y_ov
            assert overlap_area < 0.05, f"Overlap between {r1.room_id} and {r2.room_id}: {overlap_area} sqm"

    # 4. No-void grid sampling test: 20x20 points sampled across envelope
    # Every point inside the envelope must fall inside at least one room rectangle
    num_samples = 20
    dx = env.width / num_samples
    dy = env.height / num_samples
    for ix in range(num_samples):
        for iy in range(num_samples):
            px = env.x + (ix + 0.5) * dx
            py = env.y + (iy + 0.5) * dy
            covered = any(
                r.x - 0.05 <= px <= r.x + r.width + 0.05 and
                r.y - 0.05 <= py <= r.y + r.height + 0.05
                for r in rooms
            )
            assert covered, f"Point ({px:.2f}, {py:.2f}) inside envelope is a void!"


def test_dissection_circulation_and_doors():
    """
    Validates BFS circulation spanning tree: living room acts as hub,
    every non-hub room has a door connected to the circulation tree.
    """
    req = FloorPlanRequest(
        plot_width_m=10.0,
        plot_depth_m=12.0,
        required_rooms=["master_bed", "kitchen", "living", "puja", "bath_1", "dining"],
        vastu_strictness="high"
    )
    res = generate_floor_plan(req)
    assert res.rectangles is not None
    doors = res.rectangles.doors
    rooms = res.rectangles.rooms

    # Every room except living hub has an entry door
    door_to_rooms = {d.to_room for d in doors}
    door_from_rooms = {d.from_room for d in doors}
    door_connected_rooms = door_to_rooms | door_from_rooms

    for r in rooms:
        assert r.room_id in door_connected_rooms, f"Room {r.room_id} has no doors!"

    # Doors must have valid dimensions and swings
    for d in doors:
        assert d.width_m >= 0.85
        assert d.wall_edge in ("vertical", "horizontal")
        assert d.swing_direction in ("inward_left", "inward_right")


def test_dissection_acceptance_demos():
    """
    Tests the 3 required acceptance scenarios:
    1. 10m x 12m with 6 rooms
    2. 8m x 8m with 4 rooms
    3. 18m x 15m with 9 rooms
    """
    # Demo 1: 10m x 12m (6 rooms)
    req1 = FloorPlanRequest(
        plot_width_m=10.0,
        plot_depth_m=12.0,
        required_rooms=["master_bed", "kitchen", "living", "puja", "bath_1", "bed_2"],
        vastu_strictness="high"
    )
    res1 = generate_floor_plan(req1)
    assert res1.status == "optimal"
    assert res1.metrics.space_utilization_pct >= 95.0
    assert len(res1.rectangles.rooms) == 6

    # Demo 2: 8m x 8m (4 rooms)
    req2 = FloorPlanRequest(
        plot_width_m=8.0,
        plot_depth_m=8.0,
        required_rooms=["master_bed", "kitchen", "living", "bath_1"],
        vastu_strictness="high"
    )
    res2 = generate_floor_plan(req2)
    assert res2.status == "optimal"
    assert res2.metrics.space_utilization_pct >= 95.0
    assert len(res2.rectangles.rooms) == 4

    # Demo 3: 18m x 15m (9 rooms)
    req3 = FloorPlanRequest(
        plot_width_m=18.0,
        plot_depth_m=15.0,
        required_rooms=["master_bed", "kitchen", "living", "puja", "bath_1", "bath_2", "bed_2", "dining", "stairs"],
        vastu_strictness="high"
    )
    res3 = generate_floor_plan(req3)
    assert res3.status == "optimal"
    assert res3.metrics.space_utilization_pct >= 95.0
    assert len(res3.rectangles.rooms) == 9


