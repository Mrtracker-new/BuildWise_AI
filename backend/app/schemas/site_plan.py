from typing import List, Tuple, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field


class PlotVertex(BaseModel):
    """Survey vertex in local tangent plane (Easting, Northing)."""
    id: str = Field(..., description="Vertex identifier, e.g. P1, P2...")
    x_m: float = Field(..., description="Local Easting in meters (+X is East)")
    y_m: float = Field(..., description="Local Northing in meters (+Y is North)")


class SurveyEdge(BaseModel):
    """Survey boundary edge between two vertices with length and bearing."""
    edge_index: int
    from_vertex: str
    to_vertex: str
    length_m: float
    bearing_deg: float  # Azimuth from North (0° = North, 90° = East)
    bearing_dms: str    # e.g. "N 45° 30' E"


class PlotPolygonModel(BaseModel):
    """
    Canonical ordered polygon model in a local tangent plane (E/N,
    equirectangular with cos(lat) scaling) + origin lat/lon.
    """
    vertices: List[Tuple[float, float]] = Field(
        ...,
        description="Ordered list of (x_m, y_m) vertices in local metric tangent plane"
    )
    origin_lat: Optional[float] = Field(default=None, description="WGS84 origin latitude")
    origin_lon: Optional[float] = Field(default=None, description="WGS84 origin longitude")
    projection_note: str = Field(
        default="Local tangent plane (E/N, equirectangular with cos(lat) scaling)",
        description="Projection methodology description"
    )
    shape_type: Literal["rectangle", "irregular", "trapezoid", "l_shape", "pentagon", "polygon"] = Field(
        default="irregular",
        description="Recognized geometric typology"
    )
    is_regular_rectangle: bool = Field(
        default=False,
        description="True if shape is a regular 4-vertex rectangle"
    )
    area_sqm: float = Field(default=0.0, description="Shoelace area in square meters")
    perimeter_m: float = Field(default=0.0, description="Perimeter in meters")
    bounding_box: Tuple[float, float, float, float] = Field(
        default=(0.0, 0.0, 0.0, 0.0),
        description="(min_x, min_y, max_x, max_y) in meters"
    )


class OutdoorFragment(BaseModel):
    """Outdoor zone fragment resulting from buildable polygon minus footprint."""
    fragment_id: str
    name: str  # e.g. "North Forecourt", "East Yard", "South Lawn"
    area_sqm: float
    centroid: Tuple[float, float]
    polygon_coords: List[Tuple[float, float]] = Field(default_factory=list)


class FootprintWing(BaseModel):
    """Individual rectangular wing within an articulated footprint."""
    wing_id: str
    label: str
    zone_type: Literal["public", "private", "service", "circulation"] = "public"
    x: float
    y: float
    width_m: float
    depth_m: float
    area_sqm: float
    corner_vertices: List[Tuple[float, float]] = Field(default_factory=list)


class CorridorLink(BaseModel):
    """Circulation corridor bridging two wings."""
    link_id: str
    from_wing_id: str
    to_wing_id: str
    x: float
    y: float
    width_m: float
    depth_m: float
    area_sqm: float
    polygon_coords: List[Tuple[float, float]] = Field(default_factory=list)


class InscribedFootprint(BaseModel):
    """Footprint geometry fitted inside buildable polygon."""
    x: float          # SW origin X (meters)
    y: float          # SW origin Y (meters)
    width_m: float    # Footprint width in meters
    depth_m: float    # Footprint depth in meters
    area_sqm: float   # Footprint area in m²
    rotation_angle_deg: float = 0.0  # Rotation angle relative to North (0° = aligned)
    center_x: float = 0.0
    center_y: float = 0.0
    corner_vertices: List[Tuple[float, float]] = Field(default_factory=list)
    topology_type: Literal["single_rectangle", "l_shape", "courtyard", "multi_wing"] = "single_rectangle"
    wings: List[FootprintWing] = Field(default_factory=list)
    corridors: List[CorridorLink] = Field(default_factory=list)
    courtyard_void: Optional[OutdoorFragment] = None


class SiteCertificate(BaseModel):
    """Mathematical site compliance certificate."""
    footprint_contained_in_buildable: bool = True
    setback_distance_satisfied: bool = True
    min_setback_achieved_m: float = 0.0
    required_setback_m: float = 0.0
    ground_coverage_actual_pct: float = 0.0
    ground_coverage_limit_pct: float = 60.0
    far_actual: float = 0.0
    far_limit: float = 2.5
    is_valid: bool = True
    diagnostics: List[str] = Field(default_factory=list)


class SitePlanModel(BaseModel):
    """
    Complete site layer synthesis encapsulating all irregularity at the site level.
    """
    plot_polygon: PlotPolygonModel
    buildable_polygon_coords: List[Tuple[float, float]]
    buildable_area_sqm: float
    nominal_setback_m: float
    reduced_setback_applied: bool = False
    footprint: InscribedFootprint
    outdoor_zones: List[OutdoorFragment] = Field(default_factory=list)
    setback_band_area_sqm: float = 0.0
    edges: List[SurveyEdge] = Field(default_factory=list)
    vertex_table: List[PlotVertex] = Field(default_factory=list)
    site_vastu_zones: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    certificate: SiteCertificate = Field(default_factory=SiteCertificate)
    svg_site_plan: Optional[str] = None
