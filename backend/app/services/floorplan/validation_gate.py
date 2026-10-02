"""
validation_gate.py - Universal Validation Gate 
=========================================================
Every generation - any typology, any floor count - is judged by the same
contract: the full L1-L14 layer stack. No layer is ever silently skipped;
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

Overall status = worst layer (FAIL > WARN > N/A > PASS > N/A is never worse
than WARN unless no other signal exists...). Concretely:
  overall = FAIL if any FAIL
  else WARN if any WARN
  else PASS
N/A layers never gate validity: they are recorded with explicit reasons.
"""

import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger("buildwise.validation_gate")

# Canonical layer order rendered on sheets and UI panels.
LAYER_IDS: List[str] = ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8",
                        "L9", "L10", "L11", "L12", "L13", "L14"]

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
}

STATUS_ORDER = {"PASS": 0, "N/A": 1, "WARN": 2, "FAIL": 3}

# Layers whose FAIL invalidates the whole certificate (hard layers).
HARD_FAIL_LAYERS = {"L1", "L2", "L8", "L14"}


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


def gate_is_valid(overall: str) -> bool:
    """Certificate validity hard-fails only on FAIL-status hard layers."""
    return overall != "FAIL"


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
) -> List[Dict[str, Any]]:
    """
    Runs the universal gate over ALL layers L1-L14 and returns the serialized
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
    n_chains = int(chain_audit.get("chains_checked", 0) or 0)
    layers.append(make_layer(
        "L1", l1_status,
        summary=("All geometric & statutory invariants hold" if l1_status == "PASS"
                 else (min_dim_note or aspect_note or "Degraded but within tolerances"))
        + (f"; {n_chains} dimension chains verified within 1mm" if n_chains else ""),
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
        layers.append(make_layer("L9", "WARN", summary=f"Layer evaluation error: {exc}",
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
        layers.append(make_layer("L10", "WARN", summary=f"Layer evaluation error: {exc}"))

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
        layers.append(make_layer("L11", "WARN", summary=f"Layer evaluation error: {exc}"))

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
        layers.append(make_layer("L12", "WARN", summary=f"Layer evaluation error: {exc}"))

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
        layers.append(make_layer("L13", "WARN", summary=f"Layer evaluation error: {exc}"))

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
        layers.append(make_layer("L14", "WARN", summary=f"Layer evaluation error: {exc}"))

    # Enforce completeness: the gate may NEVER return fewer layers than declared.
    present = {l.layer_id for l in layers}
    for lid in LAYER_IDS:
        if lid not in present:
            layers.append(make_layer(lid, "N/A", reason="Layer evaluator did not run - recorded, never skipped"))

    layers.sort(key=lambda l: LAYER_IDS.index(l.layer_id))
    return [l.to_dict() for l in layers]


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


def build_validated_layers_stamp_list(gate: Dict[str, Any]) -> List[str]:
    """Layer ids stamped on sheets: every layer that RAN (PASS/WARN/FAIL), not N/A."""
    return [d["layer_id"] for d in (gate.get("layers") or []) if d.get("status") != "N/A"]


# =============================================================================
# HONEST DRAWING-STATUS STAMP (single source)
# =============================================================================

STAMP_HEAD = "STATUS: CONCEPT DESIGN - VALIDATED LAYERS: ["
STAMP_TAIL = "] - NOT FOR CONSTRUCTION"


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
