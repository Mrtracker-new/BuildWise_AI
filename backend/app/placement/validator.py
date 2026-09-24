"""
BuildWise AI - Placement Validator and Auto-Repair Engine (v13)
Deterministic verification and automatic architectural repair for LLM placement specifications.
Enforces that no layout with forbidden adjacencies (e.g. bath adjacent to pooja or kitchen)
can ever reach the geometry solver.
"""

from typing import Dict, List, Any, Tuple, Optional
from pydantic import BaseModel, Field

from app.placement.kb import (
    PLACEMENT_KB,
    get_placement_rule,
    get_kb_default_placement,
    normalize_room_type,
)


class ValidatedPlacementResult(BaseModel):
    is_valid: bool
    placement_source: str = Field(..., description="'llm+kb' or 'kb-default'")
    placement: Dict[str, Dict[str, Any]]
    placement_logic: Dict[str, str] = Field(default_factory=dict, description="Room-by-room architectural rationale")
    repaired_violations: List[str] = Field(default_factory=list)


def validate_and_repair_placement(
    raw_spec: Optional[Dict[str, Any]],
    room_ids: List[str],
    plot_w: float,
    plot_d: float,
    facing: str = "North"
) -> ValidatedPlacementResult:
    """
    Validates LLM-reasoned placement against KB hard rules.
    Repairs recoverable violations (e.g., bath on frontage -> NW flank rear half).
    Falls back to KB default if spec is missing, corrupt, or unrecoverable.
    """
    default_res = get_kb_default_placement(room_ids, plot_w, plot_d, facing)
    default_placement = default_res["placement"]
    default_logic = {r: data.get("placement_rationale", "") for r, data in default_placement.items()}

    if not raw_spec or not isinstance(raw_spec, dict) or "rooms" not in raw_spec:
        return ValidatedPlacementResult(
            is_valid=True,
            placement_source="kb-default",
            placement=default_placement,
            placement_logic=default_logic,
            repaired_violations=["LLM placement unavailable or malformed; applied KB default canonical layout."]
        )

    rooms_spec = raw_spec.get("rooms", {})
    if not isinstance(rooms_spec, dict):
        return ValidatedPlacementResult(
            is_valid=True,
            placement_source="kb-default",
            placement=default_placement,
            placement_logic=default_logic,
            repaired_violations=["Malformed rooms specification; applied KB default layout."]
        )

    repaired: Dict[str, Dict[str, Any]] = {}
    logic: Dict[str, str] = {}
    repairs: List[str] = []

    # Map requested rooms to normalized names
    for r_raw in room_ids:
        r_canon = normalize_room_type(r_raw)
        rule = get_placement_rule(r_canon)

        node = rooms_spec.get(r_raw) or rooms_spec.get(r_canon) or {}
        zone = node.get("zone", rule.preferred_zone[0])
        band = node.get("band", rule.allowed_bands[0])
        adjacent_to = list(node.get("adjacent_to", []))
        door_opens_onto = node.get("door_opens_onto", rule.entry_rule)
        rationale = node.get("placement_rationale", rule.default_rationale)

        # 1. HARD RULE: Living Room receives entry and sits in front band
        if r_canon == "living":
            if band != "front":
                repairs.append("Living room forced to front band for main entry reception.")
                band = "front"
            if door_opens_onto != "exterior":
                repairs.append("Main entry forced onto Living Room exterior wall.")
                door_opens_onto = "exterior"
            if "exterior" not in adjacent_to:
                adjacent_to.append("exterior")

        # 2. HARD RULE: Common Bath never on frontage, entry axis, or central box
        if r_canon in ("common_bath", "bath_1"):
            if band in ("front", "middle"):
                repairs.append(f"{r_raw} moved from {band} band to rear-flank service zone.")
                band = "flank"
                zone = "NW"
            if door_opens_onto != "corridor":
                repairs.append(f"{r_raw} door forced onto corridor (no through-traffic or entry foyer facing).")
                door_opens_onto = "corridor"
            # Strip forbidden adjacencies
            bad_adjs = [a for a in adjacent_to if normalize_room_type(a) in ("pooja", "kitchen", "exterior_front")]
            if bad_adjs:
                repairs.append(f"Severed forbidden adjacency between {r_raw} and {bad_adjs}.")
                adjacent_to = [a for a in adjacent_to if a not in bad_adjs]
            if "corridor" not in adjacent_to:
                adjacent_to.append("corridor")

        # 3. HARD RULE: Pooja Room in NE corner, isolated from bathrooms, kitchen, bedrooms
        if r_canon == "pooja":
            if zone != "NE":
                repairs.append("Pooja room relocated to sacred North-East (Ishanya) corner.")
                zone = "NE"
            bad_adjs = [a for a in adjacent_to if normalize_room_type(a) in ("common_bath", "attached_bath", "bath_1", "bath_2", "kitchen", "bedroom", "master_bed")]
            if bad_adjs:
                repairs.append(f"Severed forbidden adjacency between Pooja and {bad_adjs}.")
                adjacent_to = [a for a in adjacent_to if a not in bad_adjs]
            if "living" not in adjacent_to and "corridor" not in adjacent_to:
                adjacent_to.append("living")
            door_opens_onto = "living" if "living" in adjacent_to else "corridor"

        # 4. HARD RULE: Kitchen in SE corner, forbidden with bath and pooja
        if r_canon == "kitchen":
            if zone not in ("SE", "E"):
                repairs.append("Kitchen relocated to Agneya (South-East) fire quadrant.")
                zone = "SE"
            bad_adjs = [a for a in adjacent_to if normalize_room_type(a) in ("common_bath", "attached_bath", "bath_1", "bath_2", "pooja", "master_bed", "bedroom")]
            if bad_adjs:
                repairs.append(f"Severed forbidden adjacency between Kitchen and {bad_adjs}.")
                adjacent_to = [a for a in adjacent_to if a not in bad_adjs]
            if "corridor" not in adjacent_to and "dining" not in adjacent_to:
                adjacent_to.append("corridor")

        # 5. HARD RULE: Master Bedroom in SW quadrant
        if r_canon == "master_bed":
            if zone != "SW":
                repairs.append("Master Bedroom relocated to South-West (Nairutya) foundation quadrant.")
                zone = "SW"
            if "kitchen" in [normalize_room_type(a) for a in adjacent_to]:
                repairs.append("Severed Master Bedroom adjacency to Kitchen.")
                adjacent_to = [a for a in adjacent_to if normalize_room_type(a) != "kitchen"]

        repaired[r_raw] = {
            "zone": zone,
            "band": band,
            "adjacent_to": adjacent_to,
            "door_opens_onto": door_opens_onto,
            "placement_rationale": rationale,
        }
        logic[r_raw] = rationale

    # Ensure corridor presence
    if "corridor" not in repaired:
        repaired["corridor"] = default_placement["corridor"]
        logic["corridor"] = default_logic["corridor"]

    return ValidatedPlacementResult(
        is_valid=True,
        placement_source="llm+kb",
        placement=repaired,
        placement_logic=logic,
        repaired_violations=repairs
    )
