import json
import math
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

from app.schemas.response import (
    RankedEntrance,
    RoomGridZone,
    SlopeReading,
    ReconciliationItem,
    RoadApproach,
    VastuAdvisory
)
from app.services.road_service import (
    fetch_nearest_road,
    VASTU_CACHE_CATEGORY,
    VASTU_CACHE_PRECISION,
)
from app.utils.geo_utils import (
    azimuth_to_cardinal_8,
    get_cardinal_offsets
)

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"

_VASTU_RULES: Optional[Dict[str, Any]] = None

def _load_vastu_table() -> Dict[str, Any]:
    global _VASTU_RULES
    if _VASTU_RULES is None:
        file_path = DATA_DIR / "vastu_rules.json"
        with open(file_path, "r", encoding="utf-8") as f:
            _VASTU_RULES = json.load(f)
    return _VASTU_RULES

FACE_ANGLES: Dict[str, float] = {
    "N": 0.0,
    "NE": 45.0,
    "E": 90.0,
    "SE": 135.0,
    "S": 180.0,
    "SW": 225.0,
    "W": 270.0,
    "NW": 315.0
}


async def fetch_nearest_road_approach(lat: float, lon: float) -> Tuple[RoadApproach, Optional[str]]:
    """
    Queries OpenStreetMap Overpass API for the nearest primary-through-residential
    highway within 500m via the shared road service.
    Per Amendment 1: Never synthesize a bearing. If unreachable, returns bearing_degrees=None,
    approach_side='unknown', is_fallback=True, and user-facing warning.
    """
    result, _cache_hit, _warning = await fetch_nearest_road(
        lat,
        lon,
        cache_category=VASTU_CACHE_CATEGORY,
        cache_precision=VASTU_CACHE_PRECISION,
    )
    if result.get("is_fallback"):
        # Explicit unknown fallback per Amendment 1 (No fabricated geometry)
        warning = "Road network telemetry unavailable. Approach-side alignment bonus omitted from entrance ranking."
        fallback_approach = RoadApproach(
            bearing_degrees=None,
            approach_side="unknown",
            distance_meters=None,
            is_fallback=True
        )
        return fallback_approach, warning

    approach_data = {
        "bearing_degrees": result["bearing_degrees"],
        "approach_side": result["approach_side"],
        "distance_meters": result["distance_meters"],
        "is_fallback": False,
    }
    return RoadApproach(**approach_data), None


def compute_slope_reading(
    elevation_m: float,
    lat: float,
    lon: float,
    elevation_samples: Optional[Dict[str, float]] = None
) -> SlopeReading:
    """
    Computes topographic downhill drainage aspect using cardinal elevation samples.

    When real elevation samples (from
    fetch_elevation_samples) are supplied they govern the gradient; otherwise
    the synthetic terrain model is used and the reading is explicitly labelled
    as SYNTHETIC so it is never mistaken for measured terrain.
    """
    offsets = get_cardinal_offsets(lat, lon, distance_meters=33.0)

    synthetic = True
    if (
        isinstance(elevation_samples, dict)
        and all(k in elevation_samples for k in ("center", "north", "south", "east", "west"))
    ):
        h0 = float(elevation_samples["center"])
        h_n = float(elevation_samples["north"])
        h_s = float(elevation_samples["south"])
        h_e = float(elevation_samples["east"])
        h_w = float(elevation_samples["west"])
        synthetic = False
    else:
        from app.utils.geo_utils import calculate_synthetic_elevation
        h0 = calculate_synthetic_elevation(lat, lon)
        h_n = calculate_synthetic_elevation(offsets["north"][0], offsets["north"][1])
        h_s = calculate_synthetic_elevation(offsets["south"][0], offsets["south"][1])
        h_e = calculate_synthetic_elevation(offsets["east"][0], offsets["east"][1])
        h_w = calculate_synthetic_elevation(offsets["west"][0], offsets["west"][1])

    d_lat = h_n - h_s
    d_lon = h_e - h_w

    if abs(d_lat) < 0.05 and abs(d_lon) < 0.05:
        # Near flat terrain
        azimuth = 45.0
        drainage_dir = "NE"
    else:
        # Downhill vector is in direction of falling gradient (-d_lon, -d_lat)
        azimuth = round((math.degrees(math.atan2(-d_lon, -d_lat)) + 360.0) % 360.0, 1)
        drainage_dir = azimuth_to_cardinal_8(azimuth)

    table = _load_vastu_table()
    slope_rules = table.get("slope_drainage_rules", {})
    rule = slope_rules.get(drainage_dir, {
        "status": "neutral",
        "description": f"Terrain drainage slopes toward {drainage_dir}."
    })

    status = rule.get("status", "neutral")
    desc = rule.get("description", "")
    if synthetic:
        desc = ("SYNTHETIC TERRAIN MODEL (live elevation service unavailable; not a measured survey): "
                + desc)
    remedy = None

    if status == "requires_remedy":
        remedy = (
            f"Ground falls toward {drainage_dir} (unfavourable in traditional canon). "
            f"Remedial engineering: elevate southern/southwestern plinth level by +300mm above grade, "
            f"and excavate perimeter interceptor drainage swales to redirect surface runoff toward the Northeast/North boundary."
        )

    return SlopeReading(
        drainage_direction=drainage_dir,
        azimuth_degrees=azimuth,
        auspiciousness=status,
        rationale=desc,
        remedy_notes=remedy
    )


def rank_entrances(
    road_approach: RoadApproach
) -> List[RankedEntrance]:
    """
    Scores all 8 cardinal/intercardinal faces using canonical Vastu weights,
    approach road alignment bonus, and passive climate terms.
    Returns top 3 ranked entrances with Vastu and practical rationales.
    """
    table = _load_vastu_table()
    weights = table.get("entrance_weights", {})
    climate_adjustments = table.get("climate_adjustments", {})

    ranked: List[Dict[str, Any]] = []

    for direction, angle in FACE_ANGLES.items():
        base_info = weights.get(direction, {})
        base_w = base_info.get("base_weight", 50.0)
        climate_term = climate_adjustments.get(direction, 0.0)

        approach_bonus = 0.0
        is_approach = False
        rear_discount = 0.0

        if road_approach.bearing_degrees is not None:
            road_bearing = road_approach.bearing_degrees
            angular_diff = min(abs(angle - road_bearing), 360.0 - abs(angle - road_bearing))

            if angular_diff <= 45.0:
                approach_bonus = 35.0 * (1.0 - angular_diff / 45.0)
                is_approach = True
            elif angular_diff >= 135.0:
                # Facing directly away from the road frontage (rear boundary wall)
                rear_discount = 30.0 * ((angular_diff - 135.0) / 45.0)

        total_score = round(base_w + climate_term + approach_bonus - rear_discount, 1)

        # Rationales
        v_rat = base_info.get("canonical_significance", f"Canonical alignment for {direction} face.")
        if is_approach:
            p_rat = (
                f"Directly faces the incoming {road_approach.approach_side} access road (bearing {road_approach.bearing_degrees:.0f} deg). "
                f"Provides unobstructed driveway ingress, clear driver sightlines, and direct pedestrian walkway connection."
            )
        elif road_approach.bearing_degrees is not None and angular_diff >= 135.0:
            p_rat = f"Faces away from the {road_approach.approach_side} approach road toward rear property boundary; requires perimeter pathway access."
        else:
            p_rat = f"Offers indirect orientation relative to {road_approach.approach_side} road; secondary internal porch circulation feasible."

        ranked.append({
            "direction": direction,
            "score": total_score,
            "vastu_rationale": v_rat,
            "practical_rationale": p_rat,
            "is_approach_side": is_approach
        })

    # Sort descending by score
    ranked.sort(key=lambda x: x["score"], reverse=True)

    return [RankedEntrance(**item) for item in ranked[:3]]


async def evaluate_vastu_advisory(
    lat: float,
    lon: float,
    elevation_m: float,
    elevation_samples: Optional[Dict[str, float]] = None
) -> Tuple[VastuAdvisory, List[str]]:
    """
    Generates deterministic Vastu and functional planning advisory.
    Returns (vastu_advisory_object, warnings).
    """
    warnings: List[str] = []

    # 1. Road approach
    road_approach, r_warn = await fetch_nearest_road_approach(lat, lon)
    if r_warn:
        warnings.append(r_warn)

    # 2. Ranked Entrances
    ranked_entrances = rank_entrances(road_approach)

    # 3. 3x3 Room Grid
    table = _load_vastu_table()
    room_grid_data = table.get("room_grid", [])
    room_grid = [RoomGridZone(**zone) for zone in room_grid_data]

    # 4. Slope Reading (real elevation samples when available)
    slope_reading = compute_slope_reading(elevation_m, lat, lon, elevation_samples=elevation_samples)

    # 5. Reconciliation Notes
    recon_data = table.get("reconciliation_principles", [])
    reconciliations = [ReconciliationItem(**item) for item in recon_data]

    advisory = VastuAdvisory(
        ranked_entrances=ranked_entrances,
        room_grid=room_grid,
        slope_reading=slope_reading,
        reconciliation_notes=reconciliations,
        road_approach=road_approach
    )

    return advisory, warnings
