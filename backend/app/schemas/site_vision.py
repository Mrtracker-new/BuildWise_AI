from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field

class SiteVisionRequest(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Latitude in decimal degrees")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Longitude in decimal degrees")
    plot_area_sqft: Optional[float] = Field(None, ge=200.0, le=100000.0, description="Plot area in sq ft")
    mode_override: Optional[Literal["segformer", "index-only"]] = Field(
        None, description="Optional override to force segformer or index-only mode"
    )
    orientation_deg: Optional[float] = Field(
        None, ge=0.0, le=360.0, description="Proposed building layout orientation in degrees (0-360)"
    )

class SceneMetadata(BaseModel):
    id: str = Field(..., description="Sentinel-2 scene identifier (e.g., S2C_43PDS_20260331_0_L2A)")
    datetime: str = Field(..., description="Acquisition ISO-8601 timestamp")
    cloud_cover_pct: float = Field(..., ge=0.0, le=100.0, description="Scene cloud cover percentage")
    source: str = Field("Copernicus Sentinel-2", description="Data provider citation")

class PreservationItem(BaseModel):
    cluster_id: str = Field(..., description="Unique cluster identifier, e.g. tree-cluster-1")
    area_sqm: float = Field(..., ge=0.0, description="Cluster footprint area in square meters")
    centroid: List[float] = Field(..., min_length=2, max_length=2, description="[longitude, latitude]")
    mean_ndvi: float = Field(..., ge=-1.0, le=1.0, description="Mean NDVI spectral response within cluster")
    overlap_footprint: bool = Field(..., description="True if cluster intersects proposed building footprint")
    rank: Literal["preserve", "compensate", "removable", "context"] = Field(
        ..., description="Ecological action rank"
    )
    action: str = Field(..., description="Civil/ecological actionable recommendation text")

class GeoJsonGeometry(BaseModel):
    type: Literal["Polygon", "MultiPolygon"] = "Polygon"
    coordinates: Any

class GeoJsonFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: GeoJsonGeometry
    properties: Dict[str, Any]

class GeoJsonFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: List[GeoJsonFeature] = []

class SiteVisionResponse(BaseModel):
    mode: Literal["segformer", "index-only", "unavailable"] = Field(
        ..., description="Active operational mode"
    )
    scene_metadata: Optional[SceneMetadata] = Field(
        None, description="Metadata of the analyzed Sentinel-2 scene"
    )
    green_cover_pct: float = Field(0.0, ge=0.0, le=100.0, description="Tree & dense vegetation cover %")
    water_cover_pct: float = Field(0.0, ge=0.0, le=100.0, description="Surface water body cover %")
    built_up_pct: float = Field(0.0, ge=0.0, le=100.0, description="Impervious / built-up surface cover %")
    tree_clusters: GeoJsonFeatureCollection = Field(
        default_factory=lambda: GeoJsonFeatureCollection(features=[]),
        description="Vectorized tree canopy cluster polygons"
    )
    water_bodies: GeoJsonFeatureCollection = Field(
        default_factory=lambda: GeoJsonFeatureCollection(features=[]),
        description="Vectorized surface water body polygons"
    )
    preservation_plan: List[PreservationItem] = Field(
        default_factory=list,
        description="Ordered list of tree clusters with preservation rankings"
    )
    warnings: List[str] = Field(
        default_factory=list,
        description="Operational warnings, fallbacks, or data quality flags"
    )
    timing_ms: Dict[str, float] = Field(
        default_factory=dict,
        description="Component telemetry in milliseconds (stac, fetch, inference, total)"
    )
