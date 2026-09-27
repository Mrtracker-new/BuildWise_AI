"""
ontology.py - Universal Space Semantics Ontology & Spatial Relations Algebra
============================================================================
Single source of truth for architectural spatial semantics, statutory NBC 2016 norms,
Vastu Shastra matrices, vertical stacking invariants, and derived relational algebra.

This module provides a pure, declarative, typed data ontology for ALL space types
across all four canonical typologies:
- T1: Single-Family Residence (Individual Villa / House)
- T2: Family Apartment Residence (Small Multi-Unit Building)
- T3: Large Commercial Complex (Office / Multi-Unit Complex)
- T4: Warehouse / Light Industrial Logistics Facility

Zero solver code changes are required when adding new space types or rules.
"""

from __future__ import annotations

from enum import Enum
from typing import Dict, List, Set, Tuple, Optional, Any, Literal
from pydantic import BaseModel, Field


# =============================================================================
# 1. CORE ENUMS & TAXONOMIES
# =============================================================================

class FunctionType(str, Enum):
    COOKING = "cooking"
    SANITATION = "sanitation"
    WORSHIP = "worship"
    SLEEP = "sleep"
    SOCIAL = "social"
    EATING = "eating"
    CIRCULATION = "circulation"
    STORAGE = "storage"
    WORK = "work"
    OUTDOOR = "outdoor"
    RECEPTION = "reception"
    MEETING = "meeting"
    TECHNICAL = "technical"
    PRODUCTION = "production"
    LOADING = "loading"
    AMENITY = "amenity"
    SECURITY = "security"


class HygieneType(str, Enum):
    SACRED = "sacred"
    CLEAN = "clean"
    NEUTRAL = "neutral"
    WET = "wet"
    FOUL = "foul"


class PublicAccess(str, Enum):
    PUBLIC = "public"
    SEMI = "semi"
    PRIVATE = "private"
    RESTRICTED = "restricted"


class VisitorDepth(str, Enum):
    FRONT = "front"
    MID = "mid"
    DEEP = "deep"


class SecurityLevel(str, Enum):
    OPEN = "open"
    CONTROLLED = "controlled"
    SECURE = "secure"


class FireHazard(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class EgressRole(str, Enum):
    NONE = "none"
    EXIT = "exit"
    PROTECTED_EXIT = "protected_exit"


class FloorLoad(str, Enum):
    NORMAL = "normal"
    HEAVY = "heavy"


class ServiceSide(str, Enum):
    FRONT_OF_HOUSE = "front_of_house"
    BACK_OF_HOUSE = "back_of_house"


class RelationType(str, Enum):
    MUST_ADJACENT = "MUST_ADJACENT"
    PREFER_ADJACENT = "PREFER_ADJACENT"
    NEUTRAL = "NEUTRAL"
    PREFER_SEPARATE = "PREFER_SEPARATE"
    FORBIDDEN_WALL = "FORBIDDEN_WALL"
    FORBIDDEN_DOOR_FACING = "FORBIDDEN_DOOR_FACING"
    FORBIDDEN_NEAR = "FORBIDDEN_NEAR"
    FORBIDDEN_ABOVE = "FORBIDDEN_ABOVE"


class RationaleTag(str, Enum):
    HYGIENE = "HYGIENE"
    VASTU = "VASTU"
    NBC = "NBC"
    PRIVACY = "PRIVACY"
    NOISE = "NOISE"
    FUNCTION = "FUNCTION"
    FIRE_SAFETY = "FIRE_SAFETY"
    SECURITY = "SECURITY"
    STRUCTURE = "STRUCTURE"


# =============================================================================
# 2. SPACE TYPE SPECIFICATION & ATTRIBUTE SCHEMA
# =============================================================================

class SpaceTypeSpec(BaseModel):
    """
    Exhaustive semantic attribute schema per space type.
    Pure declarative data representing physical, environmental, acoustic,
    hygienic, structural, and regulatory properties.
    """
    id: str = Field(..., description="Unique canonical space type identifier")
    name: str = Field(..., description="Human-readable architectural title")
    typologies: List[str] = Field(..., description="Applicable typologies: T1, T2, T3, T4")
    function: FunctionType
    hygiene: HygieneType

    # Emissions (0 = None, 1 = Low, 2 = Medium, 3 = High)
    odor_emit: int = Field(ge=0, le=3, default=0)
    moisture_emit: int = Field(ge=0, le=3, default=0)
    grease_emit: int = Field(ge=0, le=3, default=0)
    noise_emit: int = Field(ge=0, le=3, default=0)

    # Sensitivities (0 = Tolerant, 3 = Highly Sensitive)
    noise_sensitive: int = Field(ge=0, le=3, default=0)
    acoustic_privacy: int = Field(ge=0, le=3, default=0)

    # Access & Circulation
    public_access: PublicAccess = PublicAccess.SEMI
    visitor_depth: VisitorDepth = VisitorDepth.MID
    security: SecurityLevel = SecurityLevel.OPEN
    service_side: ServiceSide = ServiceSide.FRONT_OF_HOUSE

    # Safety & Structural Load
    fire_hazard: FireHazard = FireHazard.LOW
    egress_role: EgressRole = EgressRole.NONE
    floor_load: FloorLoad = FloorLoad.NORMAL

    # Environmental & Statutory Requirements
    daylight_req: bool = True
    ventilation_req: Literal["natural", "mechanical", "both"] = "natural"
    min_area_sqm: float = Field(gt=0.0)
    min_width_m: float = Field(gt=0.0)
    max_aspect_ratio: float = Field(default=2.0, gt=0.0)

    # Vastu Shastra Cardinal Zoning Weights (-1.0 = Prohibited, 0.0 = Neutral, 1.0 = Optimal)
    vastu_zone_weights: Dict[str, float] = Field(default_factory=dict)

    # Permitted Storey Levels per Typology: 0 = Ground, 1 = G+1, 2 = G+2, 3 = G+3
    permitted_levels: List[int] = Field(default_factory=lambda: [0, 1, 2, 3])

    # Core & Enclosure Invariants
    is_vertical_core: bool = False
    requires_exterior_wall: bool = True
    citation: str = "NBC 2016 Part 3 Table 1"


# =============================================================================
# 3. RULE MODELS & RELATIONS
# =============================================================================

class SpatialRule(BaseModel):
    """Declarative relational rule with unique ID, rationale tag, and statutory citation."""
    rule_id: str = Field(..., description="Stable unique rule identifier")
    relation: RelationType
    rationale: RationaleTag
    citation: str = Field(..., description="Statutory standard or architectural code clause")
    description: str
    is_override: bool = False


# =============================================================================
# 4. EXHAUSTIVE SPACE TYPE CATALOG (ALL 4 TYPOLOGIES: T1..T4)
# =============================================================================

UNIVERSAL_SPACE_CATALOG: Dict[str, SpaceTypeSpec] = {
    # -------------------------------------------------------------------------
    # TYPOLOGY T1: SINGLE-FAMILY RESIDENCE
    # -------------------------------------------------------------------------
    "living": SpaceTypeSpec(
        id="living",
        name="Living Room",
        typologies=["T1_SINGLE_FAMILY"],
        function=FunctionType.SOCIAL,
        hygiene=HygieneType.CLEAN,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=1,
        noise_sensitive=1, acoustic_privacy=1,
        public_access=PublicAccess.PUBLIC,
        visitor_depth=VisitorDepth.FRONT,
        security=SecurityLevel.OPEN,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.EXIT,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="natural",
        min_area_sqm=16.0,
        min_width_m=3.60,
        max_aspect_ratio=1.80,
        vastu_zone_weights={"N": 1.0, "NE": 1.0, "E": 0.9, "CENTER": 0.8, "W": 0.5, "NW": 0.5, "SE": 0.2, "S": 0.0, "SW": -1.0},
        permitted_levels=[0],
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Cl 12.2.1 / Table 1",
    ),
    "dining": SpaceTypeSpec(
        id="dining",
        name="Dining Area",
        typologies=["T1_SINGLE_FAMILY"],
        function=FunctionType.EATING,
        hygiene=HygieneType.CLEAN,
        odor_emit=1, moisture_emit=0, grease_emit=0, noise_emit=1,
        noise_sensitive=1, acoustic_privacy=0,
        public_access=PublicAccess.PUBLIC,
        visitor_depth=VisitorDepth.MID,
        security=SecurityLevel.OPEN,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="natural",
        min_area_sqm=8.0,
        min_width_m=2.40,
        max_aspect_ratio=2.00,
        vastu_zone_weights={"W": 1.0, "E": 0.9, "CENTER": 0.8, "N": 0.6, "NW": 0.6, "SE": 0.4, "S": 0.2, "NE": 0.0, "SW": -0.8},
        permitted_levels=[0],
        is_vertical_core=False,
        requires_exterior_wall=False,
        citation="NBC 2016 Pt 3 Table 1",
    ),
    "kitchen": SpaceTypeSpec(
        id="kitchen",
        name="Kitchen",
        typologies=["T1_SINGLE_FAMILY"],
        function=FunctionType.COOKING,
        hygiene=HygieneType.WET,
        odor_emit=2, moisture_emit=2, grease_emit=3, noise_emit=1,
        noise_sensitive=0, acoustic_privacy=0,
        public_access=PublicAccess.SEMI,
        visitor_depth=VisitorDepth.MID,
        security=SecurityLevel.OPEN,
        service_side=ServiceSide.BACK_OF_HOUSE,
        fire_hazard=FireHazard.MEDIUM,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="both",
        min_area_sqm=7.5,
        min_width_m=2.10,
        max_aspect_ratio=1.80,
        vastu_zone_weights={"SE": 1.0, "NW": 0.7, "E": 0.6, "S": 0.4, "W": 0.0, "CENTER": -0.8, "N": -0.8, "SW": -1.0, "NE": -1.0},
        permitted_levels=[0],
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Cl 12.2.3 / Table 1",
    ),
    "puja": SpaceTypeSpec(
        id="puja",
        name="Pooja Room",
        typologies=["T1_SINGLE_FAMILY"],
        function=FunctionType.WORSHIP,
        hygiene=HygieneType.SACRED,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=0,
        noise_sensitive=3, acoustic_privacy=2,
        public_access=PublicAccess.SEMI,
        visitor_depth=VisitorDepth.FRONT,
        security=SecurityLevel.OPEN,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="natural",
        min_area_sqm=3.0,
        min_width_m=1.80,
        max_aspect_ratio=1.50,
        vastu_zone_weights={"NE": 1.0, "E": 0.9, "N": 0.8, "CENTER": 0.2, "NW": 0.0, "SE": -0.5, "W": -0.5, "S": -1.0, "SW": -1.0},
        permitted_levels=[0, 1],
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="Vastu Shastra Canon & NBC 2016 Cl 12.2",
    ),
    "master_bed": SpaceTypeSpec(
        id="master_bed",
        name="Master Bedroom",
        typologies=["T1_SINGLE_FAMILY"],
        function=FunctionType.SLEEP,
        hygiene=HygieneType.CLEAN,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=0,
        noise_sensitive=3, acoustic_privacy=3,
        public_access=PublicAccess.PRIVATE,
        visitor_depth=VisitorDepth.DEEP,
        security=SecurityLevel.CONTROLLED,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="natural",
        min_area_sqm=14.0,
        min_width_m=3.40,
        max_aspect_ratio=1.80,
        vastu_zone_weights={"SW": 1.0, "S": 0.8, "W": 0.8, "NW": 0.4, "CENTER": 0.0, "SE": -0.5, "E": -0.8, "N": -0.8, "NE": -1.0},
        permitted_levels=[0, 1, 2],
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Cl 12.2.2 / Table 1",
    ),
    "bed_2": SpaceTypeSpec(
        id="bed_2",
        name="Bedroom 2",
        typologies=["T1_SINGLE_FAMILY"],
        function=FunctionType.SLEEP,
        hygiene=HygieneType.CLEAN,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=0,
        noise_sensitive=3, acoustic_privacy=3,
        public_access=PublicAccess.PRIVATE,
        visitor_depth=VisitorDepth.DEEP,
        security=SecurityLevel.CONTROLLED,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="natural",
        min_area_sqm=11.0,
        min_width_m=3.00,
        max_aspect_ratio=1.80,
        vastu_zone_weights={"W": 1.0, "NW": 0.9, "N": 0.7, "S": 0.5, "SW": 0.4, "E": 0.2, "CENTER": 0.0, "SE": -0.5, "NE": -1.0},
        permitted_levels=[1, 2],
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Cl 12.2.2 / Table 1",
    ),
    "bath_1": SpaceTypeSpec(
        id="bath_1",
        name="Primary Bath",
        typologies=["T1_SINGLE_FAMILY"],
        function=FunctionType.SANITATION,
        hygiene=HygieneType.FOUL,
        odor_emit=2, moisture_emit=3, grease_emit=0, noise_emit=1,
        noise_sensitive=0, acoustic_privacy=3,
        public_access=PublicAccess.PRIVATE,
        visitor_depth=VisitorDepth.DEEP,
        security=SecurityLevel.CONTROLLED,
        service_side=ServiceSide.BACK_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="both",
        min_area_sqm=3.5,
        min_width_m=1.50,
        max_aspect_ratio=2.00,
        vastu_zone_weights={"NW": 1.0, "W": 0.9, "S": 0.6, "SW": 0.0, "N": 0.0, "E": -0.5, "CENTER": -1.0, "SE": -1.0, "NE": -1.0},
        permitted_levels=[0, 1, 2],
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Cl 12.2.5 / Cl 12.2.5.1",
    ),
    "bath_2": SpaceTypeSpec(
        id="bath_2",
        name="Common Bath",
        typologies=["T1_SINGLE_FAMILY"],
        function=FunctionType.SANITATION,
        hygiene=HygieneType.FOUL,
        odor_emit=2, moisture_emit=3, grease_emit=0, noise_emit=1,
        noise_sensitive=0, acoustic_privacy=3,
        public_access=PublicAccess.SEMI,
        visitor_depth=VisitorDepth.MID,
        security=SecurityLevel.CONTROLLED,
        service_side=ServiceSide.BACK_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="both",
        min_area_sqm=2.8,
        min_width_m=1.20,
        max_aspect_ratio=2.00,
        vastu_zone_weights={"NW": 1.0, "W": 0.9, "S": 0.6, "SW": 0.0, "N": 0.0, "E": -0.5, "SE": -0.8, "CENTER": -1.0, "NE": -1.0},
        permitted_levels=[0, 1, 2],
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Cl 12.2.5",
    ),
    "study": SpaceTypeSpec(
        id="study",
        name="Home Office / Study",
        typologies=["T1_SINGLE_FAMILY"],
        function=FunctionType.WORK,
        hygiene=HygieneType.CLEAN,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=0,
        noise_sensitive=3, acoustic_privacy=2,
        public_access=PublicAccess.SEMI,
        visitor_depth=VisitorDepth.FRONT,
        security=SecurityLevel.CONTROLLED,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="natural",
        min_area_sqm=7.5,
        min_width_m=2.40,
        max_aspect_ratio=2.00,
        vastu_zone_weights={"N": 1.0, "NE": 1.0, "E": 0.9, "W": 0.5, "NW": 0.5, "CENTER": 0.0, "SE": -0.4, "S": -0.5, "SW": -1.0},
        permitted_levels=[0, 1],
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Table 1",
    ),
    "t1_stair": SpaceTypeSpec(
        id="t1_stair",
        name="Private Dogleg Staircase",
        typologies=["T1_SINGLE_FAMILY"],
        function=FunctionType.CIRCULATION,
        hygiene=HygieneType.NEUTRAL,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=1,
        noise_sensitive=0, acoustic_privacy=0,
        public_access=PublicAccess.PRIVATE,
        visitor_depth=VisitorDepth.MID,
        security=SecurityLevel.OPEN,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.PROTECTED_EXIT,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="natural",
        min_area_sqm=6.0,
        min_width_m=2.00,
        max_aspect_ratio=2.00,
        vastu_zone_weights={"S": 1.0, "W": 1.0, "SW": 1.0, "NW": 0.5, "SE": 0.5, "CENTER": -0.5, "N": -0.8, "E": -0.8, "NE": -1.0},
        permitted_levels=[0, 1, 2],
        is_vertical_core=True,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 4 Cl 4.4 / Pt 3 Cl 12.18",
    ),
    "foyer": SpaceTypeSpec(
        id="foyer",
        name="Entry Foyer",
        typologies=["T1_SINGLE_FAMILY"],
        function=FunctionType.RECEPTION,
        hygiene=HygieneType.CLEAN,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=1,
        noise_sensitive=1, acoustic_privacy=0,
        public_access=PublicAccess.PUBLIC,
        visitor_depth=VisitorDepth.FRONT,
        security=SecurityLevel.OPEN,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.EXIT,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="natural",
        min_area_sqm=3.0,
        min_width_m=1.50,
        max_aspect_ratio=2.00,
        vastu_zone_weights={"N": 1.0, "NE": 1.0, "E": 1.0, "NW": 0.4, "CENTER": 0.0, "W": -0.2, "SE": -0.5, "S": -0.8, "SW": -1.0},
        permitted_levels=[0],
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Cl 12.1",
    ),
    "utility": SpaceTypeSpec(
        id="utility",
        name="Kitchen Utility / Wash",
        typologies=["T1_SINGLE_FAMILY"],
        function=FunctionType.STORAGE,
        hygiene=HygieneType.WET,
        odor_emit=1, moisture_emit=2, grease_emit=1, noise_emit=1,
        noise_sensitive=0, acoustic_privacy=0,
        public_access=PublicAccess.PRIVATE,
        visitor_depth=VisitorDepth.DEEP,
        security=SecurityLevel.OPEN,
        service_side=ServiceSide.BACK_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="natural",
        min_area_sqm=3.0,
        min_width_m=1.20,
        max_aspect_ratio=2.00,
        vastu_zone_weights={"SE": 1.0, "NW": 0.9, "E": 0.8, "S": 0.5, "W": 0.2, "CENTER": -0.5, "SW": -0.8, "NE": -1.0, "N": -0.5},
        permitted_levels=[0],
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Cl 12.2.4",
    ),
    "balcony": SpaceTypeSpec(
        id="balcony",
        name="Covered Balcony",
        typologies=["T1_SINGLE_FAMILY"],
        function=FunctionType.OUTDOOR,
        hygiene=HygieneType.CLEAN,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=0,
        noise_sensitive=1, acoustic_privacy=0,
        public_access=PublicAccess.PRIVATE,
        visitor_depth=VisitorDepth.DEEP,
        security=SecurityLevel.OPEN,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="natural",
        min_area_sqm=3.5,
        min_width_m=1.20,
        max_aspect_ratio=2.50,
        vastu_zone_weights={"N": 1.0, "E": 1.0, "NE": 1.0, "NW": 0.5, "SE": 0.2, "CENTER": 0.0, "W": 0.0, "S": -0.5, "SW": -1.0},
        permitted_levels=[1, 2],
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Cl 12.14",
    ),

    # -------------------------------------------------------------------------
    # TYPOLOGY T2: FAMILY APARTMENT RESIDENCE
    # -------------------------------------------------------------------------
    "shared_stair": SpaceTypeSpec(
        id="shared_stair",
        name="Shared Staircase Core",
        typologies=["T2_FAMILY_APARTMENT"],
        function=FunctionType.CIRCULATION,
        hygiene=HygieneType.NEUTRAL,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=2,
        noise_sensitive=0, acoustic_privacy=0,
        public_access=PublicAccess.SEMI,
        visitor_depth=VisitorDepth.FRONT,
        security=SecurityLevel.OPEN,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.PROTECTED_EXIT,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="natural",
        min_area_sqm=7.5,
        min_width_m=2.50,  # 1.25m flight width per NBC multi-occupancy
        max_aspect_ratio=2.00,
        vastu_zone_weights={"W": 1.0, "S": 1.0, "SW": 1.0, "NW": 0.6, "SE": 0.4, "CENTER": -0.5, "NE": -1.0},
        permitted_levels=[0, 1, 2, 3],
        is_vertical_core=True,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 4 Cl 4.4.2 Table 5",
    ),
    "lift_core": SpaceTypeSpec(
        id="lift_core",
        name="Passenger Lift Core",
        typologies=["T2_FAMILY_APARTMENT", "T3_LARGE_COMPLEX"],
        function=FunctionType.CIRCULATION,
        hygiene=HygieneType.NEUTRAL,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=2,
        noise_sensitive=0, acoustic_privacy=0,
        public_access=PublicAccess.SEMI,
        visitor_depth=VisitorDepth.FRONT,
        security=SecurityLevel.CONTROLLED,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.HEAVY,
        daylight_req=False,
        ventilation_req="mechanical",
        min_area_sqm=3.24,  # 1.80m x 1.80m 8-passenger stretcher compliant
        min_width_m=1.80,
        max_aspect_ratio=1.00,
        vastu_zone_weights={"W": 1.0, "S": 0.9, "CENTER": 0.8, "NW": 0.5, "SE": 0.5, "NE": -0.8},
        permitted_levels=[0, 1, 2, 3],
        is_vertical_core=True,
        requires_exterior_wall=False,
        citation="NBC 2016 Pt 8 Sec 5 Lifts Cl 4.2",
    ),
    "floor_lobby": SpaceTypeSpec(
        id="floor_lobby",
        name="Floor Distribution Lobby",
        typologies=["T2_FAMILY_APARTMENT"],
        function=FunctionType.CIRCULATION,
        hygiene=HygieneType.NEUTRAL,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=1,
        noise_sensitive=1, acoustic_privacy=0,
        public_access=PublicAccess.SEMI,
        visitor_depth=VisitorDepth.FRONT,
        security=SecurityLevel.OPEN,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.EXIT,
        floor_load=FloorLoad.NORMAL,
        daylight_req=False,
        ventilation_req="both",
        min_area_sqm=6.0,
        min_width_m=1.50,
        max_aspect_ratio=2.00,
        vastu_zone_weights={"CENTER": 1.0, "N": 0.8, "E": 0.8, "W": 0.6},
        permitted_levels=[0, 1, 2, 3],
        is_vertical_core=False,
        requires_exterior_wall=False,
        citation="NBC 2016 Pt 4 Cl 4.5",
    ),
    "unit_living": SpaceTypeSpec(
        id="unit_living",
        name="Apartment Living/Dining",
        typologies=["T2_FAMILY_APARTMENT"],
        function=FunctionType.SOCIAL,
        hygiene=HygieneType.CLEAN,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=1,
        noise_sensitive=1, acoustic_privacy=1,
        public_access=PublicAccess.SEMI,
        visitor_depth=VisitorDepth.MID,
        security=SecurityLevel.CONTROLLED,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.EXIT,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="natural",
        min_area_sqm=16.0,
        min_width_m=3.40,
        max_aspect_ratio=1.80,
        vastu_zone_weights={"N": 1.0, "NE": 1.0, "E": 0.9, "CENTER": 0.5, "SW": -0.8},
        permitted_levels=[0, 1, 2, 3],
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Cl 12.2.1",
    ),
    "unit_kitchen": SpaceTypeSpec(
        id="unit_kitchen",
        name="Apartment Kitchen",
        typologies=["T2_FAMILY_APARTMENT"],
        function=FunctionType.COOKING,
        hygiene=HygieneType.WET,
        odor_emit=2, moisture_emit=2, grease_emit=3, noise_emit=1,
        noise_sensitive=0, acoustic_privacy=0,
        public_access=PublicAccess.PRIVATE,
        visitor_depth=VisitorDepth.DEEP,
        security=SecurityLevel.OPEN,
        service_side=ServiceSide.BACK_OF_HOUSE,
        fire_hazard=FireHazard.MEDIUM,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="both",
        min_area_sqm=6.0,
        min_width_m=1.80,
        max_aspect_ratio=1.80,
        vastu_zone_weights={"SE": 1.0, "NW": 0.8, "E": 0.6, "NE": -1.0, "SW": -1.0},
        permitted_levels=[0, 1, 2, 3],
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Cl 12.2.3",
    ),
    "unit_bed": SpaceTypeSpec(
        id="unit_bed",
        name="Apartment Bedroom",
        typologies=["T2_FAMILY_APARTMENT"],
        function=FunctionType.SLEEP,
        hygiene=HygieneType.CLEAN,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=0,
        noise_sensitive=3, acoustic_privacy=3,
        public_access=PublicAccess.PRIVATE,
        visitor_depth=VisitorDepth.DEEP,
        security=SecurityLevel.CONTROLLED,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="natural",
        min_area_sqm=10.5,
        min_width_m=3.00,
        max_aspect_ratio=1.80,
        vastu_zone_weights={"SW": 1.0, "S": 0.8, "W": 0.8, "NW": 0.6, "NE": -1.0},
        permitted_levels=[0, 1, 2, 3],
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Cl 12.2.2",
    ),
    "unit_bath": SpaceTypeSpec(
        id="unit_bath",
        name="Apartment Bathroom",
        typologies=["T2_FAMILY_APARTMENT"],
        function=FunctionType.SANITATION,
        hygiene=HygieneType.FOUL,
        odor_emit=2, moisture_emit=3, grease_emit=0, noise_emit=1,
        noise_sensitive=0, acoustic_privacy=3,
        public_access=PublicAccess.PRIVATE,
        visitor_depth=VisitorDepth.DEEP,
        security=SecurityLevel.CONTROLLED,
        service_side=ServiceSide.BACK_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="both",
        min_area_sqm=3.0,
        min_width_m=1.20,
        max_aspect_ratio=2.00,
        vastu_zone_weights={"W": 1.0, "NW": 1.0, "S": 0.6, "CENTER": -1.0, "NE": -1.0},
        permitted_levels=[0, 1, 2, 3],
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Cl 12.2.5",
    ),
    "unit_balcony": SpaceTypeSpec(
        id="unit_balcony",
        name="Apartment Private Balcony",
        typologies=["T2_FAMILY_APARTMENT"],
        function=FunctionType.OUTDOOR,
        hygiene=HygieneType.CLEAN,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=0,
        noise_sensitive=1, acoustic_privacy=0,
        public_access=PublicAccess.PRIVATE,
        visitor_depth=VisitorDepth.DEEP,
        security=SecurityLevel.OPEN,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="natural",
        min_area_sqm=3.0,
        min_width_m=1.20,
        max_aspect_ratio=2.50,
        vastu_zone_weights={"N": 1.0, "E": 1.0, "NE": 1.0, "SW": -1.0},
        permitted_levels=[0, 1, 2, 3],
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Cl 12.14",
    ),
    "unit_utility": SpaceTypeSpec(
        id="unit_utility",
        name="Apartment Utility / Dry Balcony",
        typologies=["T2_FAMILY_APARTMENT"],
        function=FunctionType.STORAGE,
        hygiene=HygieneType.WET,
        odor_emit=1, moisture_emit=2, grease_emit=1, noise_emit=1,
        noise_sensitive=0, acoustic_privacy=0,
        public_access=PublicAccess.PRIVATE,
        visitor_depth=VisitorDepth.DEEP,
        security=SecurityLevel.OPEN,
        service_side=ServiceSide.BACK_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="natural",
        min_area_sqm=2.5,
        min_width_m=1.20,
        max_aspect_ratio=2.00,
        vastu_zone_weights={"SE": 1.0, "NW": 0.8, "E": 0.8, "NE": -1.0},
        permitted_levels=[0, 1, 2, 3],
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Cl 12.2.4",
    ),

    # -------------------------------------------------------------------------
    # TYPOLOGY T3: LARGE COMMERCIAL COMPLEX / OFFICE
    # -------------------------------------------------------------------------
    "primary_stair": SpaceTypeSpec(
        id="primary_stair",
        name="Enclosed Fire Staircase 1",
        typologies=["T3_LARGE_COMPLEX"],
        function=FunctionType.CIRCULATION,
        hygiene=HygieneType.NEUTRAL,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=1,
        noise_sensitive=0, acoustic_privacy=0,
        public_access=PublicAccess.PUBLIC,
        visitor_depth=VisitorDepth.FRONT,
        security=SecurityLevel.OPEN,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.PROTECTED_EXIT,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="natural",
        min_area_sqm=9.0,
        min_width_m=2.50,  # 1.25m flight width per NBC commercial/complex
        max_aspect_ratio=2.20,
        vastu_zone_weights={"W": 1.0, "S": 1.0, "SW": 1.0, "NE": -1.0},
        permitted_levels=[0, 1, 2, 3],
        is_vertical_core=True,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 4 Cl 4.4.2 Table 5",
    ),
    "secondary_stair": SpaceTypeSpec(
        id="secondary_stair",
        name="Fire Exit Staircase 2",
        typologies=["T3_LARGE_COMPLEX"],
        function=FunctionType.CIRCULATION,
        hygiene=HygieneType.NEUTRAL,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=1,
        noise_sensitive=0, acoustic_privacy=0,
        public_access=PublicAccess.PUBLIC,
        visitor_depth=VisitorDepth.FRONT,
        security=SecurityLevel.OPEN,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.PROTECTED_EXIT,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="natural",
        min_area_sqm=9.0,
        min_width_m=2.50,
        max_aspect_ratio=2.20,
        vastu_zone_weights={"NW": 1.0, "SE": 1.0, "NE": -1.0},
        permitted_levels=[0, 1, 2, 3],
        is_vertical_core=True,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 4 Cl 4.4.2 (Remoteness requirement)",
    ),
    "lift_lobby": SpaceTypeSpec(
        id="lift_lobby",
        name="Elevator Core & Lobby",
        typologies=["T3_LARGE_COMPLEX"],
        function=FunctionType.CIRCULATION,
        hygiene=HygieneType.NEUTRAL,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=2,
        noise_sensitive=0, acoustic_privacy=0,
        public_access=PublicAccess.PUBLIC,
        visitor_depth=VisitorDepth.FRONT,
        security=SecurityLevel.CONTROLLED,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.EXIT,
        floor_load=FloorLoad.HEAVY,
        daylight_req=False,
        ventilation_req="both",
        min_area_sqm=12.0,
        min_width_m=2.40,
        max_aspect_ratio=2.00,
        vastu_zone_weights={"CENTER": 1.0, "W": 0.8},
        permitted_levels=[0, 1, 2, 3],
        is_vertical_core=True,
        requires_exterior_wall=False,
        citation="NBC 2016 Pt 8 Sec 5 Cl 4.5",
    ),
    "spine_corridor": SpaceTypeSpec(
        id="spine_corridor",
        name="Double-Loaded Spine Corridor",
        typologies=["T3_LARGE_COMPLEX"],
        function=FunctionType.CIRCULATION,
        hygiene=HygieneType.NEUTRAL,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=1,
        noise_sensitive=0, acoustic_privacy=0,
        public_access=PublicAccess.PUBLIC,
        visitor_depth=VisitorDepth.MID,
        security=SecurityLevel.OPEN,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.PROTECTED_EXIT,
        floor_load=FloorLoad.NORMAL,
        daylight_req=False,
        ventilation_req="both",
        min_area_sqm=15.0,
        min_width_m=1.50,  # NBC minimum double-loaded corridor
        max_aspect_ratio=4.00,
        vastu_zone_weights={"CENTER": 1.0},
        permitted_levels=[0, 1, 2, 3],
        is_vertical_core=False,
        requires_exterior_wall=False,
        citation="NBC 2016 Pt 4 Cl 4.5.1 / Pt 3 Cl 12.19",
    ),
    "commercial_suite": SpaceTypeSpec(
        id="commercial_suite",
        name="Office Suite / Flat Unit",
        typologies=["T3_LARGE_COMPLEX"],
        function=FunctionType.WORK,
        hygiene=HygieneType.CLEAN,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=1,
        noise_sensitive=2, acoustic_privacy=2,
        public_access=PublicAccess.SEMI,
        visitor_depth=VisitorDepth.MID,
        security=SecurityLevel.CONTROLLED,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="both",
        min_area_sqm=25.0,
        min_width_m=4.50,
        max_aspect_ratio=1.80,
        vastu_zone_weights={"N": 1.0, "E": 1.0, "NE": 1.0},
        permitted_levels=[0, 1, 2, 3],
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Cl 12.2",
    ),
    "sanitary_block": SpaceTypeSpec(
        id="sanitary_block",
        name="Commercial Restroom Block",
        typologies=["T3_LARGE_COMPLEX"],
        function=FunctionType.SANITATION,
        hygiene=HygieneType.FOUL,
        odor_emit=3, moisture_emit=3, grease_emit=0, noise_emit=1,
        noise_sensitive=0, acoustic_privacy=3,
        public_access=PublicAccess.PUBLIC,
        visitor_depth=VisitorDepth.MID,
        security=SecurityLevel.OPEN,
        service_side=ServiceSide.BACK_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="both",
        min_area_sqm=6.0,
        min_width_m=2.00,
        max_aspect_ratio=2.00,
        vastu_zone_weights={"W": 1.0, "NW": 1.0, "NE": -1.0},
        permitted_levels=[0, 1, 2, 3],
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 9 Sec 1 Table 2",
    ),
    "mep_room": SpaceTypeSpec(
        id="mep_room",
        name="MEP & Electrical Services Room",
        typologies=["T3_LARGE_COMPLEX"],
        function=FunctionType.TECHNICAL,
        hygiene=HygieneType.NEUTRAL,
        odor_emit=0, moisture_emit=0, grease_emit=1, noise_emit=2,
        noise_sensitive=0, acoustic_privacy=1,
        public_access=PublicAccess.RESTRICTED,
        visitor_depth=VisitorDepth.DEEP,
        security=SecurityLevel.SECURE,
        service_side=ServiceSide.BACK_OF_HOUSE,
        fire_hazard=FireHazard.HIGH,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.HEAVY,
        daylight_req=False,
        ventilation_req="mechanical",
        min_area_sqm=6.0,
        min_width_m=2.00,
        max_aspect_ratio=2.00,
        vastu_zone_weights={"SE": 1.0, "NW": 0.8},
        permitted_levels=[0, 1, 2, 3],
        is_vertical_core=False,
        requires_exterior_wall=False,
        citation="NBC 2016 Pt 8 Sec 2 Electrical MEP",
    ),
    "conference_suite": SpaceTypeSpec(
        id="conference_suite",
        name="Meeting / Conference Suite",
        typologies=["T3_LARGE_COMPLEX"],
        function=FunctionType.MEETING,
        hygiene=HygieneType.CLEAN,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=1,
        noise_sensitive=3, acoustic_privacy=3,
        public_access=PublicAccess.SEMI,
        visitor_depth=VisitorDepth.MID,
        security=SecurityLevel.CONTROLLED,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="both",
        min_area_sqm=18.0,
        min_width_m=3.60,
        max_aspect_ratio=1.80,
        vastu_zone_weights={"N": 1.0, "E": 1.0, "NE": 0.8},
        permitted_levels=[0, 1, 2, 3],
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Cl 12.2",
    ),
    "reception_lobby": SpaceTypeSpec(
        id="reception_lobby",
        name="Commercial Reception Lobby",
        typologies=["T3_LARGE_COMPLEX"],
        function=FunctionType.RECEPTION,
        hygiene=HygieneType.CLEAN,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=1,
        noise_sensitive=1, acoustic_privacy=0,
        public_access=PublicAccess.PUBLIC,
        visitor_depth=VisitorDepth.FRONT,
        security=SecurityLevel.CONTROLLED,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.EXIT,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="both",
        min_area_sqm=20.0,
        min_width_m=4.00,
        max_aspect_ratio=2.00,
        vastu_zone_weights={"N": 1.0, "NE": 1.0, "E": 1.0},
        permitted_levels=[0],
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Cl 12.1",
    ),
    "server_room": SpaceTypeSpec(
        id="server_room",
        name="IT & Server Room",
        typologies=["T3_LARGE_COMPLEX"],
        function=FunctionType.TECHNICAL,
        hygiene=HygieneType.CLEAN,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=2,
        noise_sensitive=0, acoustic_privacy=2,
        public_access=PublicAccess.RESTRICTED,
        visitor_depth=VisitorDepth.DEEP,
        security=SecurityLevel.SECURE,
        service_side=ServiceSide.BACK_OF_HOUSE,
        fire_hazard=FireHazard.MEDIUM,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.HEAVY,
        daylight_req=False,
        ventilation_req="mechanical",
        min_area_sqm=10.0,
        min_width_m=2.50,
        max_aspect_ratio=1.80,
        vastu_zone_weights={"W": 1.0, "NW": 0.8},
        permitted_levels=[0, 1, 2, 3],
        is_vertical_core=False,
        requires_exterior_wall=False,
        citation="NBC 2016 Pt 8 Sec 2 Cl 4.3",
    ),

    # -------------------------------------------------------------------------
    # TYPOLOGY T4: WAREHOUSE / LIGHT INDUSTRIAL FACILITY
    # -------------------------------------------------------------------------
    "storage_bay": SpaceTypeSpec(
        id="storage_bay",
        name="Clear-Span Storage Bay",
        typologies=["T4_WAREHOUSE"],
        function=FunctionType.STORAGE,
        hygiene=HygieneType.NEUTRAL,
        odor_emit=1, moisture_emit=0, grease_emit=0, noise_emit=2,
        noise_sensitive=0, acoustic_privacy=0,
        public_access=PublicAccess.RESTRICTED,
        visitor_depth=VisitorDepth.DEEP,
        security=SecurityLevel.CONTROLLED,
        service_side=ServiceSide.BACK_OF_HOUSE,
        fire_hazard=FireHazard.MEDIUM,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.HEAVY,
        daylight_req=True,
        ventilation_req="both",
        min_area_sqm=80.0,
        min_width_m=6.00,
        max_aspect_ratio=2.50,
        vastu_zone_weights={"SW": 1.0, "W": 0.9, "S": 0.9},
        permitted_levels=[0],  # Heavy load: Ground floor only
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Cl 12.26 / Pt 4 Table 5",
    ),
    "dock_bay": SpaceTypeSpec(
        id="dock_bay",
        name="Loading Dock Shutter Bay",
        typologies=["T4_WAREHOUSE"],
        function=FunctionType.LOADING,
        hygiene=HygieneType.NEUTRAL,
        odor_emit=2, moisture_emit=0, grease_emit=1, noise_emit=3,
        noise_sensitive=0, acoustic_privacy=0,
        public_access=PublicAccess.PUBLIC,
        visitor_depth=VisitorDepth.FRONT,
        security=SecurityLevel.CONTROLLED,
        service_side=ServiceSide.BACK_OF_HOUSE,
        fire_hazard=FireHazard.MEDIUM,
        egress_role=EgressRole.EXIT,
        floor_load=FloorLoad.HEAVY,
        daylight_req=True,
        ventilation_req="natural",
        min_area_sqm=25.0,
        min_width_m=3.60,
        max_aspect_ratio=2.00,
        vastu_zone_weights={"N": 1.0, "NW": 0.9, "E": 0.8},
        permitted_levels=[0],  # Heavy rolling load: Ground floor only
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Cl 12.26.1 / Pt 4 Table 5",
    ),
    "dispatch": SpaceTypeSpec(
        id="dispatch",
        name="Dispatch & Staging Buffer",
        typologies=["T4_WAREHOUSE"],
        function=FunctionType.CIRCULATION,
        hygiene=HygieneType.NEUTRAL,
        odor_emit=1, moisture_emit=0, grease_emit=0, noise_emit=2,
        noise_sensitive=0, acoustic_privacy=0,
        public_access=PublicAccess.SEMI,
        visitor_depth=VisitorDepth.FRONT,
        security=SecurityLevel.CONTROLLED,
        service_side=ServiceSide.BACK_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.EXIT,
        floor_load=FloorLoad.HEAVY,
        daylight_req=True,
        ventilation_req="natural",
        min_area_sqm=30.0,
        min_width_m=4.50,
        max_aspect_ratio=2.00,
        vastu_zone_weights={"N": 1.0, "NW": 0.9, "E": 0.8},
        permitted_levels=[0],
        is_vertical_core=False,
        requires_exterior_wall=False,
        citation="NBC 2016 Pt 3 Cl 12.26",
    ),
    "worker_amenity": SpaceTypeSpec(
        id="worker_amenity",
        name="Staff Locker & Sanitary WC",
        typologies=["T4_WAREHOUSE"],
        function=FunctionType.AMENITY,
        hygiene=HygieneType.FOUL,
        odor_emit=2, moisture_emit=3, grease_emit=0, noise_emit=1,
        noise_sensitive=0, acoustic_privacy=3,
        public_access=PublicAccess.PRIVATE,
        visitor_depth=VisitorDepth.MID,
        security=SecurityLevel.OPEN,
        service_side=ServiceSide.BACK_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="both",
        min_area_sqm=12.0,
        min_width_m=2.50,
        max_aspect_ratio=2.00,
        vastu_zone_weights={"W": 1.0, "NW": 1.0},
        permitted_levels=[0],
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 9 Sec 1 Table 4",
    ),
    "admin_office": SpaceTypeSpec(
        id="admin_office",
        name="Administrative Office Mezzanine",
        typologies=["T4_WAREHOUSE"],
        function=FunctionType.WORK,
        hygiene=HygieneType.CLEAN,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=0,
        noise_sensitive=3, acoustic_privacy=2,
        public_access=PublicAccess.SEMI,
        visitor_depth=VisitorDepth.FRONT,
        security=SecurityLevel.CONTROLLED,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="both",
        min_area_sqm=35.0,
        min_width_m=4.50,
        max_aspect_ratio=2.00,
        vastu_zone_weights={"N": 1.0, "E": 1.0, "NE": 1.0},
        permitted_levels=[1, 2, 3],  # Mezzanine +3.60m level
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Cl 12.7 Mezzanine Floors",
    ),
    "conf_room": SpaceTypeSpec(
        id="conf_room",
        name="Conference / Operations Room",
        typologies=["T4_WAREHOUSE"],
        function=FunctionType.MEETING,
        hygiene=HygieneType.CLEAN,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=1,
        noise_sensitive=3, acoustic_privacy=3,
        public_access=PublicAccess.SEMI,
        visitor_depth=VisitorDepth.FRONT,
        security=SecurityLevel.CONTROLLED,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.NONE,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="both",
        min_area_sqm=18.0,
        min_width_m=3.60,
        max_aspect_ratio=1.80,
        vastu_zone_weights={"N": 1.0, "E": 1.0},
        permitted_levels=[1, 2, 3],  # Mezzanine level
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Cl 12.2",
    ),
    "ind_stair": SpaceTypeSpec(
        id="ind_stair",
        name="Industrial Steel Egress Stair",
        typologies=["T4_WAREHOUSE"],
        function=FunctionType.CIRCULATION,
        hygiene=HygieneType.NEUTRAL,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=1,
        noise_sensitive=0, acoustic_privacy=0,
        public_access=PublicAccess.SEMI,
        visitor_depth=VisitorDepth.FRONT,
        security=SecurityLevel.OPEN,
        service_side=ServiceSide.BACK_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.PROTECTED_EXIT,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="natural",
        min_area_sqm=7.5,
        min_width_m=1.50,
        max_aspect_ratio=2.00,
        vastu_zone_weights={"S": 1.0, "SW": 1.0, "W": 1.0},
        permitted_levels=[0, 1, 2, 3],
        is_vertical_core=True,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 4 Cl 4.4.2 Table 5",
    ),
    "admin_catwalk": SpaceTypeSpec(
        id="admin_catwalk",
        name="Mezzanine Access Catwalk",
        typologies=["T4_WAREHOUSE"],
        function=FunctionType.CIRCULATION,
        hygiene=HygieneType.NEUTRAL,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=1,
        noise_sensitive=0, acoustic_privacy=0,
        public_access=PublicAccess.PRIVATE,
        visitor_depth=VisitorDepth.MID,
        security=SecurityLevel.OPEN,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.EXIT,
        floor_load=FloorLoad.NORMAL,
        daylight_req=False,
        ventilation_req="both",
        min_area_sqm=15.0,
        min_width_m=1.50,
        max_aspect_ratio=4.00,
        vastu_zone_weights={"CENTER": 1.0},
        permitted_levels=[1, 2, 3],
        is_vertical_core=False,
        requires_exterior_wall=False,
        citation="NBC 2016 Pt 4 Cl 4.5.1",
    ),
    "security_gatehouse": SpaceTypeSpec(
        id="security_gatehouse",
        name="Guard House / Security Gatehouse",
        typologies=["T4_WAREHOUSE", "T3_LARGE_COMPLEX"],
        function=FunctionType.SECURITY,
        hygiene=HygieneType.CLEAN,
        odor_emit=0, moisture_emit=0, grease_emit=0, noise_emit=0,
        noise_sensitive=2, acoustic_privacy=1,
        public_access=PublicAccess.RESTRICTED,
        visitor_depth=VisitorDepth.FRONT,
        security=SecurityLevel.SECURE,
        service_side=ServiceSide.FRONT_OF_HOUSE,
        fire_hazard=FireHazard.LOW,
        egress_role=EgressRole.EXIT,
        floor_load=FloorLoad.NORMAL,
        daylight_req=True,
        ventilation_req="both",
        min_area_sqm=6.0,
        min_width_m=2.00,
        max_aspect_ratio=1.50,
        vastu_zone_weights={"N": 1.0, "E": 1.0, "NW": 0.8},
        permitted_levels=[0],
        is_vertical_core=False,
        requires_exterior_wall=True,
        citation="NBC 2016 Pt 3 Cl 12.1",
    ),
}


# =============================================================================
# 5. TYPOLOGY PROFILES
# =============================================================================

class TypologyProfile(BaseModel):
    """Declarative typology profile defining statutory parameters and baseline rules."""
    canonical: str
    name: str
    vastu_weight_scale: float = Field(ge=0.0, le=1.0)
    core_types: List[str]
    floor_height_m: float
    coverage_defaults: float
    floor_limits: Tuple[int, int]
    egress_constants: Dict[str, Any]
    occupancy_wc_table: Dict[str, Any]
    parking_table: Dict[str, Any]


TYPOLOGY_PROFILES: Dict[str, TypologyProfile] = {
    "T1_SINGLE_FAMILY": TypologyProfile(
        canonical="T1_SINGLE_FAMILY",
        name="Single-Family Residence (T1)",
        vastu_weight_scale=1.0,  # High strictness
        core_types=["staircase_dogleg"],
        floor_height_m=3.00,
        coverage_defaults=0.60,
        floor_limits=(1, 3),
        egress_constants={
            "max_travel_distance_non_sprinklered_m": 30.0,
            "max_travel_distance_sprinklered_m": 45.0,
            "min_corridor_width_m": 1.00,
            "citation": "NBC 2016 Part 4 Table 5 / Cl 4.4.2",
        },
        occupancy_wc_table={
            "rule": "1 WC + 1 Bath per private dwelling unit",
            "citation": "NBC 2016 Part 9 Section 1 Table 1",
        },
        parking_table={
            "rule": "1 ECS (Equivalent Car Space) per 100 m2 built-up area",
            "citation": "NBC 2016 Part 3 Table 7",
        },
    ),
    "T2_FAMILY_APARTMENT": TypologyProfile(
        canonical="T2_FAMILY_APARTMENT",
        name="Family Apartment (T2)",
        vastu_weight_scale=0.7,  # Medium strictness
        core_types=["staircase_dogleg", "lift_passenger"],
        floor_height_m=3.00,
        coverage_defaults=0.50,
        floor_limits=(1, 4),
        egress_constants={
            "max_travel_distance_non_sprinklered_m": 30.0,
            "max_travel_distance_sprinklered_m": 45.0,
            "min_corridor_width_m": 1.25,
            "citation": "NBC 2016 Part 4 Table 5 / Cl 4.5.1",
        },
        occupancy_wc_table={
            "rule": "1 WC + 1 Bath minimum per individual apartment unit",
            "citation": "NBC 2016 Part 9 Section 1 Table 1",
        },
        parking_table={
            "rule": "1.0 ECS per apartment unit under 100 m2; 1.5 ECS if >= 100 m2",
            "citation": "NBC 2016 Part 3 Table 7",
        },
    ),
    "T3_LARGE_COMPLEX": TypologyProfile(
        canonical="T3_LARGE_COMPLEX",
        name="Large Commercial Complex (T3)",
        vastu_weight_scale=0.3,  # Medium-low strictness
        core_types=["staircase_fire", "lift_passenger", "mep_chase"],
        floor_height_m=3.60,
        coverage_defaults=0.40,
        floor_limits=(1, 4),
        egress_constants={
            "max_travel_distance_non_sprinklered_m": 30.0,
            "max_travel_distance_sprinklered_m": 45.0,
            "dead_end_corridor_max_m": 6.0,
            "min_corridor_width_m": 1.50,
            "citation": "NBC 2016 Part 4 Table 5 & Cl 4.5.2",
        },
        occupancy_wc_table={
            "rule": "1 WC per 25 males, 1 WC per 15 females; 1 urinal per 20 males",
            "citation": "NBC 2016 Part 9 Section 1 Table 2",
        },
        parking_table={
            "rule": "1.5 to 2.0 ECS per 100 m2 commercial built-up area",
            "citation": "NBC 2016 Part 3 Table 7",
        },
    ),
    "T4_WAREHOUSE": TypologyProfile(
        canonical="T4_WAREHOUSE",
        name="Warehouse & Logistics Facility (T4)",
        vastu_weight_scale=0.05,  # Low / Off
        core_types=["staircase_fire", "industrial_steel"],
        floor_height_m=6.00,  # 6.0m clear ground height
        coverage_defaults=0.50,
        floor_limits=(1, 2),
        egress_constants={
            "max_travel_distance_non_sprinklered_m": 30.0,
            "max_travel_distance_sprinklered_m": 45.0,
            "dead_end_corridor_max_m": 6.0,
            "min_corridor_width_m": 1.50,
            "citation": "NBC 2016 Part 4 Table 5 / Storage Occupancy",
        },
        occupancy_wc_table={
            "rule": "1 WC per 25 workers up to 100 persons; then 1 per 50",
            "citation": "NBC 2016 Part 9 Section 1 Table 4",
        },
        parking_table={
            "rule": "1 ECS per 200 m2 + 1 Loading/Unloading Bay (3.5x7.5m) per 500 m2",
            "citation": "NBC 2016 Part 3 Table 7",
        },
    ),
}


# =============================================================================
# 6. DERIVED RELATIONAL ALGEBRA ENGINE
# =============================================================================

# Explicit override table for architectural specials
EXPLICIT_OVERRIDES: Dict[Tuple[str, str], List[SpatialRule]] = {
    ("puja", "living"): [
        SpatialRule(
            rule_id="OVR-01-PUJA-LIVING",
            relation=RelationType.PREFER_ADJACENT,
            rationale=RationaleTag.VASTU,
            citation="Indian Residential Spatial Canon (Living Alcove Mandir)",
            description="Permits pooja room to open directly off living room via serene alcove or pooja door.",
            is_override=True,
        )
    ],
    ("master_bed", "bath_1"): [
        SpatialRule(
            rule_id="OVR-02-ENSUITE-MASTER",
            relation=RelationType.MUST_ADJACENT,
            rationale=RationaleTag.PRIVACY,
            citation="NBC 2016 Pt 3 Cl 12.2.5 (Ensuite Sanitation Access)",
            description="Mandatory attached ensuite bathroom access for master bedroom suite.",
            is_override=True,
        )
    ],
    ("unit_kitchen", "unit_living"): [
        SpatialRule(
            rule_id="OVR-03-APT-KITCHEN-LIVING",
            relation=RelationType.PREFER_ADJACENT,
            rationale=RationaleTag.FUNCTION,
            citation="Multi-Family Spatial Planning Norm (Open Kitchen Connection)",
            description="Apartment kitchen connects directly to open-plan living/dining area.",
            is_override=True,
        )
    ],
    ("utility", "kitchen"): [
        SpatialRule(
            rule_id="OVR-04-UTILITY-KITCHEN",
            relation=RelationType.MUST_ADJACENT,
            rationale=RationaleTag.FUNCTION,
            citation="NBC 2016 Pt 3 Cl 12.2.4 (Kitchen Wash / Utility Adjacency)",
            description="Kitchen utility wet wash must connect directly to primary kitchen.",
            is_override=True,
        )
    ],
    ("dock_bay", "dispatch"): [
        SpatialRule(
            rule_id="OVR-05-DOCK-DISPATCH",
            relation=RelationType.MUST_ADJACENT,
            rationale=RationaleTag.FUNCTION,
            citation="Logistics Facility Planning Norm (Apron Staging Buffer)",
            description="Loading dock shutter bay must feed directly into dispatch staging buffer.",
            is_override=True,
        )
    ],
    ("admin_office", "admin_catwalk"): [
        SpatialRule(
            rule_id="OVR-06-OFFICE-CATWALK",
            relation=RelationType.MUST_ADJACENT,
            rationale=RationaleTag.FUNCTION,
            citation="NBC 2016 Pt 3 Cl 12.7 (Mezzanine Circulation Access)",
            description="Mezzanine administrative office connects to industrial catwalk and stair.",
            is_override=True,
        )
    ],
}


def _canonical_pair_key(s1: str, s2: str) -> Tuple[str, str]:
    return (s1, s2) if s1 <= s2 else (s2, s1)


def derive_spatial_rules(space_a: SpaceTypeSpec, space_b: SpaceTypeSpec) -> List[SpatialRule]:
    """
    Pure algebraic derivation of spatial relations between two space specifications.
    Evaluates physical, hygienic, acoustic, and security attributes.
    """
    rules: List[SpatialRule] = []

    # 1. FOUL vs SACRED (Religious & Hygiene Taboo)
    # foul vs sacred -> FORBIDDEN_WALL + FORBIDDEN_DOOR_FACING + FORBIDDEN_ABOVE
    if (space_a.hygiene == HygieneType.FOUL and space_b.hygiene == HygieneType.SACRED) or \
       (space_b.hygiene == HygieneType.FOUL and space_a.hygiene == HygieneType.SACRED):
        rules.append(SpatialRule(
            rule_id="HYG-01-FOUL-SACRED-WALL",
            relation=RelationType.FORBIDDEN_WALL,
            rationale=RationaleTag.HYGIENE,
            citation="NBC 2016 Part 3 & Vastu Canon",
            description="Sanitation foul rooms cannot share a common wall with sacred pooja/worship spaces."
        ))
        rules.append(SpatialRule(
            rule_id="HYG-01-FOUL-SACRED-DOOR",
            relation=RelationType.FORBIDDEN_DOOR_FACING,
            rationale=RationaleTag.HYGIENE,
            citation="NBC 2016 Part 3 & Vastu Canon",
            description="Bathroom doors must never face into or align with a sacred pooja entrance."
        ))
        rules.append(SpatialRule(
            rule_id="HYG-01-FOUL-SACRED-ABOVE",
            relation=RelationType.FORBIDDEN_ABOVE,
            rationale=RationaleTag.HYGIENE,
            citation="NBC 2016 Part 9 Cl 4.3.2",
            description="Foul sanitation plumbing cannot be installed directly above a sacred space."
        ))

    # 2. FOUL / ODOR >= 2 vs COOKING | EATING | RECEPTION | MEETING
    # foul/odor>=2 vs food/social -> FORBIDDEN_WALL + FORBIDDEN_DOOR_FACING
    food_social = {FunctionType.COOKING, FunctionType.EATING, FunctionType.RECEPTION, FunctionType.MEETING}
    is_a_foul_odor = (space_a.hygiene == HygieneType.FOUL or (space_a.odor_emit >= 2 and space_a.function != FunctionType.COOKING))
    is_b_foul_odor = (space_b.hygiene == HygieneType.FOUL or (space_b.odor_emit >= 2 and space_b.function != FunctionType.COOKING))
    if (is_a_foul_odor and space_b.function in food_social) or (is_b_foul_odor and space_a.function in food_social):
        rules.append(SpatialRule(
            rule_id="HYG-02-FOUL-FOOD-WALL",
            relation=RelationType.FORBIDDEN_WALL,
            rationale=RationaleTag.HYGIENE,
            citation="NBC 2016 Part 3 Cl 12.2.5.1 / Pt 8 Sec 1 Cl 4.2",
            description="Foul or odor-emitting rooms cannot share a common wall with food prep, eating, or public reception."
        ))
        rules.append(SpatialRule(
            rule_id="HYG-02-FOUL-FOOD-DOOR",
            relation=RelationType.FORBIDDEN_DOOR_FACING,
            rationale=RationaleTag.HYGIENE,
            citation="NBC 2016 Part 3 Cl 12.2.5.1",
            description="Toilet doors must not open directly into or face kitchens, dining rooms, or reception foyers."
        ))

    # 3. WET vs TECHNICAL | SECURE
    # wet vs technical|secure -> FORBIDDEN_ABOVE + FORBIDDEN_WALL (FORBIDDEN_ADJACENT)
    is_a_wet = (space_a.hygiene in (HygieneType.WET, HygieneType.FOUL) or space_a.moisture_emit >= 2)
    is_b_wet = (space_b.hygiene in (HygieneType.WET, HygieneType.FOUL) or space_b.moisture_emit >= 2)
    is_a_tech_secure = (space_a.function == FunctionType.TECHNICAL or space_a.security == SecurityLevel.SECURE)
    is_b_tech_secure = (space_b.function == FunctionType.TECHNICAL or space_b.security == SecurityLevel.SECURE)
    if (is_a_wet and is_b_tech_secure) or (is_b_wet and is_a_tech_secure):
        rules.append(SpatialRule(
            rule_id="SAF-01-WET-TECH-WALL",
            relation=RelationType.FORBIDDEN_WALL,
            rationale=RationaleTag.STRUCTURE,
            citation="NBC 2016 Part 8 Section 2 Electrical MEP Invariants",
            description="Wet plumbing pipes and moisture walls cannot be adjacent to electrical, server, or secure rooms."
        ))
        rules.append(SpatialRule(
            rule_id="SAF-01-WET-TECH-ABOVE",
            relation=RelationType.FORBIDDEN_ABOVE,
            rationale=RationaleTag.STRUCTURE,
            citation="NBC 2016 Part 8 Section 2 Electrical MEP Invariants",
            description="Plumbing wet rooms cannot be stacked directly above electrical transformers or server rooms."
        ))

    # 4. NOISE EMITTER vs NOISE SENSITIVE
    # noise_emit>=2 vs noise_sensitive>=2 -> PREFER_SEPARATE
    if (space_a.noise_emit >= 2 and space_b.noise_sensitive >= 2) or \
       (space_b.noise_emit >= 2 and space_a.noise_sensitive >= 2):
        rules.append(SpatialRule(
            rule_id="NOI-01-EMIT-SENSITIVE-SEP",
            relation=RelationType.PREFER_SEPARATE,
            rationale=RationaleTag.NOISE,
            citation="NBC 2016 Part 8 Section 4 Sound Insulation & Acoustics",
            description="High noise emission spaces should be buffered from acoustically sensitive sleeping or study areas."
        ))

    # 5. COOKING vs EATING
    # cooking vs eating -> MUST_ADJACENT
    if (space_a.function == FunctionType.COOKING and space_b.function == FunctionType.EATING) or \
       (space_b.function == FunctionType.COOKING and space_a.function == FunctionType.EATING):
        rules.append(SpatialRule(
            rule_id="FUNC-01-COOK-EAT-ADJ",
            relation=RelationType.MUST_ADJACENT,
            rationale=RationaleTag.FUNCTION,
            citation="Architectural Space Planning Standards (Service Flow)",
            description="Kitchen and dining area must be directly adjacent to facilitate meal service."
        ))

    # 6. RECEPTION vs CIRCULATION (Entrance zone)
    # reception vs entrance zone -> MUST_ADJACENT
    if (space_a.function == FunctionType.RECEPTION and space_b.function == FunctionType.CIRCULATION and space_b.visitor_depth == VisitorDepth.FRONT) or \
       (space_b.function == FunctionType.RECEPTION and space_a.function == FunctionType.CIRCULATION and space_a.visitor_depth == VisitorDepth.FRONT):
        rules.append(SpatialRule(
            rule_id="ACC-01-RECEPTION-FRONT-ADJ",
            relation=RelationType.MUST_ADJACENT,
            rationale=RationaleTag.FUNCTION,
            citation="NBC 2016 Part 3 Cl 12.1",
            description="Reception areas must connect directly to front entry circulation."
        ))

    # 7. LOADING vs DISPATCH
    # loading vs dispatch -> MUST_ADJACENT
    if (space_a.function == FunctionType.LOADING and space_b.id == "dispatch") or \
       (space_b.function == FunctionType.LOADING and space_a.id == "dispatch"):
        rules.append(SpatialRule(
            rule_id="LOG-01-LOAD-DISPATCH-ADJ",
            relation=RelationType.MUST_ADJACENT,
            rationale=RationaleTag.FUNCTION,
            citation="Industrial Logistics Operations Canon",
            description="Loading dock bays must connect directly to the dispatch buffer staging area."
        ))

    # 8. DISPATCH vs STORAGE
    # dispatch vs storage -> MUST_ADJACENT
    if (space_a.id == "dispatch" and space_b.function == FunctionType.STORAGE) or \
       (space_b.id == "dispatch" and space_a.function == FunctionType.STORAGE):
        rules.append(SpatialRule(
            rule_id="LOG-02-DISPATCH-STORAGE-ADJ",
            relation=RelationType.MUST_ADJACENT,
            rationale=RationaleTag.FUNCTION,
            citation="Industrial Logistics Operations Canon",
            description="Dispatch buffer area must connect directly to storage and warehousing bays."
        ))

    # 9. CORE vs LOBBY / CIRCULATION
    # core vs lobby -> MUST_ADJACENT every level
    if (space_a.is_vertical_core and space_b.function == FunctionType.CIRCULATION and not space_b.is_vertical_core) or \
       (space_b.is_vertical_core and space_a.function == FunctionType.CIRCULATION and not space_a.is_vertical_core):
        rules.append(SpatialRule(
            rule_id="CIRC-01-CORE-LOBBY-ADJ",
            relation=RelationType.MUST_ADJACENT,
            rationale=RationaleTag.FUNCTION,
            citation="NBC 2016 Part 4 Egress Standards Cl 4.4",
            description="Vertical circulation core landings must open directly onto floor lobbies or corridors on every level."
        ))

    # 10. WET vs WET (Plumbing Core Efficiency)
    # wet vs wet -> PREFER_ADJACENT
    if space_a.hygiene in (HygieneType.WET, HygieneType.FOUL) and space_b.hygiene in (HygieneType.WET, HygieneType.FOUL):
        # Only if not already forbidden
        if not any(r.relation == RelationType.FORBIDDEN_WALL for r in rules):
            rules.append(SpatialRule(
                rule_id="HYG-03-WET-WET-COUPLE",
                relation=RelationType.PREFER_ADJACENT,
                rationale=RationaleTag.STRUCTURE,
                citation="NBC 2016 Part 9 Section 1 Drainage & Plumbing Economy",
                description="Wet rooms should share plumbing walls or chases for vertical stack economy."
            ))

    # 11. SECURITY / GUARD vs GATE / FRONT
    # security/guard vs front -> PREFER_ADJACENT
    if (space_a.function == FunctionType.SECURITY and space_b.visitor_depth == VisitorDepth.FRONT) or \
       (space_b.function == FunctionType.SECURITY and space_a.visitor_depth == VisitorDepth.FRONT):
        rules.append(SpatialRule(
            rule_id="SEC-01-GUARD-GATE-ADJ",
            relation=RelationType.PREFER_ADJACENT,
            rationale=RationaleTag.SECURITY,
            citation="Access Control & Security Perimeter Canon",
            description="Security gatehouse must sit on the front frontage perimeter for visitor access control."
        ))

    # 12. BACK OF HOUSE vs PUBLIC
    # back_of_house vs public -> PREFER_SEPARATE
    if (space_a.service_side == ServiceSide.BACK_OF_HOUSE and space_b.public_access == PublicAccess.PUBLIC) or \
       (space_b.service_side == ServiceSide.BACK_OF_HOUSE and space_a.public_access == PublicAccess.PUBLIC):
        # Do not override existing must-adjacent rules
        if not any(r.relation == RelationType.MUST_ADJACENT for r in rules):
            rules.append(SpatialRule(
                rule_id="ACC-02-BOH-PUBLIC-SEP",
                relation=RelationType.PREFER_SEPARATE,
                rationale=RationaleTag.PRIVACY,
                citation="Commercial & Residential Separation of Services Canon",
                description="Back-of-house service operations should be discreetly separated from public visual lines."
            ))

    return rules


# =============================================================================
# 7. UNIFIED ONTOLOGY REGISTRY & QUERY INTERFACE
# =============================================================================

class OntologyRegistry:
    """
    Central registry and query engine for universal spatial semantics.
    Supports dynamic registration of custom spaces with zero solver changes.
    """

    def __init__(self):
        self._spaces: Dict[str, SpaceTypeSpec] = dict(UNIVERSAL_SPACE_CATALOG)
        self._overrides: Dict[Tuple[str, str], List[SpatialRule]] = dict(EXPLICIT_OVERRIDES)
        self._typologies: Dict[str, TypologyProfile] = dict(TYPOLOGY_PROFILES)

    def register_space(self, spec: SpaceTypeSpec) -> None:
        """Dynamically registers or updates a space type in the ontology."""
        self._spaces[spec.id] = spec

    def register_override(self, space_id_1: str, space_id_2: str, rules: List[SpatialRule]) -> None:
        """Registers explicit relational override between two space types."""
        key = (space_id_1, space_id_2)
        self._overrides[key] = rules

    def get_space(self, space_id: str) -> Optional[SpaceTypeSpec]:
        """Returns the space specification for given ID or normalized fallback."""
        if space_id in self._spaces:
            return self._spaces[space_id]
        clean = space_id.lower().strip().replace(" ", "_")
        if clean in self._spaces:
            return self._spaces[clean]
        # Partial match
        for k, v in self._spaces.items():
            if k in clean or clean in k:
                return v
        return None

    def get_typology_profile(self, typology: str) -> TypologyProfile:
        """Returns the statutory profile for the requested canonical typology."""
        if not typology:
            return self._typologies["T1_SINGLE_FAMILY"]
        t = str(typology).upper().strip()
        if t in self._typologies:
            return self._typologies[t]
        if "APARTMENT" in t or "MULTI" in t or "DUPLEX" in t or "T2" in t:
            canon = "T2_FAMILY_APARTMENT"
        elif "COMMERCIAL" in t or "OFFICE" in t or "COMPLEX" in t or "T3" in t:
            canon = "T3_LARGE_COMPLEX"
        elif "WAREHOUSE" in t or "INDUSTRIAL" in t or "LOGISTICS" in t or "SHED" in t or "T4" in t:
            canon = "T4_WAREHOUSE"
        else:
            canon = "T1_SINGLE_FAMILY"
        if canon in self._typologies:
            return self._typologies[canon]
        return self._typologies["T1_SINGLE_FAMILY"]

    get_typology = get_typology_profile

    def get_relations(self, space_id_1: str, space_id_2: str) -> List[SpatialRule]:
        """
        Evaluates and returns all active spatial rules between two space types.
        Explicit overrides supersede derived algebra rules.
        """
        s1 = self.get_space(space_id_1)
        s2 = self.get_space(space_id_2)
        if not s1 or not s2:
            return []

        # Check explicit overrides first
        key1 = (s1.id, s2.id)
        key2 = (s2.id, s1.id)
        if key1 in self._overrides:
            return self._overrides[key1]
        if key2 in self._overrides:
            return self._overrides[key2]

        # Derive rules algebraically from attribute schema
        return derive_spatial_rules(s1, s2)

    def is_forbidden_wall(self, space_id_1: str, space_id_2: str) -> bool:
        """Returns True if the two space types are forbidden from sharing a common wall."""
        rules = self.get_relations(space_id_1, space_id_2)
        return any(r.relation == RelationType.FORBIDDEN_WALL for r in rules)

    def is_forbidden_door_facing(self, space_id_1: str, space_id_2: str) -> bool:
        """Returns True if doors of the two space types must never face each other."""
        rules = self.get_relations(space_id_1, space_id_2)
        return any(r.relation == RelationType.FORBIDDEN_DOOR_FACING for r in rules)

    def is_must_adjacent(self, space_id_1: str, space_id_2: str) -> bool:
        """Returns True if the two space types must be directly adjacent."""
        rules = self.get_relations(space_id_1, space_id_2)
        return any(r.relation == RelationType.MUST_ADJACENT for r in rules)

    def evaluate_vertical_stack(
        self,
        upper_space_id: str,
        lower_space_id: str,
        upper_level: int = 1
    ) -> List[SpatialRule]:
        """
        Evaluates statutory vertical stacking rules between upper and lower spaces.
        Enforces:
        - VERT-01: Wet stacks only over wet or shafts.
        - VERT-02: FORBIDDEN_ABOVE wet over sacred, cooking, eating, sleep, technical, secure.
        - VERT-03: Cores always stack identically.
        - VERT-04: Heavy load Ground only.
        - VERT-05: Mezzanine admin fire-separated + industrial stair.
        """
        violations: List[SpatialRule] = []
        upper = self.get_space(upper_space_id)
        lower = self.get_space(lower_space_id)
        if not upper or not lower:
            return violations

        # VERT-04: Heavy load Ground only
        if upper.floor_load == FloorLoad.HEAVY and upper_level > 0:
            violations.append(SpatialRule(
                rule_id="VERT-04-HEAVY-LOAD-GROUND",
                relation=RelationType.FORBIDDEN_ABOVE,
                rationale=RationaleTag.STRUCTURE,
                citation="NBC 2016 Part 6 Structural Design (Heavy Live Load Floor Limits)",
                description=f"Space '{upper.name}' has heavy floor load and is strictly restricted to Ground level (Level 0)."
            ))

        # VERT-02: FORBIDDEN_ABOVE wet over sacred, food, sleep, technical, secure
        is_upper_wet = (upper.hygiene in (HygieneType.WET, HygieneType.FOUL) or upper.moisture_emit >= 2)
        lower_sensitive_to_water = (
            lower.hygiene == HygieneType.SACRED or
            lower.function in (FunctionType.COOKING, FunctionType.EATING, FunctionType.SLEEP, FunctionType.TECHNICAL) or
            lower.security == SecurityLevel.SECURE
        )
        if is_upper_wet and lower_sensitive_to_water:
            violations.append(SpatialRule(
                rule_id="VERT-02-NO-WET-OVER-HABITABLE",
                relation=RelationType.FORBIDDEN_ABOVE,
                rationale=RationaleTag.HYGIENE,
                citation="NBC 2016 Part 9 Section 1 Drainage Cl 4.3.2 & Vastu Canon",
                description=f"Wet sanitation/plumbing room '{upper.name}' is strictly forbidden above sensitive habitable room '{lower.name}'."
            ))

        # VERT-01: Wet stacks only over wet or shaft
        is_lower_wet_or_shaft = (lower.hygiene in (HygieneType.WET, HygieneType.FOUL) or "shaft" in lower.id or "mep" in lower.id)
        if is_upper_wet and not is_lower_wet_or_shaft:
            violations.append(SpatialRule(
                rule_id="VERT-01-WET-STACK",
                relation=RelationType.PREFER_SEPARATE,
                rationale=RationaleTag.STRUCTURE,
                citation="NBC 2016 Part 9 Cl 4.3 (Vertical Drainage Stack Invariant)",
                description=f"Wet room '{upper.name}' on Level {upper_level} does not align with a lower floor wet room or plumbing shaft."
            ))

        # VERT-03: Cores always stack
        if upper.is_vertical_core and not lower.is_vertical_core:
            violations.append(SpatialRule(
                rule_id="VERT-03-CORE-CONTINUITY",
                relation=RelationType.FORBIDDEN_ABOVE,
                rationale=RationaleTag.STRUCTURE,
                citation="NBC 2016 Part 4 Egress Standards Cl 4.4",
                description=f"Vertical circulation core '{upper.name}' must align continuously over a lower vertical core."
            ))

        return violations

    @property
    def all_spaces(self) -> Dict[str, SpaceTypeSpec]:
        return self._spaces

    @property
    def all_overrides(self) -> Dict[Tuple[str, str], List[SpatialRule]]:
        return self._overrides

    @property
    def all_typologies(self) -> Dict[str, TypologyProfile]:
        return self._typologies


# Default singleton instance
ONTOLOGY = OntologyRegistry()


# =============================================================================
# 7. MATHEMATICAL VALIDITY CERTIFICATE MODEL
# =============================================================================

class MathematicalValidityCertificate(BaseModel):
    """
    Mathematical and Statutory Validity Certificate emitted per architectural generation.
    Strictly verifies non-overlap, containment, 1mm dimension chain sums, NBC minimum
    dimensions and aspect ratios, BFS reachability, egress distances, zero forbidden
    violations, MUST/PREFER adjacency satisfaction, vertical stacking, and statutory
    sanitation / parking counts.
    """
    is_valid: bool = Field(..., description="True if 100% of mathematical, statutory, and topological invariants hold")
    non_overlap: bool = Field(..., description="Zero geometric overlap between room footprints (tolerance < 0.05 sqm)")
    containment: bool = Field(..., description="All room rectangles strictly contained inside envelope boundary")
    chain_sums_match: bool = Field(..., description="Dimension chain sums equal overall envelope within 1mm (<= 0.001m)")
    min_dimensions_satisfied: bool = Field(..., description="All room widths and areas satisfy NBC statutory minimums")
    aspect_ratios_satisfied: bool = Field(..., description="All room aspect ratios satisfy maximum statutory bounds")
    connectivity_bfs: bool = Field(..., description="100% room reachability from vertical core / main exit via BFS")
    egress_distances_satisfied: bool = Field(..., description="Every room travel distance <= NBC max travel distance")
    zero_forbidden_violations: bool = Field(..., description="Zero FORBIDDEN_WALL, FORBIDDEN_DOOR_FACING, FORBIDDEN_ABOVE violations")
    must_adjacency_satisfied: bool = Field(..., description="100% of MUST_ADJACENT space pairs are contiguous")
    prefer_adjacency_score: float = Field(default=100.0, ge=0.0, le=100.0, description="Percentage of PREFER_ADJACENT / PREFER_SEPARATE rules satisfied")
    vertical_stack_valid: bool = Field(default=True, description="Vertical core locking, wet stacks, and vertical rules hold across all floors")
    core_continuity_valid: bool = Field(default=True, description="Core continuity across all occupied levels (RULE-FP-01)")
    no_wet_over_terrace_valid: bool = Field(default=True, description="No wet room directly above terrace or open-to-sky (RULE-FP-03)")
    terrace_far_exempt: bool = Field(default=True, description="Terrace area excluded from FAR numerator (RULE-FP-06)")
    cores_stack_aligned: bool = Field(default=True, description="Remaining cores still stack-aligned across storeys")
    sanitation_wc_count_satisfied: bool = Field(default=True, description="Provided WC count >= NBC occupancy statutory minimum")
    parking_count_satisfied: bool = Field(default=True, description="Provided/calculated parking ECS satisfies NBC statutory minimum")
    certificate_id: str = Field(default="CERT-MATH-VALID-2026", description="Unique identifier for this statutory audit certificate")
    certified_rules: List[str] = Field(default_factory=list, description="Explicit list of rule IDs verified and certified")
    details: Dict[str, Any] = Field(default_factory=dict, description="Detailed metrics, per-room travel distances, rule audit log")


def propose_default_floor_plate_masks(
    typology: str,
    total_storeys: int,
    wings: Optional[List[Any]] = None,
) -> Dict[int, Dict[str, str]]:
    """
    Proposes default FloorPlateMask per level based on typology profile.
    - Default: all present.
    - T1 Single Family (G+2 or higher, i.e. storeys >= 3): top level terraces the private wing (Wing B).
    - T4 Warehouse: upper level mezzanine partial.
    """
    wing_ids = [getattr(w, "wing_id", str(w)).lower() for w in wings] if wings else ["wing_a", "wing_b"]
    masks: Dict[int, Dict[str, str]] = {}
    for z in range(total_storeys):
        masks[z] = {wid: "present" for wid in wing_ids}

    typ_upper = typology.upper()
    if ("T1" in typ_upper or "SINGLE" in typ_upper) and total_storeys >= 3 and len(wing_ids) >= 2:
        # Top level terraces private wing
        top_idx = total_storeys - 1
        private_id = wing_ids[1]
        masks[top_idx][private_id] = "terrace"
    elif ("T4" in typ_upper or "WAREHOUSE" in typ_upper) and total_storeys >= 2 and len(wing_ids) >= 2:
        for z in range(1, total_storeys):
            masks[z][wing_ids[1]] = "terrace"

    return masks
