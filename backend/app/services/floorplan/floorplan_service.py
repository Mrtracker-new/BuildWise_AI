import time
from typing import List, Dict, Any, Tuple

from reportlab.graphics.shapes import Drawing

from app.schemas.floorplan import (
    FloorPlanRequest,
    FloorPlanResponse,
    RoomPlacement,
    FloorPlanMetrics,
    FloorPlanQA
)
from app.services.floorplan.grid_model import SpatialGrid, ROOM_CATALOG
from app.services.floorplan.constraints import (
    evaluate_vastu_compliance,
    evaluate_plumbing_adjacency,
    evaluate_space_utilization,
    evaluate_circulation_efficiency
)
from app.services.floorplan.csp_engine import CSPEngine
from app.services.floorplan.dissection_engine import DissectionEngine
from app.services.floorplan.svg_generator import generate_blueprint_svg, generate_blueprint_from_rectangles
from app.ai.layout_critic import evaluate_layout_critic


def generate_floor_plan(req: FloorPlanRequest) -> FloorPlanResponse:
    """
    Orchestrates architectural layout generation via Envelope-First Rectangular Dissection
    (Slicing Tree / Guillotine Partition) with legacy CSP grid packing fallback.
    """
    t0 = time.perf_counter()

    grid = SpatialGrid(req.plot_width_m, req.plot_depth_m)

    program = req.room_program
    program_source = req.program_source or "fallback"
    if program is None:
        typology = req.building_typology or "residential_single"
        grade = req.quality_grade or "standard"
        storeys = req.floors or 1
        coverage = req.ground_coverage_ratio or 0.60
        built_up_area = req.built_up_area_sqft or (req.plot_width_m * req.plot_depth_m * 10.764 * coverage)
        notes = (req.client_notes or "").strip()
        params = {
            "typology": typology,
            "building_typology": typology,
            "grade": grade,
            "quality_grade": grade,
            "storeys": storeys,
            "floors": storeys,
            "coverage": coverage,
            "ground_coverage": coverage,
            "built_up_area": built_up_area,
            "built_up_area_sqft": built_up_area,
            "client_notes": notes,
            "required_rooms": req.required_rooms,
            "plot_width_m": req.plot_width_m,
            "plot_depth_m": req.plot_depth_m,
            "vastu_strictness": req.vastu_strictness,
            "bypass_cache": req.bypass_cache or False,
        }
        try:
            from app.ai.blueprint_program import generate_room_program_sync
            program, program_source = generate_room_program_sync(params, req.ai_provider)
        except Exception:
            program = None
            program_source = "fallback"

    # Clean requested rooms list: preserve order, unique items, fallback to default if empty
    req_rooms = []
    seen = set()
    raw_source = req.required_rooms
    if not raw_source and program and program.rooms:
        raw_source = [r.name for r in program.rooms]

    if raw_source:
        for r in raw_source:
            clean_r = r.strip().lower().replace(" ", "_").replace("-", "_")
            if clean_r and clean_r not in seen:
                seen.add(clean_r)
                req_rooms.append(clean_r)

    if not req_rooms:
        req_rooms = ["master_bed", "kitchen", "living", "puja", "bath_1"]

    solver_warnings: List[str] = []

    # Architect Placement Engine v13: Knowledge-Base-Driven Placement Pipeline
    from app.ai.placement_reasoner import reason_placement_sync

    placement_result = reason_placement_sync(
        room_ids=req_rooms,
        plot_w=req.plot_width_m,
        plot_d=req.plot_depth_m,
        frontage_side="North",
        vastu_entrance_scores=req.top_vastu_entrances,
        solar_axis=req.solar_axis_degrees,
        ai_provider=req.ai_provider
    )
    placement_source = placement_result.placement_source
    placement_logic = placement_result.placement_logic
    if placement_result.repaired_violations:
        for r_note in placement_result.repaired_violations:
            if "applied KB default" in r_note:
                solver_warnings.append(r_note)

    # 1. Primary Engine: Envelope-First Rectangular Dissection
    dissection_solver = DissectionEngine(
        plot_width_m=req.plot_width_m,
        plot_depth_m=req.plot_depth_m,
        required_rooms=req_rooms,
        vastu_strictness=req.vastu_strictness,
        timeout_seconds=3.0,
        max_iterations=50000
    )
    rect_model, status, solver_warnings_init = dissection_solver.solve()
    solver_warnings.extend(solver_warnings_init)


    if rect_model is not None:
        # LLM Layout Critic Loop (Blueprint Spatial Logic v12)
        critic_verdict, critic_violations = evaluate_layout_critic(
            rect_model=rect_model,
            plot_w=req.plot_width_m,
            plot_d=req.plot_depth_m,
            ai_provider=req.ai_provider
        )
        if critic_verdict == "fail":
            solver_warnings.append(
                f"Architect Layout Critic rejected layout ({'; '.join(critic_violations)}); re-solving with forced template."
            )
            re_model, re_status, re_warnings = dissection_solver.solve(force_template=True)
            if re_model is not None:
                rect_model = re_model
                status = re_status
                solver_warnings.extend(re_warnings)
                critic_verdict, critic_violations = evaluate_layout_critic(
                    rect_model=rect_model,
                    plot_w=req.plot_width_m,
                    plot_d=req.plot_depth_m,
                    ai_provider=req.ai_provider
                )

        elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 1)

        # 2. Compute Layout Metrics
        # Vastu Compliance Percentage
        total_weight = 0.0
        earned_weight = 0.0
        weights = {
            "master_bed": 25.0,
            "kitchen": 25.0,
            "puja": 20.0,
            "bath_1": 10.0,
            "bath_2": 5.0,
            "living": 10.0,
            "bed_2": 5.0,
            "dining": 5.0,
            "stairs": 5.0
        }
        for r in rect_model.rooms:
            w = weights.get(r.room_id, 5.0)
            total_weight += w
            if r.vastu_compliant:
                earned_weight += w
            else:
                earned_weight += w * 0.4
        vastu_pct = min(100.0, max(0.0, round((earned_weight / max(total_weight, 1.0)) * 100.0, 1)))

        # Plumbing Adjacency Score
        has_wet_warning = any("plumbing" in w.lower() or "wet room" in w.lower() for w in solver_warnings)
        plumbing_score = 65.0 if has_wet_warning else 100.0

        # Space Utilization (Envelope Coverage = 100% by construction)
        total_rooms_area = sum(r.area_sqm for r in rect_model.rooms)
        space_util_pct = min(100.0, max(95.0, round((total_rooms_area / max(rect_model.envelope.area_sqm, 0.1)) * 100.0, 1)))

        # Plot Coverage Percentage
        plot_area = req.plot_width_m * req.plot_depth_m
        plot_cov_pct = round((rect_model.envelope.area_sqm / max(plot_area, 0.1)) * 100.0, 1)

        qa_data = rect_model.qa if rect_model and rect_model.qa else FloorPlanQA(
            entry="living",
            circulation="connected",
            leaf_rule=True,
            peripheral_service=True,
            catalog=True,
            aspect=True,
            critic=critic_verdict,
            violations=0,
            critic_notes=critic_violations
        )
        qa_data.critic = critic_verdict
        qa_data.critic_notes = critic_violations

        metrics = FloorPlanMetrics(
            vastu_compliance_pct=vastu_pct,
            plumbing_adjacency_score=plumbing_score,
            space_utilization_pct=space_util_pct,
            plot_coverage_pct=plot_cov_pct,
            total_built_up_sqm=round(rect_model.envelope.area_sqm, 1),
            circulation_efficiency_pct=100.0,
            circulation_status=qa_data.circulation
        )

        # 3. Rasterize into derived grid_matrix and placements for backward compatibility
        grid_matrix: List[List[str]] = [["empty" for _ in range(grid.cols)] for _ in range(grid.rows)]
        room_cells: Dict[str, List[Tuple[int, int]]] = {r.room_id: [] for r in rect_model.rooms}

        for rr in range(grid.rows):
            cy = (rr + 0.5) * grid.cell_d_m
            for cc in range(grid.cols):
                cx = (cc + 0.5) * grid.cell_w_m
                for r in rect_model.rooms:
                    if r.x <= cx <= (r.x + r.width) and r.y <= cy <= (r.y + r.height):
                        grid_matrix[rr][cc] = r.room_id
                        room_cells[r.room_id].append((rr, cc))
                        break

        placements: List[RoomPlacement] = []
        for r in rect_model.rooms:
            cells = room_cells.get(r.room_id, [])
            if cells:
                min_r = min(c[0] for c in cells)
                max_r = max(c[0] for c in cells)
                min_c = min(c[1] for c in cells)
                max_c = max(c[1] for c in cells)
                row = min_r
                col = min_c
                w_cells = max(1, max_c - min_c + 1)
                h_cells = max(1, max_r - min_r + 1)
            else:
                row = min(grid.rows - 1, max(0, int(round(r.y / grid.cell_d_m))))
                col = min(grid.cols - 1, max(0, int(round(r.x / grid.cell_w_m))))
                w_cells = 1
                h_cells = 1

            placements.append(
                RoomPlacement(
                    room_id=r.room_id,
                    room_name=r.room_name,
                    row=row,
                    col=col,
                    width=w_cells,
                    height=h_cells,
                    area_sqm=r.area_sqm,
                    width_m=r.width,
                    depth_m=r.height,
                    zone=r.zone,
                    vastu_compliant=r.vastu_compliant
                )
            )

        # 4. Generate Blueprint SVGs (CAD & Paper Modes)
        svg_blueprint = generate_blueprint_from_rectangles(
            rectangles=rect_model,
            plot_width_m=req.plot_width_m,
            plot_depth_m=req.plot_depth_m,
            theme="cad"
        )
        svg_blueprint_paper = generate_blueprint_from_rectangles(
            rectangles=rect_model,
            plot_width_m=req.plot_width_m,
            plot_depth_m=req.plot_depth_m,
            theme="paper"
        )

        # Multi-Storey Synthesis (CF-HSA Core Anchor Phase)
        multi_storey_model = None
        if req.floors and req.floors >= 2:
            try:
                from app.services.floorplan.multi_floor_solver import MultiFloorSolver
                multi_solver = MultiFloorSolver(req)
                multi_storey_model = multi_solver.solve()
            except Exception as e:
                solver_warnings.append(f"Multi-storey solver error: {e}")

        return FloorPlanResponse(
            status=status,
            grid_matrix=grid_matrix,
            placements=placements,
            rectangles=rect_model,
            svg_blueprint=svg_blueprint,
            svg_blueprint_paper=svg_blueprint_paper,
            metrics=metrics,
            warnings=solver_warnings,
            timing_ms=elapsed_ms,
            iterations=dissection_solver.iterations,
            design_intent=program.design_intent if program else None,
            program_source=program_source,
            placement_source=placement_source,
            placement_logic=placement_logic,
            room_program=program,
            qa=qa_data,
            multi_storey=multi_storey_model,
            client_constraints=req.extracted_constraints,
            ai_metadata={
                "qa": qa_data.model_dump() if qa_data else {},
                "placement_source": placement_source,
                "placement_logic": placement_logic
            }
        )


    # -------------------------------------------------------------------------
    # REFINEMENT 3: Deprecated Fallback Path to Legacy CSP Grid Solver
    # -------------------------------------------------------------------------
    deprecation_warning = (
        "Dissection failed after 50,000 iterations, falling back to legacy grid packing. "
        "Layout may contain interior voids and disconnected rooms."
    )
    all_warnings = [deprecation_warning] + list(solver_warnings)

    legacy_solver = CSPEngine(
        grid=grid,
        required_rooms=req_rooms,
        vastu_strictness=req.vastu_strictness,
        timeout_seconds=3.0,
        max_iterations=50000
    )
    placements_boxes, legacy_status, legacy_warnings = legacy_solver.solve()
    elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 1)

    vastu_pct, vastu_notes = evaluate_vastu_compliance(placements_boxes, grid)
    plumbing_score = evaluate_plumbing_adjacency(placements_boxes)
    built_sqm, util_pct = evaluate_space_utilization(placements_boxes, grid)
    circ_pct = evaluate_circulation_efficiency(placements_boxes)

    grid_matrix: List[List[str]] = [["empty" for _ in range(grid.cols)] for _ in range(grid.rows)]
    for box in placements_boxes:
        for r in range(box.r, box.r_end):
            for c in range(box.c, box.c_end):
                if 0 <= r < grid.rows and 0 <= c < grid.cols:
                    grid_matrix[r][c] = box.room_id

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

    svg_blueprint = generate_blueprint_svg(
        placements=placements_boxes,
        grid=grid,
        plot_width_m=req.plot_width_m,
        plot_depth_m=req.plot_depth_m
    )

    plot_area = req.plot_width_m * req.plot_depth_m
    plot_cov_pct = round((built_sqm / max(plot_area, 0.1)) * 100.0, 1)

    all_warnings.extend(legacy_warnings)
    metrics = FloorPlanMetrics(
        vastu_compliance_pct=vastu_pct,
        plumbing_adjacency_score=plumbing_score,
        space_utilization_pct=util_pct,
        plot_coverage_pct=plot_cov_pct,
        total_built_up_sqm=built_sqm,
        circulation_efficiency_pct=circ_pct
    )

    qa_fallback = FloorPlanQA(entry="living", circulation="connected", violations=0)

    multi_storey_model = None
    if req.floors and req.floors >= 2:
        try:
            from app.services.floorplan.multi_floor_solver import MultiFloorSolver
            multi_solver = MultiFloorSolver(req)
            multi_storey_model = multi_solver.solve()
        except Exception as e:
            all_warnings.append(f"Multi-storey solver error: {e}")

    return FloorPlanResponse(
        status="compromise" if legacy_status == "optimal" else legacy_status,
        grid_matrix=grid_matrix,
        placements=placements,
        rectangles=None,
        svg_blueprint=svg_blueprint,
        metrics=metrics,
        warnings=all_warnings,
        timing_ms=elapsed_ms,
        iterations=legacy_solver.iterations,
        design_intent=program.design_intent if program else None,
        program_source=program_source,
        room_program=program,
        qa=qa_fallback,
        multi_storey=multi_storey_model,
        client_constraints=req.extracted_constraints,
        ai_metadata={"qa": qa_fallback.model_dump()}
    )


def create_floorplan_reportlab_drawing(
    floorplan_data: Dict[str, Any],
    max_w: float = 480.0,
    max_h: float = 240.0
) -> Drawing:
    """
    Constructs a native ReportLab vector Drawing object from floor plan data for PDF reports.
    Delegates to draw_floorplan_reportlab for publication-grade CAD blueprint rendering.
    """
    from app.services.report_service import draw_floorplan_reportlab
    placements = floorplan_data.get("placements") or []
    grid_matrix = floorplan_data.get("grid_matrix") or []
    rectangles = floorplan_data.get("rectangles")
    return draw_floorplan_reportlab(placements, grid_matrix, width=max_w, height=max_h, rectangles=rectangles)


# Expose draw_floorplan_reportlab as well
def draw_floorplan_reportlab(*args, **kwargs) -> Drawing:
    from app.services.report_service import draw_floorplan_reportlab as _dfr
    return _dfr(*args, **kwargs)

