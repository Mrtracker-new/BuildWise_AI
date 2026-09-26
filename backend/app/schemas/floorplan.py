from typing import List, Dict, Optional, Literal, Any
from pydantic import BaseModel, Field, field_validator, model_validator
from app.schemas.room_program import RoomProgram
from app.schemas.multi_floor_plan import MultiStoreyBuildingModel, ExtractedClientConstraints

class FloorPlanRequest(BaseModel):
    plot_width_m: float = Field(..., ge=6.0, le=60.0, description="Plot frontage width in meters")
    plot_depth_m: float = Field(..., ge=6.0, le=60.0, description="Plot depth in meters")
    required_rooms: Optional[List[str]] = Field(
        default=None,
        description="Optional list of required room IDs to be placed"
    )
    vastu_strictness: Literal["high", "medium", "low"] = Field(
        default="high",
        description="Weight of Vastu Shastra rules vs. plumbing & circulation efficiency"
    )
    building_typology: Optional[str] = Field(default="residential_single", description="Typology identifier")
    quality_grade: Optional[str] = Field(default="standard", description="Specification grade: basic, standard, premium")
    floors: Optional[int] = Field(default=1, ge=1, le=10, description="Number of storeys/levels")
    built_up_area_sqft: Optional[float] = Field(default=None, description="Total plinth/built-up area in sq ft")
    ground_coverage_ratio: Optional[float] = Field(default=0.60, description="Ground coverage ratio applied")
    client_notes: Optional[str] = Field(default=None, max_length=240, description="Optional client notes / design requirements")
    ai_provider: Optional[str] = Field(default="mock", description="AI provider for LLM room program synthesis")
    room_program: Optional[RoomProgram] = Field(default=None, description="Explicit LLM or caller-provided room program")
    solar_axis_degrees: Optional[float] = Field(default=None, description="Optimal solar axis in degrees")
    prevailing_wind_direction_degrees: Optional[float] = Field(default=None, description="Prevailing wind azimuth in degrees")
    top_vastu_entrances: Optional[List[str]] = Field(default=None, description="Top ranked auspicious entrance orientations")
    program_source: Optional[str] = Field(default=None, description="Pre-computed program source: llm, cache, or fallback")
    bypass_cache: Optional[bool] = Field(default=False, description="Whether to bypass room program cache for fresh generation")
    extracted_constraints: Optional[ExtractedClientConstraints] = Field(
        default=None,
        description="Optional pre-parsed structured client constraints"
    )
    multi_storey: Optional[MultiStoreyBuildingModel] = Field(
        default=None,
        description="Optional pre-generated multi-storey building model for direct PDF export or re-rendering"
    )

    @model_validator(mode="before")
    @classmethod
    def normalize_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "multiStorey" in data and "multi_storey" not in data:
                data["multi_storey"] = data["multiStorey"]
            if "groundCoverageRatio" in data and "ground_coverage_ratio" not in data:
                data["ground_coverage_ratio"] = data["groundCoverageRatio"]
            if "builtUpAreaSqft" in data and "built_up_area_sqft" not in data:
                data["built_up_area_sqft"] = data["builtUpAreaSqft"]
            if "requiredRooms" in data and "required_rooms" not in data:
                data["required_rooms"] = data["requiredRooms"]
            if "plotWidthM" in data and "plot_width_m" not in data:
                data["plot_width_m"] = data["plotWidthM"]
            if "plotDepthM" in data and "plot_depth_m" not in data:
                data["plot_depth_m"] = data["plotDepthM"]
            if "bypassCache" in data and "bypass_cache" not in data:
                data["bypass_cache"] = data["bypassCache"]
            # Extract plot dimensions from multi_storey if not explicitly at top level
            if data.get("multi_storey") and isinstance(data["multi_storey"], dict):
                ms = data["multi_storey"]
                if "plot_width_m" not in data and "plot_width_m" in ms:
                    data["plot_width_m"] = ms["plot_width_m"]
                if "plot_depth_m" not in data and "plot_depth_m" in ms:
                    data["plot_depth_m"] = ms["plot_depth_m"]
                if "floors" not in data and "total_storeys" in ms:
                    data["floors"] = ms["total_storeys"]
                if "building_typology" not in data and "building_typology" in ms:
                    data["building_typology"] = ms["building_typology"]
        return data

    @field_validator("required_rooms")
    @classmethod
    def validate_rooms(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return v
        seen = set()
        deduped = []
        for r in v:
            clean = r.strip().lower()
            if clean and clean not in seen:
                seen.add(clean)
                deduped.append(clean)
        if len(deduped) < 3:
            raise ValueError("At least 3 distinct rooms are required to synthesize a floor plan.")
        return deduped

class EnvelopeRect(BaseModel):
    x: float
    y: float
    width: float
    height: float
    area_sqm: float

class RoomRectangle(BaseModel):
    room_id: str
    room_name: str
    x: float
    y: float
    width: float
    height: float
    area_sqm: float
    zone: str
    vastu_compliant: bool
    applied_rules: List[str] = Field(default_factory=list, description="Ontology rule IDs shaping this room")
    relaxations: List[Dict[str, str]] = Field(default_factory=list, description="Rule relaxations with rationale tags")

class DoorGeometry(BaseModel):
    door_id: str
    from_room: str
    to_room: str
    wall_edge: str
    x1: float
    y1: float
    x2: float
    y2: float
    hinge_x: float
    hinge_y: float
    swing_direction: str
    width_m: float = 0.9

class WindowGeometry(BaseModel):
    window_id: str
    room_id: str
    wall_edge: str
    x1: float
    y1: float
    x2: float
    y2: float
    width_m: float

class FloorPlanQA(BaseModel):
    entry: str = Field(default="living", description="Entry room name")
    circulation: str = Field(default="connected", description="Circulation status: connected or disconnected")
    leaf_rule: bool = Field(default=True, description="Whether all bath/WC/utility/store nodes have degree == 1")
    peripheral_service: bool = Field(default=True, description="Whether service rooms touch exterior walls and avoid central 40% box")
    catalog: bool = Field(default=True, description="Whether room areas satisfy catalog bounds (e.g. bath 3.5-6 m2, puja min width 2.4m)")
    aspect: bool = Field(default=True, description="Whether aspect ratios are <= 1:2.2")
    critic: str = Field(default="pass", description="LLM layout critic verdict: pass, fail, or skipped")
    violations: int = Field(default=0, description="Count of rule violations")
    critic_notes: Optional[List[str]] = Field(default_factory=list, description="Critic identified architectural concerns if any")

class RectanglesModel(BaseModel):
    envelope: EnvelopeRect
    rooms: List[RoomRectangle]
    doors: List[DoorGeometry] = Field(default_factory=list)
    windows: List[WindowGeometry] = Field(default_factory=list)
    qa: Optional[FloorPlanQA] = None

class RoomPlacement(BaseModel):
    room_id: str
    room_name: str
    row: int
    col: int
    width: int
    height: int
    area_sqm: float
    width_m: float
    depth_m: float
    zone: str
    vastu_compliant: bool

class FloorPlanMetrics(BaseModel):
    vastu_compliance_pct: float = Field(..., ge=0.0, le=100.0)
    plumbing_adjacency_score: float = Field(..., ge=0.0, le=100.0)
    space_utilization_pct: float = Field(..., ge=0.0, le=100.0)
    plot_coverage_pct: float = Field(default=0.0, ge=0.0, le=100.0)
    total_built_up_sqm: float
    circulation_efficiency_pct: float
    circulation_status: Optional[str] = Field(default="connected", description="Circulation connectivity status")

class FloorPlanResponse(BaseModel):
    status: Literal["optimal", "compromise", "failed"]
    grid_matrix: List[List[str]] = Field(..., description="2D matrix of room IDs (R x C)")
    placements: List[RoomPlacement] = Field(..., description="Structured room placement coordinates")
    rectangles: Optional[RectanglesModel] = Field(default=None, description="Continuous geometric rectangles model")
    svg_blueprint: str = Field(..., description="Raw standalone W3C SVG XML string ready for frontend injection")
    svg_blueprint_paper: Optional[str] = Field(default=None, description="Paper blueprint theme SVG string ready for print or paper mode")
    metrics: FloorPlanMetrics
    warnings: List[str] = Field(default_factory=list)
    timing_ms: float = Field(..., description="Solver execution duration in milliseconds")
    iterations: int = Field(..., description="Total backtracking iterations evaluated")
    design_intent: Optional[str] = Field(default=None, description="2-3 sentence architectural design brief from room program")
    program_source: Optional[str] = Field(default="fallback", description="Source of room program: llm, cache, or fallback")
    placement_source: Optional[str] = Field(default="kb-default", description="Source of room placement: 'llm+kb' or 'kb-default'")
    placement_logic: Optional[Dict[str, str]] = Field(default_factory=dict, description="Room-by-room architectural rationale sentences")
    ai_metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Room program generation metadata")
    room_program: Optional[RoomProgram] = Field(default=None, description="Room program specification evaluated by solver")
    qa: Optional[FloorPlanQA] = Field(
        default_factory=lambda: FloorPlanQA(entry="hall", circulation="connected", violations=0),
        description="Architectural spatial logic QA gate verification stats"
    )
    multi_storey: Optional[MultiStoreyBuildingModel] = Field(
        default=None,
        description="Full multi-storey building model synthesizing all floor plates and vertical cores"
    )
    client_constraints: Optional[ExtractedClientConstraints] = Field(
        default=None,
        description="Structured design constraints parsed from client requirements"
    )
    mathematical_certificate: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Mathematical validity certificate certifying non-overlap, containment, egress, adjacency, and stacking"
    )
    params_snapshot: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Snapshot of generation input parameters"
    )
    generation_id: Optional[str] = Field(
        default=None,
        description="Unique generation ID token"
    )
    seed: Optional[str] = Field(
        default=None,
        description="Deterministic generation seed"
    )
    generated_at: Optional[float] = Field(
        default=None,
        description="Timestamp of generation in epoch milliseconds"
    )


class FloorPlanParamsSnapshot(BaseModel):
    building_typology: str
    floors: int
    ground_coverage_ratio: float
    plot_width_m: float
    plot_depth_m: float
    required_rooms: List[str] = Field(default_factory=list)
    vastu_strictness: str = "high"
    built_up_area_sqft: Optional[float] = None
    client_notes: Optional[str] = None
    ai_provider: Optional[str] = None

