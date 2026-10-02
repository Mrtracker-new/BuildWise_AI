"""
Site intelligence schemas: nearest-road proxy + site preview.
======================================================================
Annotation status taxonomy — every site annotation carries exactly one:
  CALCULATED  derived deterministically from the request inputs (formulas)
  ASSUMED     a defaulted input or heuristic not confirmed by the user
  RECOMMENDED an engineering suggestion derived from the computed geometry
  VERIFIED    confirmed by the user on the map or from external telemetry

Contracts:
- ASSUMED never renders as CALCULATED (serialized status is explicit).
- /api/site/preview contains NO floor solve, NO LLM call, NO network call:
  the same inputs always yield the same geometry (hash-cached).
"""
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.request import BoundarySummary

AnnotationStatus = Literal["CALCULATED", "ASSUMED", "RECOMMENDED", "VERIFIED"]
ANNOTATION_STATUSES = ("CALCULATED", "ASSUMED", "RECOMMENDED", "VERIFIED")


# --------------------------------------------------------------------------- #
#  /api/nearest-road                                                           #
# --------------------------------------------------------------------------- #

class RoadNearestPoint(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


class RoadHit(BaseModel):
    """Nearest mapped road telemetry (None fields mean genuinely unknown)."""
    bearing_degrees: Optional[float] = None
    approach_side: str = "unknown"
    distance_meters: Optional[float] = None
    nearest_point: Optional[RoadNearestPoint] = None
    highway_class: Optional[str] = None
    road_name: Optional[str] = None
    is_fallback: bool


class RoadProvenance(BaseModel):
    source: str = Field(..., description="osm_overpass | assumed_fallback")
    annotation: AnnotationStatus
    attribution: str = "© OpenStreetMap contributors (Overpass API)"
    query_radius_m: int = 500
    cache: Literal["hit", "miss"] = "miss"


class NearestRoadResponse(BaseModel):
    request_id: str
    timestamp: str
    lat: float
    lon: float
    found: bool
    road: Optional[RoadHit] = None
    provenance: RoadProvenance
    cached: bool = False
    degraded: bool = False
    warning: Optional[str] = None


# --------------------------------------------------------------------------- #
#  /api/site/preview                                                           #
# --------------------------------------------------------------------------- #

class SitePreviewRequest(BaseModel):
    """Advisory preview request: captured boundary + planning inputs only."""
    boundary: BoundarySummary
    ground_coverage_ratio: Optional[float] = Field(
        default=None, ge=0.40, le=0.75,
        description="Ground coverage ratio; ASSUMED default 0.60 when omitted",
    )
    frontage_edge_index: Optional[int] = Field(
        default=None, ge=0,
        description="Overrides boundary.frontage_edge_index when set",
    )


class SiteAnnotation(BaseModel):
    """One site measurement with an explicit provenance status."""
    id: str
    label: str
    value: Any
    unit: Optional[str] = None
    status: AnnotationStatus
    basis: str = Field(..., description="How the value was derived (traceability)")


class SitePreviewResponse(BaseModel):
    request_id: str
    timestamp: str
    input_hash: str = Field(..., description="SHA-256 of the canonical request inputs")
    cached: bool = False
    compute_ms: float = 0.0
    ok: bool = True
    plot: Dict[str, Any]
    setbacks: Dict[str, Any]
    buildable: Dict[str, Any]
    footprint: Dict[str, Any]
    parking: Dict[str, Any]
    wedges: List[Dict[str, Any]] = Field(default_factory=list)
    certificate: Dict[str, Any]
    frontage: Optional[Dict[str, Any]] = None
    annotations: List[SiteAnnotation] = Field(default_factory=list)
    provenance: Dict[str, Any]
    warnings: List[str] = Field(default_factory=list)
