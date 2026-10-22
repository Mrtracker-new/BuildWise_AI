import time
from typing import Dict, Any

from reportlab.graphics.shapes import Drawing

from app.schemas.floorplan import FloorPlanMetrics, FloorPlanRequest, FloorPlanResponse


def generate_floor_plan(req: FloorPlanRequest) -> FloorPlanResponse:
    """
    Sole geometry engine pipeline for all architectural layout generation.
    Parameterized exclusively by the Universal Space Semantics Ontology
    and typology profiles.
    """
    from app.services.floorplan.engine import SoleGeometryEngine
    engine = SoleGeometryEngine(req)
    t0 = time.perf_counter()
    try:
        response = engine.solve_floorplan_response()
        # A selected scheme may not partition this plate into a certifiable
        # plan. Refusing to ship it is the honest behaviour: keep the certified
        # baseline geometry, record the selection, and name the failing layers
        # so the picker never wraps a NON-COMPLIANT plan in a "feasible" badge.
        if (
            req.selected_scheme_id
            and engine.scheme_selection_note
            and response.qa is not None
            and response.qa.validation_gate_status == "FAIL"
        ):
            _failing = [
                f"{l['layer_id']} {l.get('title', '')}".strip()
                for l in ((engine.gate_report or {}).get("layers") or [])
                if l.get("status") == "FAIL"
            ]
            _fallback_req = req.model_copy(update={"selected_scheme_id": None})
            response = SoleGeometryEngine(_fallback_req).solve_floorplan_response()
            response.selected_scheme_id = req.selected_scheme_id
            response.warnings.append(
                f"SCHEME-SELECTION: profile '{req.selected_scheme_id}' produced a "
                "non-compliant plan (" + (", ".join(_failing) or "gate FAIL") +
                "); the certified baseline geometry is kept and the selection is "
                "recorded for the report."
            )
            if response.params_snapshot is not None:
                response.params_snapshot["scheme_selection_status"] = "rejected_non_compliant"
                response.params_snapshot["scheme_selection_failing_layers"] = _failing
                response.params_snapshot["scheme_profile"] = None
        # Record what ACTUALLY happened to the selection, so the picker and the
        # report never claim a profile shaped a plan it did not (audit F09).
        if req.selected_scheme_id and response.params_snapshot is not None:
            response.selected_scheme_id = req.selected_scheme_id
            if "scheme_selection_status" not in response.params_snapshot:
                response.params_snapshot["scheme_selection_status"] = (
                    "applied" if engine.presolved_room_sets else "recorded_only"
                )
            if response.params_snapshot.get("scheme_selection_status") != "rejected_non_compliant":
                response.params_snapshot["scheme_profile"] = (
                    req.selected_scheme_id
                    if response.params_snapshot["scheme_selection_status"] == "applied"
                    else None
                )
            response.params_snapshot["selected_scheme_id"] = req.selected_scheme_id
    except ValueError as exc:
        # A hard invariant the solver could not satisfy (for example a
        # forbidden kitchen/bath shared wall on a concave plot) must be an
        # explicit FAILED answer the client can explain, never a 500. Anything
        # that is not a declared hard-constraint violation still raises: real
        # bugs must stay loud.
        if "Hard Constraint Violation" not in str(exc):
            raise
        elapsed = round((time.perf_counter() - t0) * 1000.0, 2)
        response = FloorPlanResponse(
            status="failed",
            grid_matrix=[],
            placements=[],
            rectangles=None,
            svg_blueprint="",
            metrics=FloorPlanMetrics(
                vastu_compliance_pct=0.0,
                plumbing_adjacency_score=0.0,
                space_utilization_pct=0.0,
                plot_coverage_pct=0.0,
                total_built_up_sqm=0.0,
                circulation_efficiency_pct=0.0,
                circulation_status="unresolved",
            ),
            warnings=[f"GEN-FAIL: {exc}"],
            timing_ms=elapsed,
            iterations=0,
            unmet_requirements=[{
                "room_id": "all_requested",
                "reason": str(exc),
            }],
            generation_id=f"GEN-FAIL-{getattr(engine, 'typology', 'T1')}",
            seed=str(getattr(engine, "seed", "42")),
        )
    if getattr(req, "include_scheme_alternatives", False):
        # Additive scheme portfolio.  The legacy geometry above is untouched,
        # so default responses remain byte-equivalent.
        from app.services.floorplan.scheme_solver import generate_ranked_schemes
        portfolio = generate_ranked_schemes(req)
        # The picker reads metrics, warnings and provenance; it never renders an
        # alternative's sheets (choosing one re-solves and returns real ones).
        # Serialising ~240 KiB of SVG per alternative inflated every generation
        # response by ~1.8 MiB for drawing nobody draws, so the sheets are dropped
        # from the ALTERNATIVES only - rooms stay, so the geometry is still there.
        for _alt in portfolio.alternatives:
            for _floor in _alt.floors:
                _floor.svg_blueprint_cad = None
                _floor.svg_blueprint_paper = None
        response.scheme_alternatives = list(portfolio.alternatives)
        response.scheme_portfolio = portfolio
        response.selected_scheme_id = portfolio.selected_scheme_id or getattr(req, "selected_scheme_id", None)
        if response.params_snapshot is not None:
            response.params_snapshot["selected_scheme_id"] = response.selected_scheme_id
            # Provenance: the profile actually used + the seed it was solved with
            # (audit F09/F14). A rejected/unsupported selection never claims to
            # have produced this geometry. Absent values stay absent.
            response.params_snapshot.setdefault(
                "scheme_profile",
                getattr(req, "selected_scheme_id", None),
            )
            response.params_snapshot.setdefault(
                "seed", response.seed,
            )
    return response



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

