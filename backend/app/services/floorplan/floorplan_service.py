import time
from typing import List, Dict, Any, Optional

from reportlab.graphics.shapes import Drawing, Rect, Line, String, Group
from reportlab.lib import colors

from app.schemas.floorplan import (
    FloorPlanRequest,
    FloorPlanResponse,
    RoomPlacement,
    FloorPlanMetrics
)
from app.services.floorplan.grid_model import SpatialGrid, RoomBox, ROOM_CATALOG
from app.services.floorplan.constraints import (
    evaluate_vastu_compliance,
    evaluate_plumbing_adjacency,
    evaluate_space_utilization,
    evaluate_circulation_efficiency
)
from app.services.floorplan.csp_engine import CSPEngine
from app.services.floorplan.svg_generator import generate_blueprint_svg, PASTEL_COLORS


def generate_floor_plan(req: FloorPlanRequest) -> FloorPlanResponse:
    """
    Orchestrates architectural layout generation via CSP Backtracking.
    """
    t0 = time.perf_counter()

    grid = SpatialGrid(req.plot_width_m, req.plot_depth_m)

    # Clean requested rooms list: preserve order, unique items, fallback to default if empty
    req_rooms = []
    seen = set()
    for r in req.required_rooms:
        clean_r = r.strip().lower()
        if clean_r and clean_r not in seen:
            seen.add(clean_r)
            req_rooms.append(clean_r)

    if not req_rooms:
        req_rooms = ["master_bed", "kitchen", "living", "puja", "bath_1"]

    # Run CSP solver
    solver = CSPEngine(
        grid=grid,
        required_rooms=req_rooms,
        vastu_strictness=req.vastu_strictness,
        timeout_seconds=3.0,
        max_iterations=50000
    )
    placements_boxes, status, solver_warnings = solver.solve()
    elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 1)

    # Compute layout metrics
    vastu_pct, vastu_notes = evaluate_vastu_compliance(placements_boxes, grid)
    plumbing_score = evaluate_plumbing_adjacency(placements_boxes)
    built_sqm, util_pct = evaluate_space_utilization(placements_boxes, grid)
    circ_pct = evaluate_circulation_efficiency(placements_boxes)

    # Build 2D matrix (R x C)
    grid_matrix: List[List[str]] = [["empty" for _ in range(grid.cols)] for _ in range(grid.rows)]
    for box in placements_boxes:
        for r in range(box.r, box.r_end):
            for c in range(box.c, box.c_end):
                if 0 <= r < grid.rows and 0 <= c < grid.cols:
                    grid_matrix[r][c] = box.room_id

    # Format structured placements
    placements: List[RoomPlacement] = []
    for box in placements_boxes:
        cat = ROOM_CATALOG.get(box.room_id, {})
        w_m = round(box.w * grid.cell_w_m, 2)
        d_m = round(box.h * grid.cell_d_m, 2)
        zone = grid.get_zone(box)
        is_compliant = zone == cat.get("canonical_zone") or zone in cat.get("allowed_secondary", [])

        placements.append(
            RoomPlacement(
                room_id=box.room_id,
                room_name=cat.get("name", box.room_id.replace("_", " ").title()),
                row=box.r,
                col=box.c,
                width=box.w,
                height=box.h,
                area_sqm=round(w_m * d_m, 2),
                width_m=w_m,
                depth_m=d_m,
                zone=zone,
                vastu_compliant=is_compliant
            )
        )

    # Generate standalone SVG blueprint
    svg_blueprint = generate_blueprint_svg(
        placements=placements_boxes,
        grid=grid,
        plot_width_m=req.plot_width_m,
        plot_depth_m=req.plot_depth_m
    )

    all_warnings = list(solver_warnings)
    if status == "compromise" and not all_warnings:
        all_warnings.append("Secondary canonical room orientations were utilized to balance plumbing and structural circulation.")

    metrics = FloorPlanMetrics(
        vastu_compliance_pct=vastu_pct,
        plumbing_adjacency_score=plumbing_score,
        space_utilization_pct=util_pct,
        total_built_up_sqm=built_sqm,
        circulation_efficiency_pct=circ_pct
    )

    return FloorPlanResponse(
        status=status,
        grid_matrix=grid_matrix,
        placements=placements,
        svg_blueprint=svg_blueprint,
        metrics=metrics,
        warnings=all_warnings,
        timing_ms=elapsed_ms,
        iterations=solver.iterations
    )


def create_floorplan_reportlab_drawing(
    floorplan_data: Dict[str, Any],
    max_w: float = 480.0,
    max_h: float = 240.0
) -> Drawing:
    """
    Constructs a native ReportLab vector Drawing object from floor plan data for PDF reports.
    """
    grid_matrix = floorplan_data.get("grid_matrix") or []
    placements_raw = floorplan_data.get("placements") or []

    rows = len(grid_matrix) if grid_matrix else 10
    cols = len(grid_matrix[0]) if grid_matrix and grid_matrix[0] else 10

    # Calculate scale factor to fit within max_w x max_h
    cell_size = min(max_w / max(cols, 1), max_h / max(rows, 1)) * 0.85
    draw_w = cols * cell_size
    draw_h = rows * cell_size
    offset_x = (max_w - draw_w) / 2.0
    offset_y = (max_h - draw_h) / 2.0

    drawing = Drawing(max_w, max_h)

    # Background canvas
    drawing.add(Rect(0, 0, max_w, max_h, fillColor=colors.HexColor("#FFFFFF"), strokeColor=colors.HexColor("#CBD5E1"), strokeWidth=0.5))

    # Room color map
    color_map = {
        "master_bed": colors.HexColor("#F1F5F9"),
        "living": colors.HexColor("#F0FDF4"),
        "kitchen": colors.HexColor("#FEF3C7"),
        "puja": colors.HexColor("#FEF9C3"),
        "bath_1": colors.HexColor("#E0F2FE"),
        "bath_2": colors.HexColor("#E0F2FE"),
        "bed_2": colors.HexColor("#F8FAFC"),
        "dining": colors.HexColor("#FDF2F8"),
        "stairs": colors.HexColor("#F5F3FF"),
        "corridor": colors.white
    }

    # Draw rooms
    for p in placements_raw:
        if isinstance(p, dict):
            rid = p.get("room_id", "")
            r = int(p.get("row", 0))
            c = int(p.get("col", 0))
            w = int(p.get("width", 1))
            h = int(p.get("height", 1))
            name = str(p.get("room_name", rid.upper()))
            area_m = float(p.get("area_sqm", 0.0))
        else:
            rid = getattr(p, "room_id", "")
            r = int(getattr(p, "row", 0))
            c = int(getattr(p, "col", 0))
            w = int(getattr(p, "width", 1))
            h = int(getattr(p, "height", 1))
            name = str(getattr(p, "room_name", rid.upper()))
            area_m = float(getattr(p, "area_sqm", 0.0))

        # In ReportLab, Y is 0 at bottom, increasing upwards
        rx = offset_x + (c * cell_size)
        ry = offset_y + ((rows - (r + h)) * cell_size)
        rw = w * cell_size
        rh = h * cell_size

        fcolor = color_map.get(rid, colors.HexColor("#F8FAFC"))
        drawing.add(Rect(rx, ry, rw, rh, fillColor=fcolor, strokeColor=colors.HexColor("#0F172A"), strokeWidth=1.5))

        # Centered label
        cx = rx + (rw / 2.0)
        cy = ry + (rh / 2.0)
        drawing.add(String(cx, cy + 2, name[:12], fontName="Helvetica-Bold", fontSize=7.5, textAnchor="middle", fillColor=colors.HexColor("#0F172A")))
        drawing.add(String(cx, cy - 8, f"{area_m:.1f} m²", fontName="Helvetica", fontSize=6.5, textAnchor="middle", fillColor=colors.HexColor("#64748B")))

    # North arrow badge in top-right
    compass_x = max_w - 25.0
    compass_y = max_h - 25.0
    drawing.add(String(compass_x, compass_y, "↑ N", fontName="Helvetica-Bold", fontSize=8, textAnchor="middle", fillColor=colors.HexColor("#0F172A")))

    return drawing
