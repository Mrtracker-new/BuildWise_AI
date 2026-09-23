from typing import List, Dict, Optional, Literal, Any
from pydantic import BaseModel, Field, field_validator

class FloorPlanRequest(BaseModel):
    plot_width_m: float = Field(..., ge=6.0, le=60.0, description="Plot frontage width in meters")
    plot_depth_m: float = Field(..., ge=6.0, le=60.0, description="Plot depth in meters")
    required_rooms: List[str] = Field(
        default=["master_bed", "kitchen", "living", "puja", "bath_1"],
        min_length=3,
        max_length=12,
        description="List of required room IDs to be placed"
    )
    vastu_strictness: Literal["high", "medium", "low"] = Field(
        default="high",
        description="Weight of Vastu Shastra rules vs. plumbing & circulation efficiency"
    )

    @field_validator("required_rooms")
    @classmethod
    def validate_rooms(cls, v: List[str]) -> List[str]:
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
    total_built_up_sqm: float
    circulation_efficiency_pct: float

class FloorPlanResponse(BaseModel):
    status: Literal["optimal", "compromise", "failed"]
    grid_matrix: List[List[str]] = Field(..., description="2D matrix of room IDs (R x C)")
    placements: List[RoomPlacement] = Field(..., description="Structured room placement coordinates")
    svg_blueprint: str = Field(..., description="Raw standalone W3C SVG XML string ready for frontend injection")
    metrics: FloorPlanMetrics
    warnings: List[str] = Field(default_factory=list)
    timing_ms: float = Field(..., description="Solver execution duration in milliseconds")
    iterations: int = Field(..., description="Total backtracking iterations evaluated")
