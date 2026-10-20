"""Scoring and ranked scheme portfolio.

Three deterministic weighted profiles are solved and ranked:

* ``max_area``       — maximise usable area / minimise circulation waste
* ``max_vastu``      — maximise Vastu-weighted orientation
* ``max_light_vent`` — maximise daylight and cross-ventilation opportunity

Every scheme carries its provenance, per-metric deltas, and the full floor
geometry (rooms, doors, windows, wall graph, SVG).  The legacy single-plan
response is never replaced; the portfolio is additive.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Optional, Sequence, Tuple

from app.schemas.floorplan import FloorPlanRequest
from app.schemas.multi_floor_plan import (
    MultiFloorRoomRectangle,
    SingleFloorPlanModel,
)
from app.schemas.scheme import (
    SchemeAlternative,
    SchemeDelta,
    SchemeFloor,
    SchemeMetrics,
    SchemePortfolio,
    SchemeProfileId,
    SchemeWeights,
)
from app.services.floorplan.constrained_solver import (
    PlateContext,
    ProgramRoom,
    build_plate_context,
    expand_program,
    finalize_floor,
    solve_rectangular_plate,
    _doors_connected,
    _touching,
)
from app.services.floorplan.ontology import (
    ONTOLOGY,
    RelationType,
)

SOLVER_VERSION = "stage2-band-solver-v1"

PROFILE_WEIGHTS: Dict[SchemeProfileId, SchemeWeights] = {
    SchemeProfileId.MAX_AREA: SchemeWeights(
        area=0.40, vastu=0.05, light_vent=0.10, relations=0.15, compactness=0.30,
    ),
    SchemeProfileId.MAX_VASTU: SchemeWeights(
        area=0.15, vastu=0.50, light_vent=0.05, relations=0.20, compactness=0.10,
    ),
    SchemeProfileId.MAX_LIGHT_VENT: SchemeWeights(
        area=0.15, vastu=0.10, light_vent=0.45, relations=0.20, compactness=0.10,
    ),
}

PROFILE_LABELS = {
    SchemeProfileId.MAX_AREA: "Max Area",
    SchemeProfileId.MAX_VASTU: "Max Vastu",
    SchemeProfileId.MAX_LIGHT_VENT: "Max Light + Vent",
}


def _resolve(room_id: str, typology: str) -> Optional[str]:
    return ONTOLOGY.resolve_space_id(room_id, typology)


def _spec_for(room: MultiFloorRoomRectangle):
    sid = getattr(room, "space_type_id", None) or _resolve(room.room_id, "")
    return ONTOLOGY.get_space(sid) if sid else None


def _room_touches_circulation(room: MultiFloorRoomRectangle, rooms: Sequence[MultiFloorRoomRectangle]) -> bool:
    for other in rooms:
        if other.room_id == room.room_id or other.zone_category != "circulation":
            continue
        touching, _ = _touching(room, other)
        if touching:
            return True
    return False


def _score_floors(
    floors: Sequence[SingleFloorPlanModel],
    *,
    typology: str,
    buildable_area: float,
    weights: SchemeWeights,
    dropped: Sequence[ProgramRoom] = (),
    required_ids: Sequence[str] = (),
) -> SchemeMetrics:
    all_rooms = [r for f in floors for r in f.rooms]
    program_rooms = [r for r in all_rooms if r.zone_category not in ("circulation", "terrace")]
    circulation = [r for r in all_rooms if r.zone_category == "circulation"]
    built = sum(r.area_sqm for r in all_rooms if r.zone_category != "terrace")
    program_area = sum(r.area_sqm for r in program_rooms)
    circ_area = sum(r.area_sqm for r in circulation)
    ground = floors[0] if floors else None
    ground_built = sum(r.area_sqm for r in ground.rooms if r.zone_category != "terrace") if ground else 0.0
    land_eff = min(100.0, 100.0 * ground_built / max(buildable_area, 0.01))
    circ_ratio = 100.0 * circ_area / max(built, 0.01)

    forbidden = 0
    must_total = 0
    must_sat = 0
    pref_total = 0
    pref_sat = 0
    for floor in floors:
        rooms = floor.rooms
        for i in range(len(rooms)):
            a = rooms[i]
            ra = _resolve(a.room_id, typology)
            if not ra:
                continue
            a_is_circ = a.zone_category == "circulation"
            a_core_touch = _room_touches_circulation(a, rooms) if a_is_circ else False
            for j in range(i + 1, len(rooms)):
                b = rooms[j]
                rb = _resolve(b.room_id, typology)
                if not rb:
                    continue
                touching, _ = _touching(a, b)
                b_is_circ = b.zone_category == "circulation"
                rules = ONTOLOGY.get_relations(ra, rb)
                for rule in rules:
                    if rule.relation == RelationType.FORBIDDEN_WALL and touching:
                        forbidden += 1
                    elif rule.relation == RelationType.MUST_ADJACENT:
                        must_total += 1
                        satisfied = touching
                        # A secondary core only needs to touch the circulation
                        # system; the public lobby is a single room and cannot
                        # be adjacent to every core in a bank.
                        if not satisfied and a_is_circ and b_is_circ:
                            satisfied = (a_core_touch or _room_touches_circulation(b, rooms))
                        if satisfied:
                            must_sat += 1
                    elif rule.relation == RelationType.PREFER_ADJACENT:
                        pref_total += 1
                        if touching:
                            pref_sat += 1
                    elif rule.relation == RelationType.PREFER_SEPARATE:
                        pref_total += 1
                        if not touching:
                            pref_sat += 1
    must_score = 100.0 * must_sat / max(must_total, 1)
    pref_score = 100.0 * pref_sat / max(pref_total, 1)
    relation_score = 100.0 * (must_sat + pref_sat) / max(must_total + pref_total, 1)

    vastu_vals: List[float] = []
    daylight_total = 0
    daylight_ok = 0
    min_area_viol = 0
    min_width_viol = 0
    aspect_viol = 0
    furniture_total = 0
    furniture_ok = 0
    for room in program_rooms:
        spec = _spec_for(room)
        if spec is None:
            continue
        if spec.vastu_zone_weights:
            weight = float(spec.vastu_zone_weights.get(room.zone, 0.0))
            vastu_vals.append(max(0.0, min(100.0, (weight + 1.0) * 50.0)))
        if room.area_sqm + 0.02 < spec.min_area_sqm:
            min_area_viol += 1
        if room.width_m + 0.02 < spec.min_width_m:
            min_width_viol += 1
        if room.aspect_ratio > spec.max_aspect_ratio + 0.02:
            aspect_viol += 1
        if spec.furniture_set:
            furniture_total += 1
            if room.furniture:
                furniture_ok += 1
        if spec.daylight_req:
            daylight_total += 1
            if any(w.room_id == room.room_id for w in _windows_for(floors, room.room_id)):
                daylight_ok += 1
    vastu_score = sum(vastu_vals) / max(len(vastu_vals), 1)
    daylight_score = 100.0 * daylight_ok / max(daylight_total, 1)
    furniture_fit = 100.0 * furniture_ok / max(furniture_total, 1)

    egress_ok = bool(floors) and all(
        _doors_connected(f.rooms, f.doors) for f in floors
    )

    compactness = max(0.0, min(100.0, 100.0 - abs(circ_ratio - 15.0) * 2.2))
    total = (
        weights.area * land_eff
        + weights.vastu * vastu_score
        + weights.light_vent * daylight_score
        + weights.relations * relation_score
        + weights.compactness * compactness
    )

    deficit = sum(r.spec.min_area_sqm for r in dropped)
    return SchemeMetrics(
        land_use_efficiency_pct=round(land_eff, 2),
        circulation_ratio_pct=round(circ_ratio, 2),
        vastu_score=round(vastu_score, 2),
        daylight_score=round(daylight_score, 2),
        relation_score=round(relation_score, 2),
        compactness_score=round(compactness, 2),
        total_score=round(total, 2),
        forbidden_violations=forbidden,
        must_adjacency_score=round(must_score, 2),
        prefer_score=round(pref_score, 2),
        egress_connected=egress_ok,
        min_area_violations=min_area_viol,
        min_width_violations=min_width_viol,
        aspect_violations=aspect_viol,
        furniture_fit_pct=round(furniture_fit, 2),
        program_area_sqm=round(program_area, 2),
        circulation_area_sqm=round(circ_area, 2),
        envelope_area_sqm=round(sum(float(f.envelope.get("area_sqm", 0.0)) for f in floors), 2),
        program_deficit_sqm=round(deficit, 2),
        dropped_rooms=[r.instance_id for r in dropped],
    )


def _windows_for(floors: Sequence[SingleFloorPlanModel], room_id: str):
    for floor in floors:
        for window in floor.windows:
            if window.room_id == room_id:
                yield window


def _required_present(
    floors: Sequence[SingleFloorPlanModel],
    required_ids: Sequence[str],
) -> Tuple[bool, List[str]]:
    if not required_ids:
        return True, []
    from app.services.floorplan.engine import SoleGeometryEngine
    present = {_resolve(r.room_id, "") for f in floors for r in f.rooms}
    present.discard(None)
    missing = []
    for rid in required_ids:
        mapped = SoleGeometryEngine._map_client_room_token(rid)
        if mapped not in present and rid not in present:
            missing.append(rid)
    return len(missing) == 0, missing


def _scheme_floor(floor: SingleFloorPlanModel) -> SchemeFloor:
    return SchemeFloor(
        floor_index=floor.floor_index,
        floor_name=floor.floor_name,
        envelope=dict(floor.envelope),
        rooms=list(floor.rooms),
        doors=list(floor.doors),
        windows=list(floor.windows),
        svg_blueprint_cad=floor.svg_blueprint_cad,
        svg_blueprint_paper=floor.svg_blueprint_paper,
        metrics={
            "circulation_status": floor.circulation_status,
            "built_up_area_sqm": floor.built_up_area_sqm,
            "carpet_area_sqm": floor.carpet_area_sqm,
        },
    )


def _delta(a: SchemeMetrics, b: SchemeMetrics) -> SchemeDelta:
    def d(x: float, y: float) -> float:
        return round(x - y, 2)
    return SchemeDelta(
        land_use_efficiency_pct=d(a.land_use_efficiency_pct, b.land_use_efficiency_pct),
        circulation_ratio_pct=d(a.circulation_ratio_pct, b.circulation_ratio_pct),
        vastu_score=d(a.vastu_score, b.vastu_score),
        daylight_score=d(a.daylight_score, b.daylight_score),
        total_score=d(a.total_score, b.total_score),
    )


def _request_copy(req: FloorPlanRequest) -> FloorPlanRequest:
    return req.model_copy(update={
        "include_scheme_alternatives": False,
        "selected_scheme_id": None,
    })


def _reference_metrics(req: FloorPlanRequest, buildable: float) -> Tuple[SchemeMetrics, Any]:
    """Legacy RULE-FP response measured with the same scorer (delta baseline)."""
    from app.services.floorplan.engine import SoleGeometryEngine
    engine = SoleGeometryEngine(_request_copy(req))
    building = engine.solve()
    weights = PROFILE_WEIGHTS[SchemeProfileId.MAX_AREA]
    metrics = _score_floors(
        building.floors,
        typology=engine.typology,
        buildable_area=buildable,
        weights=weights,
        required_ids=list(req.required_rooms or []),
    )
    return metrics, building


def _build_alternative(
    *,
    profile: SchemeProfileId,
    floors: Sequence[SingleFloorPlanModel],
    dropped: Sequence[ProgramRoom],
    warnings: Sequence[str],
    ctx: Optional[PlateContext],
    typology: str,
    buildable: float,
    assignment: Dict[int, Dict[str, str]],
    band_depths: Dict[int, float],
    req: FloorPlanRequest,
    fallback: bool = False,
) -> SchemeAlternative:
    weights = PROFILE_WEIGHTS[profile]
    metrics = _score_floors(
        floors,
        typology=typology,
        buildable_area=buildable,
        weights=weights,
        dropped=dropped,
        required_ids=list(req.required_rooms or []),
    )
    required_ok, missing = _required_present(floors, list(req.required_rooms or []))
    feasible = bool(floors) and all(f.rooms for f in floors) and metrics.forbidden_violations == 0 \
        and metrics.egress_connected and metrics.min_area_violations == 0 \
        and metrics.min_width_violations == 0 and required_ok
    all_warnings = list(dict.fromkeys(list(warnings)))
    if missing:
        all_warnings.append(
            "Requested rooms not placed: " + ", ".join(missing)
            + " - the scheme is marked infeasible rather than silently dropping them."
        )
    if metrics.aspect_violations:
        all_warnings.append(
            f"Soft aspect-ratio advisory: {metrics.aspect_violations} room(s) exceed their "
            "declared max aspect. They are scored and reported, not treated as hard-infeasible "
            "(land economics owns the dimensional audit)."
        )
    return SchemeAlternative(
        scheme_id=profile.value,
        profile=profile,
        label=PROFILE_LABELS[profile],
        feasible=feasible,
        score=metrics.total_score,
        weights=weights,
        metrics=metrics,
        floors=[_scheme_floor(f) for f in floors],
        warnings=all_warnings,
        provenance={
            "solver_version": SOLVER_VERSION,
            "solver": "legacy_rule_fp_fallback" if fallback else "stage2_band_solver",
            "seed": getattr(req, "seed", None),
            "profile": profile.value,
            "weights": weights.model_dump(),
            "assignment_by_floor": {str(k): v for k, v in assignment.items()},
            "band_depth_by_floor": {str(k): v for k, v in band_depths.items()},
            "dropped_rooms": [r.instance_id for r in dropped],
            "required_rooms": list(req.required_rooms or []),
            "deterministic": True,
        },
    )


def generate_ranked_schemes(req: FloorPlanRequest) -> SchemePortfolio:
    """Generate, score and rank the three scheme alternatives."""
    from app.services.floorplan.engine import SoleGeometryEngine

    engine = SoleGeometryEngine(req)
    ctx = build_plate_context(engine)
    buildable = float(ctx.buildable_area) if ctx else float(
        getattr(engine.site_plan, "buildable_area_sqm", 0.0) or (engine.plot_w * engine.plot_d)
    )
    typology = engine.typology
    reference, _legacy = _reference_metrics(req, buildable)

    alternatives: List[SchemeAlternative] = []
    fallback = ctx is None
    if fallback:
        # RULE-FP owns multi-wing / terrace-band plates.  Reuse its fully
        # validated geometry instead of re-implementing the law in the scheme solver.
        building = engine.solve()
        for profile in (SchemeProfileId.MAX_AREA, SchemeProfileId.MAX_VASTU,
                        SchemeProfileId.MAX_LIGHT_VENT):
            alternatives.append(_build_alternative(
                profile=profile,
                floors=building.floors,
                dropped=[],
                warnings=list(building.warnings) + [
                    "Scheme solver reused the validated RULE-FP geometry for a multi-wing "
                    "or terrace-band plate; this profile does not re-partition that plate."
                ],
                ctx=None,
                typology=typology,
                buildable=buildable,
                assignment={},
                band_depths={},
                req=req,
                fallback=True,
            ))
    else:
        for profile in (SchemeProfileId.MAX_AREA, SchemeProfileId.MAX_VASTU,
                        SchemeProfileId.MAX_LIGHT_VENT):
            results = solve_rectangular_plate(ctx, profile_id=profile.value)
            floors: List[SingleFloorPlanModel] = []
            warnings: List[str] = []
            assignment: Dict[int, Dict[str, str]] = {}
            band_depths: Dict[int, float] = {}
            dropped: List[ProgramRoom] = []
            for result in results:
                warnings.extend(result.warnings)
                assignment[result.floor_index] = dict(result.assignment)
                band_depths[result.floor_index] = result.band_depth
                dropped.extend(result.dropped)
                if result.rooms:
                    floors.append(finalize_floor(ctx, result))
            # Unique dropped list (the search records one instance per floor).
            uniq: Dict[str, ProgramRoom] = {}
            for room in dropped:
                uniq[room.instance_id] = room
            dropped = [uniq[k] for k in sorted(uniq)]
            alternatives.append(_build_alternative(
                profile=profile,
                floors=floors,
                dropped=dropped,
                warnings=warnings,
                ctx=ctx,
                typology=typology,
                buildable=buildable,
                assignment=assignment,
                band_depths=band_depths,
                req=req,
            ))

    # Rank: feasible first, then score descending, then stable scheme id.
    alternatives.sort(key=lambda a: (0 if a.feasible else 1, -a.score, a.scheme_id))
    best = alternatives[0] if alternatives else None
    for idx, alt in enumerate(alternatives, start=1):
        alt.rank = idx
        if best is not None:
            alt.delta_vs_engine = _delta(alt.metrics, reference)
            alt.delta_vs_best = _delta(alt.metrics, best.metrics)

    requested = getattr(req, "selected_scheme_id", None)
    ids = {a.scheme_id for a in alternatives}
    if requested and requested in ids:
        selected = requested
        source = "user"
    else:
        selected = best.scheme_id if best else None
        source = "default_rank"
        if requested and requested not in ids:
            source = "default_rank_invalid_selection"

    request_hash = hashlib.sha256(
        json.dumps({
            "plot": [req.plot_width_m, req.plot_depth_m],
            "typology": typology,
            "floors": req.floors,
            "required": list(req.required_rooms or []),
            "schema": SOLVER_VERSION,
        }, sort_keys=True).encode("utf-8")
    ).hexdigest()[:16]

    return SchemePortfolio(
        seed=engine.seed,
        typology=typology,
        reference_metrics=reference,
        alternatives=alternatives,
        selected_scheme_id=selected,
        selection_source=source,
        provenance={
            "solver_version": SOLVER_VERSION,
            "request_hash": request_hash,
            "deterministic": True,
            "profile_order": [p.value for p in (
                SchemeProfileId.MAX_AREA, SchemeProfileId.MAX_VASTU, SchemeProfileId.MAX_LIGHT_VENT
            )],
            "ranking_rule": "feasible desc, total_score desc, scheme_id asc",
            "selected_scheme_id": selected,
            "selection_source": source,
            "fallback_reason": (
                "multi-wing or terrace-band plate: RULE-FP geometry reused"
                if fallback else None
            ),
        },
    )
