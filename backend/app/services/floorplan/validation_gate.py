"""
validation_gate.py - Universal Validation Gate 
=========================================================
Every generation - any typology, any floor count - is judged by the same
contract: the full L1-L15 layer stack. No layer is ever silently skipped;
when a layer does not apply, it is recorded as N/A WITH AN EXPLICIT REASON.

Layer map:
  L1  Geometry & statutory invariants   (engine certificate core)
  L2  Door swings                       (living_quality)
  L3  Bathroom fixture clearances       (living_quality)
  L4  Furniture clearances              (living_quality)
  L5  Naming honesty                    (living_quality)
  L6  Stair as computed object          (wall_graph / living_quality)
  L7  Vastu scoring                     (profile scores, advisory)
  L8  Program intent                    (living_quality)
  L9  Ventilation                       (engineering)
  L10 Wet-core & plumbing               (engineering)
  L11 Terrace drainage                  (engineering)
  L12 Structural                        (engineering)
  L13 Accessibility                     (engineering)
  L14 Fire & egress                     (engineering)
  L15 Programme completeness            (essential rooms present per typology/unit)

Overall status = worst layer (FAIL > WARN > N/A > PASS). Concretely:
  overall = FAIL if any FAIL
  else WARN if any WARN
  else PASS
A layer that genuinely does not apply is recorded N/A WITH AN EXPLICIT REASON
and never counts as a pass. A layer whose evaluator DID NOT RUN is a FAIL: an
absent evaluator is not evidence of compliance (audit F20).
"""

import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger("buildwise.validation_gate")

# Canonical layer order rendered on sheets and UI panels.
LAYER_IDS: List[str] = ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8",
                        "L9", "L10", "L11", "L12", "L13", "L14", "L15"]

LAYER_TITLES: Dict[str, str] = {
    "L1": "Geometry & Statutory",
    "L2": "Door Swings",
    "L3": "Bathroom Fixtures",
    "L4": "Furniture Clearances",
    "L5": "Naming Honesty",
    "L6": "Stair Compliance",
    "L7": "Vastu Advisory",
    "L8": "Program Intent",
    "L9": "Ventilation",
    "L10": "Wet-Core & Plumbing",
    "L11": "Terrace Drainage",
    "L12": "Structural",
    "L13": "Accessibility",
    "L14": "Fire & Egress",
    "L15": "Programme Completeness",
}

STATUS_ORDER = {"PASS": 0, "N/A": 1, "WARN": 2, "FAIL": 3}

# Layers whose FAIL invalidates the whole certificate (hard layers).
HARD_FAIL_LAYERS = {"L1", "L2", "L8", "L14", "L15"}

# Land-economics checks that a plan can DISPROVE (geometry/statutory facts).
# These are L1-bearing: a PASS gate beside a failing land certificate is a
# contradiction (audit F05). Planning ratios are advisory (WARN), not provable
# violations of a law.
_LAND_ADVISORY_CHECKS = {"circulation_within_12_20", "footprint_utilization_90"}

_LAND_CHECK_LABELS = {
    "site_plan_present": "site plan present",
    "site_plan": "site plan present",
    "geometry": "land geometry readable",
    "footprint_contained_in_buildable": "footprint inside the setback buildable",
    "coverage_within_limit": "ground coverage within the statutory limit",
    "program_fits_footprint": "programme fits the footprint",
    "interior_dead_corners_zero": "no interior dead corner >= 1 m²",
    "residuals_labelled": "every residual labelled",
    "anonymous_outdoor_zero": "no anonymous outdoor sliver",
    "circulation_within_12_20": "circulation ratio within the 12-20% band",
    "footprint_utilization_90": "footprint utilisation >= 90%",
    "furniture_fit": "furniture sets fit their rooms",
}


@dataclass
class LayerStatus:
    """Per-layer gate result. `status` is one of PASS | WARN | FAIL | N/A."""
    layer_id: str
    title: str
    status: str                     # "PASS" | "WARN" | "FAIL" | "N/A"
    summary: str = ""
    reason: Optional[str] = None    # mandatory when status == N/A
    findings: List[str] = field(default_factory=list)
    citation: Optional[str] = None
    details: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "layer_id": self.layer_id,
            "title": self.title,
            "status": self.status,
            "summary": self.summary,
        }
        if self.status == "N/A":
            d["reason"] = self.reason or "not_applicable"
        if self.findings:
            d["findings"] = self.findings
        if self.citation:
            d["citation"] = self.citation
        if self.details is not None:
            d["details"] = self.details
        return d


def crash_status(layer_id: str) -> str:
    """Status for a layer whose evaluator CRASHED.

    A crashed evaluator verified nothing. For a hard layer that is a FAIL (the
    plan cannot be certified on an unverified claim); for an advisory layer the
    gate records a WARN so the crash stays visible without voiding a geometry
    the other layers did verify (audit F20).
    """
    return "FAIL" if layer_id in HARD_FAIL_LAYERS else "WARN"


def make_layer(layer_id: str, status: str, summary: str = "",
               reason: Optional[str] = None, findings: Optional[List[str]] = None,
               citation: Optional[str] = None,
               details: Optional[Dict[str, Any]] = None) -> LayerStatus:
    """Factory that enforces the N/A-with-reason contract and clamps statuses."""
    st = str(status).upper()
    if st not in STATUS_ORDER:
        st = "WARN"
    if st == "N/A" and not reason:
        reason = "No applicable subjects found in this generation"
    findings = findings or []
    if st == "WARN" and not findings and summary:
        # Warnings are surfaced as chips and must never be hidden without a cause.
        findings = [summary]
    return LayerStatus(layer_id, LAYER_TITLES.get(layer_id, layer_id), st,
                       summary, reason, findings, citation, details)


def ensure_all_layers(layers: List[LayerStatus]) -> List[LayerStatus]:
    """Append a FAIL row for every declared layer that nobody evaluated.

    The gate may NEVER return fewer layers than its contract declares: a
    missing evaluator is an unverified claim, and an unverified claim fails
    (audit F20).
    """
    present = {l.layer_id for l in layers}
    for lid in LAYER_IDS:
        if lid not in present:
            layers.append(make_layer(
                lid, "FAIL",
                summary=f"{LAYER_TITLES.get(lid, lid)} was not evaluated",
                findings=["Layer evaluator did not run - an absent evaluator cannot pass"],
            ))
    return layers


def overall_status(layers: List[LayerStatus]) -> str:
    """Overall = worst layer. N/A never gates validity."""
    worst = "PASS"
    for l in layers:
        if STATUS_ORDER.get(l.status, 0) > STATUS_ORDER.get(worst, 0):
            worst = l.status
    return "FAIL" if worst == "FAIL" else ("WARN" if worst == "WARN" else "PASS")


def overall_from_dicts(layer_dicts: List[Dict[str, Any]]) -> str:
    """Same as overall_status() but over serialized dicts (UI/PDF consumers)."""
    worst = "PASS"
    for d in layer_dicts or []:
        s = str(d.get("status", "PASS")).upper()
        if STATUS_ORDER.get(s, 0) > STATUS_ORDER.get(worst, 0):
            worst = s
    return "FAIL" if worst == "FAIL" else ("WARN" if worst == "WARN" else "PASS")


# Essential programme per typology.  These are the rooms a dwelling/unit or
# operating building cannot function without; optional spaces (study, puja,
# balcony, utility) are deliberately not gated here.
_T1_ESSENTIAL = ({"living", "kitchen"},
                 {"master_bed", "bed_2", "master_suite"},
                 {"bath_1", "bath_2", "bath_master", "powder_room"})
_T2_UNIT_ESSENTIAL = ("unit_living", "unit_kitchen", "unit_bed", "unit_bath")
_T3_ESSENTIAL_ANY = {"commercial_suite", "conference_suite", "conference_room",
                     "reception_lobby", "reception"}
_T4_ESSENTIAL = ("dock_bay", "dispatch", "storage_bay", "worker_amenity")


def _room_space_id(room: Any) -> Optional[str]:
    sid = getattr(room, "space_type_id", None)
    if sid:
        return str(sid)
    ident = getattr(room, "identity", None)
    if isinstance(ident, dict):
        sid = ident.get("space_type_id")
    else:
        sid = getattr(ident, "space_type_id", None)
    if sid:
        return str(sid)
    from app.services.floorplan.ontology import ONTOLOGY
    return ONTOLOGY.resolve_space_id(str(getattr(room, "room_id", "")), None)


def assess_programme_completeness(
    floors: List[Any], typology: str
) -> Dict[str, Any]:
    """Return the essential-room verdict for the requested typology.

    This is presence, not size: a plan can pass L15 while an individual room
    is below its area target (that is L1/I2 territory).  Its job is to stop the
    silent deletion of an essential room - the failure mode that let a T2 flat
    without a kitchen pass every other layer.
    """
    rooms = [r for f in (floors or []) for r in (getattr(f, "rooms", None) or [])]
    if not rooms:
        return {"status": "N/A", "reason": "No floor plates to audit",
                "missing": [], "per_unit": {}, "rooms_checked": 0}

    typed = [(r, _room_space_id(r)) for r in rooms]
    missing: List[str] = []
    per_unit: Dict[str, List[str]] = {}

    if typology == "T2_FAMILY_APARTMENT":
        units: Dict[str, set] = {}
        for room, sid in typed:
            uid = str(getattr(room, "unit_id", "") or "")
            if uid:
                units.setdefault(uid, set()).add(sid)
        if not units:
            missing.append("no unit-identified rooms (T2 programme not materialised)")
        for uid in sorted(units):
            per_unit[uid] = sorted(s for s in units[uid] if s)
            for need in _T2_UNIT_ESSENTIAL:
                if need not in units[uid]:
                    missing.append(f"{need} in {uid}")
    elif typology == "T3_LARGE_COMPLEX":
        ids = {sid for _r, sid in typed if sid}
        if "sanitary_block" not in ids:
            missing.append("sanitary_block")
        if not (ids & _T3_ESSENTIAL_ANY):
            missing.append("commercial/conference/reception space")
    elif typology == "T4_WAREHOUSE":
        ids = {sid for _r, sid in typed if sid}
        missing.extend(need for need in _T4_ESSENTIAL if need not in ids)
    else:
        ids = {sid for _r, sid in typed if sid}
        any_bed, any_bath = _T1_ESSENTIAL[1], _T1_ESSENTIAL[2]
        missing.extend(need for need in _T1_ESSENTIAL[0] if need not in ids)
        if not (ids & any_bed):
            missing.append("bedroom")
        if not (ids & any_bath):
            missing.append("bathroom")

    return {
        "status": "FAIL" if missing else "PASS",
        "missing": missing,
        "per_unit": per_unit,
        "rooms_checked": len(rooms),
        "typology": typology,
    }


# =============================================================================
# LLM BOUNDARY EVENT LOG
# =============================================================================

def log_llm_boundary_event(event: str, detail: Dict[str, Any]) -> str:
    """
    Emits an auditable event for the LLM-boundary invariant: the LLM may parse
    client TEXT only; any attempt by LLM output to carry explicit coordinates
    or geometry MUST be ignored by the solver and logged here. Returns an event
    id for the certificate details trail.
    """
    eid = f"LLMB-{uuid.uuid4().hex[:8].upper()}"
    logger.warning(
        "LLM-boundary event %s: %s %s",
        eid, event, {k: detail.get(k) for k in ("keys", "fields", "count") if k in detail}
    )
    return eid


LGEOMETRY_KEYS = {
    "x", "y", "width_m", "depth_m", "width", "depth", "height", "x1", "y1", "x2", "y2",
    "polygon", "polygon_coords", "vertices", "rooms_geometry", "geometry", "rectangles",
    "placements_geometry", "coords", "coordinates", "points", "w", "h",
}


def sanitize_llm_constraints(constraints: Any, source: str = "unknown") -> Dict[str, Any]:
    """
    Enforces the LLM-boundary invariant on parsed client constraints:
    strips any coordinate/geometry-bearing keys (LLM output may never place
    geometry), logs every strip as a boundary event, and returns a sanitized
    copy plus an audit trail. Deterministic; no network.
    """
    events: List[Dict[str, Any]] = []
    if constraints is None:
        return {"sanitized": None, "events": events, "event_ids": []}

    if not isinstance(constraints, dict):
        # Pydantic models: inspect the serialized form UNION the raw __dict__.
        # model_dump() alone can hide attribute-level extras injected by callers
        # that bypassed validation (model_construct) - those must be detected too.
        try:
            dumped = dict(constraints.model_dump())
            raw = {k: v for k, v in vars(constraints).items()
                   if not k.startswith("_") and not k.startswith("model_")}
            merged = {**raw, **dumped}
            constraints = merged
        except AttributeError:
            constraints = dict(constraints)

    stripped: List[str] = []
    clean: Dict[str, Any] = {}
    for k, v in constraints.items():
        if k in LGEOMETRY_KEYS or (isinstance(v, (list, tuple)) and k.lower().endswith(
                ("coords", "vertices", "polygon", "points", "geometry", "rectangles"))):
            stripped.append(k)
            continue
        clean[k] = v
    event_ids: List[str] = []
    if stripped:
        detail = {"fields": stripped, "source": source}
        eid = log_llm_boundary_event("geometry_fields_stripped_from_llm_constraints", detail)
        events.append({"event_id": eid, **detail})
        event_ids.append(eid)
    return {"sanitized": clean, "events": events, "event_ids": event_ids}


# =============================================================================
# GATE BUILDER - consumes engine state, returns serialized layer statuses
# =============================================================================

def _status_from_str(s: Any) -> str:
    t = str(s or "").lower()
    if t.startswith("fail"):
        return "FAIL"
    if t.startswith("warn"):
        return "WARN"
    if t.startswith("n/a") or t == "na" or t.startswith("na"):
        return "N/A"
    return "PASS"


def build_gate_layers(
    engine: Any,
    cert: Any,
    floors: List[Any],
    duct_shafts: List[Any],
    typology: str,
    pi_ok: bool,
    pi_warns: List[str],
    statutory_audit: Dict[str, Any],
    plate_masks: Any = None,
    land_cert: Any = None,
) -> List[Dict[str, Any]]:
    """
    Runs the universal gate over ALL layers L1-L15 and returns the serialized
    per-layer status list (for cert.details["validation_gate"]["layers"]).
    Import-time isolation: engineering imports are local so the gate can never
    break legacy certificate emission.
    """
    from app.services.floorplan.engineering import (
        compute_ventilation_registry,
        compute_wet_core_audit,
        compute_terrace_drainage,
        compute_structural_model,
        compute_accessibility_audit,
        compute_fire_egress_audit,
    )

    layers: List[LayerStatus] = []

    # ---------------------------------------------------------------- L1
    l1_broken = not (cert.non_overlap and cert.containment and cert.chain_sums_match
                     and cert.zero_forbidden_violations and cert.connectivity_bfs
                     and cert.vertical_stack_valid and cert.core_continuity_valid
                     and cert.no_wet_over_terrace_valid and cert.cores_stack_aligned)
    l1_findings: List[str] = []
    if not cert.non_overlap:
        l1_findings.append("Room footprint overlap detected (>= 0.05 sqm)")
    if not cert.containment:
        l1_findings.append("Room outside envelope boundary")
    if not cert.chain_sums_match:
        l1_findings.append("Dimension chain sum deviates from overall (>1mm)")
    if not cert.zero_forbidden_violations:
        l1_findings.append("Forbidden adjacency violation present")
    if not cert.connectivity_bfs:
        l1_findings.append("Circulation graph not fully reachable")
    if not cert.vertical_stack_valid:
        l1_findings.append("Vertical stacking invariant violated")
    if not cert.core_continuity_valid:
        l1_findings.append("Vertical core discontinuous across levels")
    if not cert.no_wet_over_terrace_valid:
        l1_findings.append("Wet room directly above terrace/open-to-sky")
    if not cert.cores_stack_aligned:
        l1_findings.append("Cores not stack-aligned across storeys")
    min_dim_note = "" if cert.min_dimensions_satisfied else (
        "NBC minimum dimensions met under bounded degradation tolerance")
    aspect_note = "" if cert.aspect_ratios_satisfied else (
        "Room aspect ratios met under bounded degradation tolerance (industrial bays exempt)")
    l1_advisory = (not cert.min_dimensions_satisfied) or (not cert.aspect_ratios_satisfied)
    l1_status = "FAIL" if l1_broken else ("PASS" if not l1_advisory else "WARN")
    # Zero-silent-skips: chain-sum precision must be verifiable. A
    # solved floor without serialized dimension chains is a silent skip and
    # invalidates the gate; when chains exist they are machine-verified in the
    # engine (see dimension_chain_audit in cert.details).
    chain_audit = (getattr(cert, "details", {}) or {}).get("dimension_chain_audit") or {}
    if chain_audit.get("floors_without_chains"):
        l1_status = "FAIL"
        l1_findings.append(
            "Dimension chain verification unavailable on floor(s) "
            + ", ".join(str(z) for z in chain_audit["floors_without_chains"])
            + " - dimension set-out not machine-verified (silent-skip guard)"
        )
    # LAND IS GATE-BEARING (audit F05): the space-efficiency certificate used
    # to be a side panel, so a generation could report PASS beside a FAILing
    # land certificate. Geometry/statutory land checks now decide L1.
    _land_fail: List[str] = []
    _land_advisory: List[str] = []
    if land_cert is not None:
        # Accept either the report or its certificate.
        _land_report = land_cert
        _land_cert = getattr(land_cert, "certificate", land_cert)
        _need = float(getattr(_land_report, "program_needed_area_m2", 0.0) or 0.0)
        _deficit = float(getattr(_land_report, "program_deficit_sqm", 0.0) or 0.0)
        _deficit_ratio = (_deficit / _need) if _need > 0 else 0.0
        for _name, _ok in (getattr(_land_cert, "checks", {}) or {}).items():
            if _ok:
                continue
            _label = _LAND_CHECK_LABELS.get(_name, _name.replace("_", " "))
            # A SMALL programme deficit is a tight-but-legal plate: the rooms
            # are disclosed by name, the gate WARNs, and the status is
            # "compromise". Only a material deficit (>15 %, the same threshold
            # that refuses a collapsed brief) is a land FAIL. The certificate
            # itself still reports the check as failed either way (audit F05).
            _small_deficit = (
                _name == "program_fits_footprint" and 0.0 < _deficit_ratio <= 0.15
            )
            if _name in _LAND_ADVISORY_CHECKS or _small_deficit:
                _land_advisory.append(
                    f"LAND: {_label} failed"
                    + (f" ({_deficit:.1f} m² short, {_deficit_ratio * 100.0:.1f}%)"
                       if _name == "program_fits_footprint" else "")
                )
            else:
                _land_fail.append(f"LAND: {_label} failed")
        if _land_fail:
            l1_status = "FAIL"
            l1_findings.extend(_land_fail)
        elif _land_advisory:
            if l1_status == "PASS":
                l1_status = "WARN"
            l1_findings.extend(_land_advisory)
    _land_note = ""
    if _land_fail:
        _land_note = f"; {len(_land_fail)} land check(s) failed"
    elif _land_advisory:
        _land_note = f"; {len(_land_advisory)} land advisory"
    n_chains = int(chain_audit.get("chains_checked", 0) or 0)
    layers.append(make_layer(
        "L1", l1_status,
        summary=("All geometric & statutory invariants hold" if l1_status == "PASS"
                 else (min_dim_note or aspect_note or "Degraded but within tolerances"))
        + (f"; {n_chains} dimension chains verified within 1mm" if n_chains else "")
        + _land_note,
        findings=l1_findings,
        citation="NBC 2016 Part 3 / Part 8; engine invariants REL-01, CONT-01, DIM-01, CIRC-01, VERT-01..05",
    ))

    # ---------------------------------------------------------------- L2-L8
    lq = getattr(cert, "details", {}).get("living_quality_layers", {}) if cert else {}

    l2_ok = bool(getattr(cert, "l2_door_swings_valid", True))
    layers.append(make_layer(
        "L2", "PASS" if l2_ok else "FAIL",
        summary="Zero door-swing collisions after resolution" if l2_ok else "Residual swing collisions",
        citation="NBC 2016 Part 3 Cl 12.16 door clear widths; swing-containment invariant",
    ))

    l3_ok = bool(getattr(cert, "l3_fixture_clearances_satisfied", True))
    layers.append(make_layer(
        "L3", "PASS" if l3_ok else "WARN",
        summary="All bathroom fixtures meet coded clearances" if l3_ok else "Fixture clearance advisory",
        citation="NBC 2016 Part 9 / NKBA planning standards",
    ))

    l4_ok = bool(getattr(cert, "l4_furniture_clearances_satisfied", True))
    layers.append(make_layer(
        "L4", "PASS" if l4_ok else "WARN",
        summary="Furniture sets placed with circulation envelopes" if l4_ok else "Furniture clearance advisory",
        citation="Architectural Graphic Standards; NBC 2016 Part 9 room minima",
    ))

    l5_status = _status_from_str(lq.get("L5_naming_honesty", "pass"))
    layers.append(make_layer(
        "L5", l5_status,
        summary="Room names match ontological thresholds (demote-only)" if l5_status == "PASS"
        else "Naming threshold advisory",
        citation="Ontology SpaceTypeSpec class thresholds (Master Suite >= 14.0 m2)",
    ))

    l6_status = _status_from_str(lq.get("L6_stair_compliance", "pass"))
    layers.append(make_layer(
        "L6", l6_status,
        summary="Stair verified as computed object (T/R/width/headroom)" if l6_status == "PASS"
        else "Stair compliance advisory",
        citation="NBC 2016 Part 3 Cl 12.18",
    ))

    l7_status = _status_from_str(lq.get("L7_vastu", "pass"))
    layers.append(make_layer(
        "L7", l7_status,
        summary="Vastu scoring recorded (advisory layer)" if l7_status == "PASS"
        else "Vastu advisory note",
        citation="Project Vastu ontology zone weights (advisory, non-statutory)",
    ))

    layers.append(make_layer(
        "L8", "PASS" if pi_ok else "FAIL",
        summary="Program intent satisfied (bedrooms upstairs, zoning, terrace ratio)" if pi_ok
        else "Program intent violated",
        findings=list(pi_warns or []),
        citation="NBC 2016 Part 3; program-intent engine rules",
    ))
    # Terrace-ratio justification warning - when open terrace exceeds
    # the applicable threshold, the layer must carry the conversion guidance,
    # even where the engine's hard L8 verdict passes (passive_ventilation).
    lq_audit = (lq or {}).get("program_intent_audit") or {}
    ratio_pct = lq_audit.get("terrace_ratio_pct")
    if ratio_pct is not None and not lq_audit.get("terrace_ratio_satisfied", True):
        l8_prev = layers[-1]
        layers[-1] = make_layer(
            "L8", l8_prev.status,
            summary=(f"Program intent: terrace ratio {ratio_pct}% exceeds applicable threshold - "
                     "conversion guidance issued"),
            findings=list(dict.fromkeys(
                list(l8_prev.findings)
                + [w for w in (pi_warns or []) if "Terrace Ratio" in w]
            )),
            citation="NBC 2016 Part 3; program-intent engine rules",
        )

    # ------------------------------------------------------- L9-L14 (engineering)
    try:
        vent = compute_ventilation_registry(floors, duct_shafts)
        layers.append(make_layer(
            "L9", _status_from_str(vent["status"]),
            summary=(f"{vent['external_opening_count']} external, {vent['shaft_vent_count']} shaft, "
                     f"{vent['mechanical_flagged_count']} mechanical-flagged"),
            findings=[f"{r['room_id']} (F{r['floor_index']}): mechanical ventilation flagged" for r in vent["records"] if r["status"] == "warn"],
            citation=vent["citation"],
            details={"records": vent["records"], "total_rooms": vent["total_rooms"]},
        ))
    except Exception as exc:  # defensive: a layer engine bug must never kill the gate
        logger.exception("L9 ventilation layer crashed")
        layers.append(make_layer("L9", crash_status("L9"),
                                 summary=f"Layer evaluation error: {exc} - not verified",
                                 findings=["Evaluator crashed; this layer is unverified"],
                                 reason=None, citation=None))

    try:
        wet = compute_wet_core_audit(floors, duct_shafts)
        layers.append(make_layer(
            "L10", _status_from_str(wet["status"]),
            summary=(f"{wet['associated_count']}/{wet['wet_room_count']} wet rooms shaft-grouped, "
                     f"{len(wet['crossings'])} dry-room crossings"),
            findings=list(wet["findings"]),
            citation=wet["citation"],
            details={"associations": wet.get("associations") if isinstance(wet, dict) else None,
                     "crossings": wet["crossings"]},
        ))
    except Exception as exc:
        logger.exception("L10 wet-core layer crashed")
        layers.append(make_layer("L10", crash_status("L10"),
                                 summary=f"Layer evaluation error: {exc} - not verified",
                                 findings=["Evaluator crashed; this layer is unverified"]))

    try:
        terr = compute_terrace_drainage(floors)
        l11_reason = terr.get("reason")
        if terr["status"] == "n/a" and not l11_reason:
            # Honest N/A: distinguish "no terrace requested" from "terrace plate
            # variation existed but did not materialize as a room object".
            masks = plate_masks or {}
            has_mask_terrace = any(
                str(v).lower() == "terrace"
                for m in masks.values() if isinstance(m, dict)
                for v in m.values()
            )
            l11_reason = ("Terrace plate variation present but no terrace zone "
                          "materialized in this generation"
                          if has_mask_terrace else
                          "No terrace zone on any floor of this generation")
        layers.append(make_layer(
            "L11", _status_from_str(terr["status"]),
            summary=(f"{terr['terrace_count']} terrace(s): slope {terr['terraces'][0]['slope_ratio']} to drain, "
                     f"downpipe -> {terr['site_outlet_id']}") if terr["terrace_count"] else "No terrace",
            reason=l11_reason if terr["status"] == "n/a" else None,
            citation=terr["citation"],
            details={"terraces": terr["terraces"]},
        ))
    except Exception as exc:
        logger.exception("L11 terrace-drainage layer crashed")
        layers.append(make_layer("L11", crash_status("L11"),
                                 summary=f"Layer evaluation error: {exc} - not verified",
                                 findings=["Evaluator crashed; this layer is unverified"]))

    try:
        struct = compute_structural_model(floors, typology,
                                          getattr(engine, "structural_grid", None))
        # Load-path continuity wording - the summary states the floor-to-floor
        # continuity verdict explicitly (never only as a flagged-beam count).
        n_transfer = int(struct.get("beam_count", 0) or 0)
        load_path_note = (
            f"load-path continuity verified floor-to-floor ({n_transfer} transfer beam(s) flagged)"
            if n_transfer == 0 else
            f"load-path gaps flagged: {n_transfer} transfer beam(s) required"
        )
        layers.append(make_layer(
            "L12", _status_from_str(struct["status"]),
            summary=(f"{struct['column_count']} columns (span <= {struct['max_span_m']:.1f}m), "
                     f"{load_path_note}"),
            findings=[b["note"] for b in struct["beams"]],
            citation=struct["citation"],
            details={"columns": struct["columns"][:40], "beams": struct["beams"],
                     "footing_hints": struct["footing_hints"]},
        ))
    except Exception as exc:
        logger.exception("L12 structural layer crashed")
        layers.append(make_layer("L12", crash_status("L12"),
                                 summary=f"Layer evaluation error: {exc} - not verified",
                                 findings=["Evaluator crashed; this layer is unverified"]))

    try:
        acc = compute_accessibility_audit(floors, typology)
        layers.append(make_layer(
            "L13", _status_from_str(acc["status"]),
            summary=(f"Applicability {acc['applicability']}: "
                     f"{len(acc['corridor_checks'])} corridors, "
                     f"{len(acc['door_checks'])} doors, "
                     f"{len(acc['circle_checks'])} sanitary circles"),
            findings=list(acc["findings"]),
            citation=acc["citation"],
            details={"corridor_checks": acc["corridor_checks"],
                     "circle_checks": acc["circle_checks"]},
        ))
    except Exception as exc:
        logger.exception("L13 accessibility layer crashed")
        layers.append(make_layer("L13", crash_status("L13"),
                                 summary=f"Layer evaluation error: {exc} - not verified",
                                 findings=["Evaluator crashed; this layer is unverified"]))

    try:
        occ = int(statutory_audit.get("occupant_load", 0) or 0)
        fire = compute_fire_egress_audit(floors, typology,
                                         bool(getattr(cert, "egress_distances_satisfied", True)),
                                         occupant_load=occ)
        layers.append(make_layer(
            "L14", _status_from_str(fire["status"]),
            summary=(f"Travel distances {'verified' if bool(getattr(cert, 'egress_distances_satisfied', True)) else 'EXCEEDED'}; "
                     f"{len(fire['bedroom_egress'])} bedroom egress checks, {len(fire['exit_width_table'])} exit rows"),
            findings=list(fire["findings"]),
            citation=fire["citation"],
            details={"exit_width_table": fire["exit_width_table"],
                     "bedroom_egress": fire["bedroom_egress"]},
        ))
    except Exception as exc:
        logger.exception("L14 fire-egress layer crashed")
        layers.append(make_layer("L14", crash_status("L14"),
                                 summary=f"Layer evaluation error: {exc} - not verified",
                                 findings=["Evaluator crashed; this layer is unverified"]))

    # ---------------------------------------------------------------- L15
    try:
        completeness = assess_programme_completeness(floors, typology)
        l15_status = completeness["status"]
        l15_reason = completeness.get("reason")
        l15_missing = completeness.get("missing") or []
        layers.append(make_layer(
            "L15", l15_status,
            summary=("All essential programme rooms present" if l15_status == "PASS"
                     else (l15_reason or "Missing essential programme rooms: " + ", ".join(l15_missing))),
            reason=l15_reason if l15_status == "N/A" else None,
            findings=[f"Missing essential room: {m}" for m in l15_missing],
            citation="NBC 2016 Part 3 occupancy requirements; typology programme catalogue",
            details={"missing": l15_missing, "per_unit": completeness.get("per_unit") or {},
                     "rooms_checked": completeness.get("rooms_checked", 0)},
        ))
    except Exception as exc:
        logger.exception("L15 programme-completeness layer crashed")
        layers.append(make_layer("L15", "FAIL",
                                 summary=f"Completeness audit unavailable: {exc}",
                                 findings=["Essential rooms could not be verified"],
                                 citation="NBC 2016 Part 3 occupancy requirements"))

    # Enforce completeness: every declared layer is present or explicitly FAILs.
    layers = ensure_all_layers(layers)

    layers.sort(key=lambda l: LAYER_IDS.index(l.layer_id))
    return [l.to_dict() for l in layers]


def refusal_gate_report(reason: str) -> Dict[str, Any]:
    """Gate payload for a REFUSED generation (no geometry was solved).

    A refusal is a verdict, not an absence: the caller must still receive the
    full L1-L15 contract, every layer explicitly N/A WITH the refusal reason,
    and an overall FAIL. Emitting no gate at all let a refused plan look like
    a plan whose gate had never been asked for (audit F20: absence is not a
    pass), and gave the certificate/UI surfaces nothing to render.
    """
    note = (str(reason or "").strip() or "Generation refused before any geometry was solved")
    layers: List[LayerStatus] = [
        make_layer(
            lid, "N/A",
            summary="Not evaluated: generation refused",
            reason=note,
            findings=["No geometry to evaluate - the brief was refused, not certified"],
        )
        for lid in LAYER_IDS
    ]
    dicts = [l.to_dict() for l in layers]
    return {
        "layer_ids": list(LAYER_IDS),
        "layers": dicts,
        "overall_status": "FAIL",
        "validated_layers": [],
        "n_a_layers": [{"layer_id": d["layer_id"], "reason": note} for d in dicts],
        "llm_boundary": {"events": [], "event_ids": []},
        "evaluated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "contract": "universal_gate_v1",
        "refused": True,
        "refusal_reason": note,
    }


def assemble_gate_report(layer_dicts: List[Dict[str, Any]],
                         llm_boundary: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Bundles the serialized gate into the certificate details payload."""
    overall = overall_from_dicts(layer_dicts)
    return {
        "layer_ids": LAYER_IDS,
        "layers": layer_dicts,
        "overall_status": overall,
        "validated_layers": [d["layer_id"] for d in layer_dicts if d["status"] != "N/A"],
        "n_a_layers": [{"layer_id": d["layer_id"], "reason": d.get("reason", "not_applicable")}
                       for d in layer_dicts if d["status"] == "N/A"],
        "llm_boundary": llm_boundary or {"events": [], "event_ids": []},
        "evaluated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "contract": "universal_gate_v1",
    }


# =============================================================================
# HONEST DRAWING-STATUS STAMP (single source)
# =============================================================================

STAMP_HEAD = "STATUS: CONCEPT DESIGN - VALIDATED LAYERS: ["
def drawing_status_stamp(validated_layers: Optional[List[str]],
                         scope_note: Optional[str] = None) -> str:
    """Canonical honest stamp, e.g.
    'STATUS: CONCEPT DESIGN - VALIDATED LAYERS: [L1, L2] - NOT FOR CONSTRUCTION'.

    Every sheet/PDF surface must derive its stamp from this helper. The
    sheet-wrap logic in drawing_ir._wrap_status_stamp parses exactly this
    format (head prefix per line + legal tail on the final line); do not
    re-word here without updating that parser.
    """
    layers_str = ", ".join(validated_layers or [])
    note = f" ({scope_note})" if scope_note else ""
    # The scope note sits AFTER the closing bracket: the sheet wrap parser
    # treats everything inside [...] as layer ids.
    return f"{STAMP_HEAD}{layers_str}]{note} - NOT FOR CONSTRUCTION"
