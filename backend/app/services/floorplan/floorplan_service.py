import re
import time
from typing import Any, Dict, List, Optional

from reportlab.graphics.shapes import Drawing

from app.schemas.floorplan import FloorPlanMetrics, FloorPlanRequest, FloorPlanResponse


_SELECTION_FLOOR_SUFFIX = re.compile(r"_F\d+$")


def _drawn_room_types(response: FloorPlanResponse) -> List[str]:
    """The ontology types actually drawn, normalized for selection comparison."""
    ms = response.multi_storey
    if ms is None:
        return []
    found: List[str] = []
    for floor in ms.floors:
        for room in floor.rooms:
            sid = getattr(room, "space_type_id", None) or _SELECTION_FLOOR_SUFFIX.sub(
                "", str(room.room_id)
            )
            if sid and sid not in found:
                found.append(sid)
    return found


def _scheme_portfolio_safely(req: FloorPlanRequest):
    """Build the ranked portfolio without letting a selection refusal 422.

    The portfolio is an ADDITIVE surface: its reference metrics solve the same
    requested partition again, so a selection the main path already recovered
    from (overlap / collapse) raised a second hard-constraint violation here and
    escaped as HTTP 422.  The selection policy is identical for both paths: try
    the requested programme, and when it cannot be partitioned compute the
    alternatives on the plate's legal programme and NAME the substitution.
    """
    from app.services.floorplan.scheme_solver import generate_ranked_schemes

    try:
        return generate_ranked_schemes(req), None
    except ValueError as exc:
        if "Hard Constraint Violation" not in str(exc):
            raise
        note = (
            "SCHEME-PORTFOLIO: the requested partition cannot be drawn on this "
            f"plate ({exc}); the ranked alternatives were computed on the "
            "plate's legal programme instead."
        )
        try:
            fallback_req = req.model_copy(
                update={"required_rooms": None, "selected_scheme_id": None}
            )
            return generate_ranked_schemes(fallback_req), note
        except ValueError:
            return None, note


def _recover_selection(req: FloorPlanRequest) -> Optional[FloorPlanResponse]:
    """Draw the plate's legal programme when the selected partition cannot be.

    The refusal policy already says a drawn proportion/programme failure is disclosed, not
    refused.  The selection path had one hole left: a required_rooms programme
    that the T1 custom partitioner collapsed or overlapped ended in an empty
    plate (or a raw 422), while the same plate solves cleanly as a natural
    programme.  Retry without the hard selection, keep the drawn geometry, and
    let the caller name the conflict and the unplaced rooms.
    """
    from app.services.floorplan.engine import SoleGeometryEngine

    # Plumbing note: the hard selection lives in THREE request fields.  Clearing
    # only `required_rooms` leaves `room_program` behind, the engine re-selects
    # the same rejected partition, and the fallback silently reproduces the
    # failure it was meant to recover from.  Keep this trio together.
    fallback_req = req.model_copy(
        update={"required_rooms": None, "room_program": None, "selected_scheme_id": None}
    )
    try:
        alt = SoleGeometryEngine(fallback_req).solve_floorplan_response()
    except ValueError:
        return None
    if alt.multi_storey is None or not alt.multi_storey.floors:
        return None
    return alt


def _apply_selection_policy(
    req: FloorPlanRequest,
    drawn: FloorPlanResponse,
    *,
    conflict: str,
    overlap: Optional[Dict[str, Any]] = None,
) -> FloorPlanResponse:
    """Attach the named selection conflict and the unplaced-room ledger.

    The drawn plan is the plate's legal programme, never the rejected partition;
    every requested room it does not contain is named, and the banner carries the
    same three options the natural deficit path offers.
    """
    selected = [str(r) for r in (req.required_rooms or [])]
    present = set(_drawn_room_types(drawn))
    unplaced = [rid for rid in selected if rid not in present]

    if overlap:
        pair = overlap.get("rooms") or ()
        pair_txt = "' and '".join(str(p) for p in pair) if pair else "two rooms"
        line = (
            f"ROOM-OVERLAP: rooms '{pair_txt}' overlap by "
            f"{float(overlap.get('overlap_sqm') or 0.0):.2f} m² on floor "
            f"{overlap.get('floor_index', 0)} in the selected programme; that layout is "
            "not drawn. The plate's legal programme is drawn instead; reduce the "
            "selection or enlarge the plate to draw the selected layout."
        )
        if line not in drawn.warnings:
            drawn.warnings.insert(0, line)

    if unplaced:
        banner = (
            f"PROGRAMME-DEFICIT: the selected programme ({len(selected)} rooms) could "
            f"not be placed on this plate; {len(unplaced)} selected room(s) are not "
            f"drawn: {', '.join(unplaced)}. The drawn plan follows the plate's legal "
            "programme. Options: add a storey, reduce the programme, or enlarge the "
            "plate where the site allows."
        )
    else:
        banner = (
            f"PROGRAMME-DEFICIT: the selected {len(selected)}-room partition could not "
            "be drawn on this plate (the selection was replaced by the plate's legal "
            "programme). All selected room types are present in the drawn plan, but "
            "this is not the selected layout. Options: add a storey, reduce the "
            "programme, or enlarge the plate where the site allows."
        )
    if banner not in drawn.warnings:
        drawn.warnings.insert(0, banner)
    if conflict and conflict not in drawn.warnings:
        # This line must stand on its own. A reader who only sees the
        # fallback banner has to understand that the drawn plate is the plate's
        # LEGAL programme, not the requested selection.
        drawn.warnings.insert(
            0,
            f"SELECTION-FALLBACK: {conflict}. The plate's legal programme is drawn "
            "instead; it is not the requested selection.",
        )

    existing = {str((u or {}).get("room_id")) for u in (drawn.unmet_requirements or [])}
    for rid in unplaced:
        if rid in existing:
            continue
        drawn.unmet_requirements.append({
            "room_id": rid,
            "reason": (
                "The selected programme could not be partitioned on this plate; the "
                "drawn plan follows the plate's legal programme. Reduce the "
                "programme, add a storey, or enlarge the plate."
            ),
        })

    # Plumbing contract for the UI and the report: these three keys are written
    # ONLY on a fallback, and they are the only machine-readable evidence of it
    # (`unmet_requirements` is shared with the natural deficit path).  Absent =
    # the selection was drawn as requested.
    if drawn.params_snapshot is not None:
        drawn.params_snapshot["selection_path"] = "fallback_legal_programme"
        drawn.params_snapshot["selection_fallback_reason"] = conflict
        drawn.params_snapshot["selection_unplaced_rooms"] = unplaced
    return drawn


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
        # SELECTION-PATH: an explicit room selection that collapses under the
        # plate ceiling used to arrive as an empty plate ("no rooms on this
        # floor") even though the same plate solves cleanly as a natural
        # programme.  The natural path already draws and discloses a deficit;
        # the selection now follows the same policy instead of refusing.
        if (
            req.required_rooms
            and not req.selected_scheme_id
            and response.status == "failed"
            and any(str(w).startswith("GEN-UNFIT") for w in (response.warnings or []))
        ):
            recovered = _recover_selection(req)
            if recovered is not None:
                response = _apply_selection_policy(
                    req,
                    recovered,
                    conflict=(
                        "the selected programme collapsed below its statutory minima "
                        "on this plate and was replaced by the plate's legal programme"
                    ),
                )
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
        # Report never claim a profile shaped a plan it did not.
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
        # SELECTION-PATH: a selected partition that overlaps is a named
        # conflict, not a raw 422.  Draw the plate's legal programme, keep the
        # id pair and the measured overlap area, and let the FAIL stamp speak.
        if req.required_rooms and not req.selected_scheme_id:
            recovered = _recover_selection(req)
            if recovered is not None:
                overlap = None
                if getattr(exc, "code", None) == "ROOM-OVERLAP":
                    overlap = {
                        "rooms": getattr(exc, "rooms", ()),
                        "overlap_sqm": getattr(exc, "overlap_sqm", None),
                        "floor_index": getattr(exc, "floor_index", 0),
                    }
                response = _apply_selection_policy(
                    req,
                    recovered,
                    conflict=(
                        f"the selected partition cannot be drawn on this plate ({exc})"
                    ),
                    overlap=overlap,
                )
            else:
                # Nothing can be drawn even as the natural programme: keep the
                # explicit refusal, but name the selection and the options.
                response.warnings.insert(
                    0,
                    "PROGRAMME-DEFICIT: the selected programme cannot be partitioned "
                    "on this plate and the plate's legal programme is also refused. "
                    "Options: add a storey, reduce the programme, or enlarge the "
                    "plate where the site allows.",
                )
    if getattr(req, "include_scheme_alternatives", False):
        # Additive scheme portfolio.  The legacy geometry above is untouched,
        # so default responses remain byte-equivalent.
        portfolio, portfolio_note = _scheme_portfolio_safely(req)
        if portfolio_note:
            response.warnings.append(portfolio_note)
        if portfolio is None:
            # Nothing partitionable at all: the plan keeps its explicit refusal
            # and the missing portfolio is named, never a 422.
            return response
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
            # A rejected/unsupported selection never claims to
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

