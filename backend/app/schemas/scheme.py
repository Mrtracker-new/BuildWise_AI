"""Schemas for the ranked scheme portfolio.

The legacy single-plan response stays intact. These models are attached only
when scheme generation is requested, so existing consumers see no change.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.schemas.multi_floor_plan import (
    MultiFloorDoorGeometry,
    MultiFloorRoomRectangle,
    MultiFloorWindowGeometry,
)


class SchemeProfileId(str, Enum):
    MAX_AREA = "max_area"
    MAX_VASTU = "max_vastu"
    MAX_LIGHT_VENT = "max_light_vent"


class SchemeWeights(BaseModel):
    area: float = Field(ge=0.0, le=1.0)
    vastu: float = Field(ge=0.0, le=1.0)
    light_vent: float = Field(ge=0.0, le=1.0)
    relations: float = Field(ge=0.0, le=1.0)
    compactness: float = Field(ge=0.0, le=1.0)


class SchemeMetrics(BaseModel):
    land_use_efficiency_pct: float = 0.0
    circulation_ratio_pct: float = 0.0
    vastu_score: float = 0.0
    daylight_score: float = 0.0
    relation_score: float = 0.0
    compactness_score: float = 0.0
    total_score: float = 0.0
    forbidden_violations: int = 0
    must_adjacency_score: float = 0.0
    prefer_score: float = 0.0
    egress_connected: bool = False
    min_area_violations: int = 0
    min_width_violations: int = 0
    aspect_violations: int = 0
    furniture_fit_pct: float = 0.0
    program_area_sqm: float = 0.0
    circulation_area_sqm: float = 0.0
    envelope_area_sqm: float = 0.0
    program_deficit_sqm: float = 0.0
    dropped_rooms: List[str] = Field(default_factory=list)


class SchemeDelta(BaseModel):
    land_use_efficiency_pct: Optional[float] = None
    circulation_ratio_pct: Optional[float] = None
    vastu_score: Optional[float] = None
    daylight_score: Optional[float] = None
    total_score: Optional[float] = None
    # Proportion and fit are picker-visible deltas too, not just a
    # score hidden in the alternative's detail payload.
    aspect_violations: Optional[int] = None
    furniture_fit_pct: Optional[float] = None


class SchemeFloor(BaseModel):
    floor_index: int
    floor_name: str
    envelope: Dict[str, Any]
    rooms: List[MultiFloorRoomRectangle] = Field(default_factory=list)
    doors: List[MultiFloorDoorGeometry] = Field(default_factory=list)
    windows: List[MultiFloorWindowGeometry] = Field(default_factory=list)
    svg_blueprint_cad: Optional[str] = None
    svg_blueprint_paper: Optional[str] = None
    metrics: Dict[str, Any] = Field(default_factory=dict)


class SchemeAlternative(BaseModel):
    scheme_id: str
    profile: SchemeProfileId
    label: str
    rank: int = 0
    feasible: bool = False
    score: float = 0.0
    weights: SchemeWeights
    metrics: SchemeMetrics
    delta_vs_engine: SchemeDelta = Field(default_factory=SchemeDelta)
    delta_vs_best: SchemeDelta = Field(default_factory=SchemeDelta)
    floors: List[SchemeFloor] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    provenance: Dict[str, Any] = Field(default_factory=dict)


class SchemePortfolio(BaseModel):
    seed: int
    typology: str
    reference_metrics: SchemeMetrics = Field(default_factory=SchemeMetrics)
    alternatives: List[SchemeAlternative] = Field(default_factory=list)
    selected_scheme_id: Optional[str] = None
    selection_source: str = "default_rank"
    provenance: Dict[str, Any] = Field(default_factory=dict)
