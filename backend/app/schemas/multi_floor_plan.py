from typing import List, Dict, Optional, Literal, Any
from pydantic import BaseModel, Field


class VerticalCoreSpec(BaseModel):
    """
    Specification for vertically continuous building circulation elements
    (staircases, lifts, and MEP structural chases) that must align across all storeys.
    """
    core_id: str
    core_type: Literal[
        "staircase_dogleg",
        "staircase_fire",
        "lift_passenger",
        "lift_service",
        "mep_chase"
    ]
    x: float
    y: float
    width_m: float
    depth_m: float
    landing_depth_m: Optional[float] = None
    tread_mm: int = 250
    riser_mm: int = 175
    continuous_across_floors: List[int] = Field(default_factory=list)


class DuctShaftSpec(BaseModel):
    """
    Vertical MEP and wet plumbing shaft connecting bathrooms and kitchens to foundation drainage.
    """
    shaft_id: str
    shaft_type: Literal["plumbing_wet", "electrical_mep", "hvac_vent"]
    x: float
    y: float
    width_m: float
    depth_m: float
    servicing_rooms: List[str] = Field(default_factory=list)


class MultiFloorRoomRectangle(BaseModel):
    """
    Exact continuous geometric footprint of a room located on a specific floor level.
    """
    room_id: str
    room_name: str
    floor_index: int  # 0 = Ground, 1 = G+1, 2 = G+2, 3 = G+3
    unit_id: Optional[str] = None  # None for T1/T4; "U1", "U2" for multi-unit T2/T3
    x: float
    y: float
    width_m: float
    depth_m: float
    area_sqm: float
    zone: str  # N, NE, E, SE, S, SW, W, NW, CENTER
    zone_category: Literal["public", "private", "service", "circulation", "industrial_bay"] = "public"
    vastu_compliant: bool = True
    is_vertical_core: bool = False
    requires_exterior_wall: bool = True
    aspect_ratio: float = 1.0


class MultiFloorDoorGeometry(BaseModel):
    """
    Architectural door representation with hinge, swing arc, and room connection.
    """
    door_id: str
    floor_index: int
    from_room: str
    to_room: str
    wall_edge: Literal["north", "south", "east", "west", "vertical", "horizontal"]
    x1: float
    y1: float
    x2: float
    y2: float
    hinge_x: float
    hinge_y: float
    swing_direction: Literal["inward_right", "inward_left", "outward_right", "outward_left"] = "inward_right"
    width_m: float = 0.90
    door_type: Literal["standard", "fire_rated", "sliding", "dock_shutter"] = "standard"


class MultiFloorWindowGeometry(BaseModel):
    """
    Architectural window representation on exterior walls.
    """
    window_id: str
    floor_index: int
    room_id: str
    wall_edge: Literal["north", "south", "east", "west"]
    x1: float
    y1: float
    x2: float
    y2: float
    width_m: float
    sill_height_m: float = 0.90


class StructuralGridSpec(BaseModel):
    """
    Structural column grid specification primarily for Typology T4 (Warehouse) and T3 (Complex).
    """
    bay_spacing_x_m: float = 6.0
    bay_spacing_y_m: float = 6.0
    columns_x: List[float] = Field(default_factory=list)
    columns_y: List[float] = Field(default_factory=list)
    column_size_m: float = 0.45


class SingleFloorPlanModel(BaseModel):
    """
    Complete geometric and metric blueprint representation for a single storey level.
    """
    floor_index: int
    floor_name: str  # "Ground Floor (G)", "First Floor (G+1)", etc.
    envelope: Dict[str, float]  # x, y, width, depth, area_sqm
    rooms: List[MultiFloorRoomRectangle] = Field(default_factory=list)
    doors: List[MultiFloorDoorGeometry] = Field(default_factory=list)
    windows: List[MultiFloorWindowGeometry] = Field(default_factory=list)
    circulation_status: Literal["connected", "disconnected"] = "connected"
    vastu_score_pct: float = 0.0
    vastu_compliance_pct: float = 0.0
    plumbing_stack_alignment_pct: float = 100.0
    built_up_area_sqm: float = 0.0
    carpet_area_sqm: float = 0.0
    svg_blueprint_cad: str = ""
    svg_blueprint_paper: str = ""
    wall_graph: Optional[Dict[str, Any]] = None
    door_schedule: List[Dict[str, Any]] = Field(default_factory=list)
    window_schedule: List[Dict[str, Any]] = Field(default_factory=list)
    room_schedule: List[Dict[str, Any]] = Field(default_factory=list)
    stair_geometry: Optional[Dict[str, Any]] = None


class MultiStoreyBuildingModel(BaseModel):
    """
    Root multi-storey architectural blueprint representation synthesizing all storeys,
    shared vertical circulation cores, structural grid, and compliance verification.
    """
    building_typology: Literal[
        "T1_SINGLE_FAMILY",
        "T2_FAMILY_APARTMENT",
        "T3_LARGE_COMPLEX",
        "T4_WAREHOUSE"
    ] | str
    total_storeys: int = Field(..., ge=1, le=4)
    plot_width_m: float
    plot_depth_m: float
    ground_coverage_ratio: float = 0.60
    total_built_up_area_sqm: float = 0.0
    vertical_cores: List[VerticalCoreSpec] = Field(default_factory=list)
    duct_shafts: List[DuctShaftSpec] = Field(default_factory=list)
    structural_grid: Optional[StructuralGridSpec] = None
    floors: List[SingleFloorPlanModel] = Field(default_factory=list)
    global_metrics: Dict[str, Any] = Field(default_factory=dict)
    qa_report: Dict[str, Any] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)
    unmet_requirements: List[str] = Field(default_factory=list)
    seed: int = 42
    solver_timing_ms: float = 0.0


# ---------------------------------------------------------------------------
# Structured Client Requirements Schemas
# ---------------------------------------------------------------------------

class SpatialAdjacencyConstraint(BaseModel):
    room_a: str
    room_b: str
    relationship: Literal["connected", "adjacent", "separated"] = "adjacent"


class OrientationPreferenceConstraint(BaseModel):
    space: str
    preferred_facing: Literal[
        "North", "East", "South", "West",
        "North-East", "South-East", "South-West", "North-West"
    ]


# Alias for backward and test compatibility
SpaceOrientationPreference = OrientationPreferenceConstraint


class ExtractedClientConstraints(BaseModel):
    """
    Structured design constraints extracted from free-text client notes.
    """
    target_bedroom_count: int = Field(default=2, ge=1, le=6)
    target_bathroom_count: int = Field(default=2, ge=1, le=6)
    specialized_spaces: List[str] = Field(default_factory=list)
    spatial_adjacencies: List[SpatialAdjacencyConstraint] = Field(default_factory=list)
    orientation_preferences: List[OrientationPreferenceConstraint] = Field(default_factory=list)
    explicit_exclusions: List[str] = Field(default_factory=list)
    raw_notes: Optional[str] = None
    extraction_source: Literal["groq_llm", "gemini_llm", "regex_fallback"] = "regex_fallback"
