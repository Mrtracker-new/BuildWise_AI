"""
BuildWise AI - Placement Knowledge Base (v13)
Data-driven codification of Indian residential architectural canon (NBC 2016 & Vastu Shastra).
No prose: pure typed structures with hard constraints, forbidden adjacencies, and band rules.
"""

from typing import List, Dict, Set, Optional, Any
from pydantic import BaseModel, Field


def normalize_room_type(raw_name: str) -> str:
    """Normalizes any user or program room label into canonical KB room type."""
    clean = raw_name.strip().lower().replace(" ", "_").replace("-", "_")
    if clean in ("living", "living_room", "hall", "drawing_room", "foyer"):
        return "living"
    if clean in ("puja", "pooja", "mandir", "prayer", "prayer_room"):
        return "pooja"
    if clean in ("kitchen", "kitchenette", "cook"):
        return "kitchen"
    if clean in ("master_bed", "master_bedroom", "mbr", "master"):
        return "master_bed"
    if clean in ("bedroom", "bed_2", "bed_3", "guest_bed", "kids_bed", "bed"):
        return "bedroom"
    if clean in ("common_bath", "bath_1", "bath", "bathroom", "toilet", "common_toilet"):
        return "common_bath"
    if clean in ("bath_2", "attached_bath", "ensuite_bath", "ensuite"):
        return "attached_bath"
    if clean in ("wc", "utility", "store", "wash", "powder_room"):
        return "wc_utility"
    if clean in ("dining", "dining_room", "dining_area"):
        return "dining"
    if clean in ("corridor", "hallway", "circulation", "passage"):
        return "corridor"
    return clean


class RoomPlacementRule(BaseModel):
    room_type: str = Field(..., description="Canonical room identifier")
    name: str = Field(..., description="Human-readable title")
    preferred_zone: List[str] = Field(..., description="Vastu preferred quadrants/zones")
    allowed_bands: List[str] = Field(..., description="Permitted depth bands: front, middle, rear, flank")
    required_adjacency: List[str] = Field(default_factory=list, description="Permitted rooms to share a wall or open doors into")
    forbidden_adjacency: List[str] = Field(default_factory=list, description="Rooms strictly forbidden from sharing a common wall")
    exterior_wall_required: bool = Field(default=True, description="Must touch at least one exterior boundary for ventilation/light")
    is_leaf: bool = Field(default=True, description="Degree in door graph must be exactly 1 (no through-traffic)")
    entry_rule: str = Field(default="corridor_only", description="Access rule: main_entry, corridor_only, living_or_corridor, ensuite_parent")
    min_area_m2: float
    max_area_m2: float
    min_width_m: float = 2.40
    max_aspect_ratio: float = 2.20
    zone_category: str = Field(default="service", description="public, private, service, or circulation")
    default_rationale: str = Field(..., description="Architectural rationale sentence")


PLACEMENT_KB: Dict[str, RoomPlacementRule] = {
    "living": RoomPlacementRule(
        room_type="living",
        name="Living Room",
        preferred_zone=["N", "E", "NE", "Center"],
        allowed_bands=["front"],
        required_adjacency=["exterior", "corridor"],
        forbidden_adjacency=[],
        exterior_wall_required=True,
        is_leaf=False,  # Connector hub
        entry_rule="main_entry",
        min_area_m2=18.0,
        max_area_m2=35.0,
        min_width_m=3.50,
        max_aspect_ratio=2.20,
        zone_category="public",
        default_rationale="Front-center orientation receives auspicious main entry frontage and acts as the primary social connection hub."
    ),
    "pooja": RoomPlacementRule(
        room_type="pooja",
        name="Pooja Room",
        preferred_zone=["NE"],
        allowed_bands=["front", "flank"],
        required_adjacency=["living", "corridor"],
        forbidden_adjacency=["common_bath", "attached_bath", "bath_1", "bath_2", "wc_utility", "wc", "kitchen", "bedroom", "master_bed"],
        exterior_wall_required=True,
        is_leaf=True,  # Door graph degree 1
        entry_rule="living_or_corridor",
        min_area_m2=4.0,
        max_area_m2=9.0,
        min_width_m=2.40,
        max_aspect_ratio=2.20,
        zone_category="public",
        default_rationale="North-East (Ishanya) sacred corner with direct morning illumination, strictly isolated from plumbing wet walls and sleeping quarters."
    ),
    "kitchen": RoomPlacementRule(
        room_type="kitchen",
        name="Kitchen",
        preferred_zone=["SE"],
        allowed_bands=["rear", "flank"],
        required_adjacency=["dining", "living", "corridor"],
        forbidden_adjacency=["common_bath", "attached_bath", "bath_1", "bath_2", "wc_utility", "wc", "pooja", "master_bed", "bedroom"],
        exterior_wall_required=True,
        is_leaf=True,  # Door graph degree 1
        entry_rule="corridor_only",
        min_area_m2=9.0,
        max_area_m2=16.0,
        min_width_m=2.60,
        max_aspect_ratio=2.20,
        zone_category="service",
        default_rationale="South-East (Agneya) fire quadrant with mandatory dual-aspect exterior ventilation, separated from sanitary plumbing stacks and bedrooms."
    ),
    "master_bed": RoomPlacementRule(
        room_type="master_bed",
        name="Master Bedroom",
        preferred_zone=["SW"],
        allowed_bands=["rear", "flank"],
        required_adjacency=["corridor"],
        forbidden_adjacency=["kitchen"],
        exterior_wall_required=True,
        is_leaf=True,  # Door opens to corridor (or accepts attached ensuite)
        entry_rule="corridor_only",
        min_area_m2=14.0,
        max_area_m2=22.0,
        min_width_m=3.40,
        max_aspect_ratio=2.20,
        zone_category="private",
        default_rationale="South-West (Nairutya) heavy foundation zone for primary occupants, insulated from kitchen noise and street frontage."
    ),
    "bedroom": RoomPlacementRule(
        room_type="bedroom",
        name="Bedroom",
        preferred_zone=["W", "NW", "S"],
        allowed_bands=["rear", "flank"],
        required_adjacency=["corridor"],
        forbidden_adjacency=["kitchen"],
        exterior_wall_required=True,
        is_leaf=True,
        entry_rule="corridor_only",
        min_area_m2=10.0,
        max_area_m2=18.0,
        min_width_m=3.00,
        max_aspect_ratio=2.20,
        zone_category="private",
        default_rationale="West or North-West flank placement ensuring privacy, natural cross-ventilation, and dedicated corridor circulation access."
    ),
    "common_bath": RoomPlacementRule(
        room_type="common_bath",
        name="Common Bath",
        preferred_zone=["NW", "W"],
        allowed_bands=["flank", "rear"],
        required_adjacency=["corridor"],
        forbidden_adjacency=["pooja", "kitchen", "entry_axis", "frontage", "central_box"],
        exterior_wall_required=True,
        is_leaf=True,  # Door graph degree exactly 1
        entry_rule="corridor_only",
        min_area_m2=3.5,
        max_area_m2=6.0,
        min_width_m=1.50,
        max_aspect_ratio=2.20,
        zone_category="service",
        default_rationale="North-West service flank in rear half with direct exterior ventilation; door opens onto circulation corridor with zero view from entry."
    ),
    "attached_bath": RoomPlacementRule(
        room_type="attached_bath",
        name="Attached Bath",
        preferred_zone=["W", "NW", "S"],
        allowed_bands=["flank", "rear"],
        required_adjacency=["master_bed"],
        forbidden_adjacency=["pooja", "kitchen"],
        exterior_wall_required=True,
        is_leaf=True,
        entry_rule="ensuite_parent",
        min_area_m2=3.5,
        max_area_m2=5.5,
        min_width_m=1.50,
        max_aspect_ratio=2.20,
        zone_category="service",
        default_rationale="Private ensuite bath adjoining master suite on exterior wall, isolated from public corridors and food preparation areas."
    ),
    "wc_utility": RoomPlacementRule(
        room_type="wc_utility",
        name="WC / Utility",
        preferred_zone=["NW", "W"],
        allowed_bands=["flank", "rear"],
        required_adjacency=["corridor"],
        forbidden_adjacency=["pooja", "kitchen"],
        exterior_wall_required=True,
        is_leaf=True,
        entry_rule="corridor_only",
        min_area_m2=1.5,
        max_area_m2=3.5,
        min_width_m=1.20,
        max_aspect_ratio=2.20,
        zone_category="service",
        default_rationale="Peripheral utility and sanitation on the service flank touching exterior envelope."
    ),
    "dining": RoomPlacementRule(
        room_type="dining",
        name="Dining Area",
        preferred_zone=["E", "Center"],
        allowed_bands=["middle", "front"],
        required_adjacency=["kitchen", "living", "corridor"],
        forbidden_adjacency=["common_bath", "attached_bath", "wc_utility"],
        exterior_wall_required=False,
        is_leaf=False,
        entry_rule="living_or_corridor",
        min_area_m2=8.0,
        max_area_m2=15.0,
        min_width_m=2.80,
        max_aspect_ratio=2.00,
        zone_category="public",
        default_rationale="Central-East buffer facilitating seamless meal service between kitchen and social living areas."
    ),
    "corridor": RoomPlacementRule(
        room_type="corridor",
        name="Corridor",
        preferred_zone=["Center"],
        allowed_bands=["middle"],
        required_adjacency=["living"],
        forbidden_adjacency=[],
        exterior_wall_required=False,
        is_leaf=False,
        entry_rule="living_only",
        min_area_m2=6.0,
        max_area_m2=20.0,
        min_width_m=1.00,
        max_aspect_ratio=10.0,
        zone_category="circulation",
        default_rationale="Central circulation spine connecting public living areas to private bedrooms and service leaves without habitable through-traffic."
    ),
}


def get_placement_rule(room_name: str) -> RoomPlacementRule:
    """Retrieves canonical placement rule for given room name with fallback."""
    canonical = normalize_room_type(room_name)
    if canonical in PLACEMENT_KB:
        return PLACEMENT_KB[canonical]
    # Fallback generic room rule
    return RoomPlacementRule(
        room_type=canonical,
        name=room_name.replace("_", " ").title(),
        preferred_zone=["W", "NW", "Center"],
        allowed_bands=["middle", "rear"],
        required_adjacency=["corridor"],
        forbidden_adjacency=["common_bath", "attached_bath"] if "puja" in canonical or "kitchen" in canonical else [],
        exterior_wall_required=True,
        is_leaf=True,
        entry_rule="corridor_only",
        min_area_m2=8.0,
        max_area_m2=20.0,
        min_width_m=2.40,
        max_aspect_ratio=2.20,
        zone_category="private",
        default_rationale="Standard architectural placement ensuring dedicated circulation access and ventilation."
    )


def get_kb_default_placement(
    room_ids: List[str],
    plot_w: float,
    plot_d: float,
    facing: str = "North"
) -> Dict[str, Any]:
    """
    Returns the deterministic, architect-approved standard placement mapping
    strictly conforming to NBC 2016 and Vastu Shastra canon.
    """
    placement: Dict[str, Dict[str, Any]] = {}
    normalized_map = {r: normalize_room_type(r) for r in room_ids}

    for r_raw, r_canon in normalized_map.items():
        rule = get_placement_rule(r_canon)
        if r_canon == "living":
            placement[r_raw] = {
                "zone": "N",
                "band": "front",
                "adjacent_to": ["exterior", "corridor", "pooja"] if any(normalized_map[k] == "pooja" for k in normalized_map) else ["exterior", "corridor"],
                "door_opens_onto": "exterior",
                "placement_rationale": rule.default_rationale,
            }
        elif r_canon == "pooja":
            placement[r_raw] = {
                "zone": "NE",
                "band": "front",
                "adjacent_to": ["living", "exterior"],
                "door_opens_onto": "living",
                "placement_rationale": rule.default_rationale,
            }
        elif r_canon == "kitchen":
            placement[r_raw] = {
                "zone": "SE",
                "band": "rear",
                "adjacent_to": ["corridor", "exterior"],
                "door_opens_onto": "corridor",
                "placement_rationale": rule.default_rationale,
            }
        elif r_canon == "master_bed":
            placement[r_raw] = {
                "zone": "SW",
                "band": "rear",
                "adjacent_to": ["corridor", "exterior"],
                "door_opens_onto": "corridor",
                "placement_rationale": rule.default_rationale,
            }
        elif r_canon in ("common_bath", "bath_1"):
            placement[r_raw] = {
                "zone": "NW",
                "band": "flank",
                "adjacent_to": ["corridor", "exterior"],
                "door_opens_onto": "corridor",
                "placement_rationale": rule.default_rationale,
            }
        elif r_canon in ("attached_bath", "bath_2"):
            placement[r_raw] = {
                "zone": "S",
                "band": "rear",
                "adjacent_to": ["master_bed", "exterior"],
                "door_opens_onto": "master_bed",
                "placement_rationale": rule.default_rationale,
            }
        elif r_canon in ("bedroom", "bed_2"):
            placement[r_raw] = {
                "zone": "W",
                "band": "rear",
                "adjacent_to": ["corridor", "exterior"],
                "door_opens_onto": "corridor",
                "placement_rationale": rule.default_rationale,
            }
        elif r_canon == "dining":
            placement[r_raw] = {
                "zone": "E",
                "band": "middle",
                "adjacent_to": ["living", "kitchen", "corridor"],
                "door_opens_onto": "corridor",
                "placement_rationale": rule.default_rationale,
            }
        else:
            placement[r_raw] = {
                "zone": rule.preferred_zone[0],
                "band": rule.allowed_bands[0],
                "adjacent_to": ["corridor", "exterior"],
                "door_opens_onto": "corridor",
                "placement_rationale": rule.default_rationale,
            }

    # Ensure corridor presence in logical placement
    if "corridor" not in placement:
        placement["corridor"] = {
            "zone": "Center",
            "band": "middle",
            "adjacent_to": list(placement.keys()),
            "door_opens_onto": "living",
            "placement_rationale": PLACEMENT_KB["corridor"].default_rationale,
        }

    return {
        "placement": placement,
        "source": "kb-default"
    }
